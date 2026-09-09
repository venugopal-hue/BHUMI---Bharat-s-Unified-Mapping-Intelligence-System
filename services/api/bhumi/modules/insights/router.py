"""Insights — dashboards for every level of administration.

Numbers here are measured, not estimated: accuracy comes from actual verifier
corrections against a frozen golden set, never from a self-reported score.
"""

from __future__ import annotations

import uuid
from datetime import UTC, date, datetime, timedelta
from typing import Any

from fastapi import APIRouter, Query
from sqlalchemy import Float, cast, func, select

from bhumi.core.deps import CurrentUser, SessionDep
from bhumi.core.enums import DocumentStatus, QueueStatus, VerificationStatus
from bhumi.core.rbac import jurisdiction_filter
from bhumi.db.models.documents import Batch, Document, DocumentPage
from bhumi.db.models.governance import Correction
from bhumi.db.models.jurisdiction import District, State, Tehsil, Village
from bhumi.db.models.records import LandRecord, RecordField
from bhumi.db.models.review import ReviewAction, ReviewQueueItem
from bhumi.db.models.validation import ValidationResult

router = APIRouter()


def _since(days: int) -> datetime:
    return datetime.now(UTC) - timedelta(days=days)


@router.get("/overview", summary="Headline KPIs")
async def overview(principal: CurrentUser, session: SessionDep, days: int = Query(30, ge=1, le=730)):
    async def count(model, *where):
        stmt = select(func.count()).select_from(model)
        for clause in jurisdiction_filter(principal, model):
            stmt = stmt.where(clause)
        for w in where:
            stmt = stmt.where(w)
        return (await session.execute(stmt)).scalar() or 0

    documents = await count(Document)
    pages = (
        await session.execute(select(func.coalesce(func.sum(Document.page_count), 0)))
    ).scalar() or 0
    records = await count(LandRecord)
    verified = await count(
        LandRecord,
        LandRecord.verification_status.in_(
            [VerificationStatus.VERIFIED.value, VerificationStatus.AUTO_APPROVED.value]
        ),
    )
    auto_approved = await count(
        LandRecord, LandRecord.verification_status == VerificationStatus.AUTO_APPROVED.value
    )
    pending = await count(
        LandRecord,
        LandRecord.verification_status.in_(
            [VerificationStatus.PENDING_REVIEW.value, VerificationStatus.IN_REVIEW.value]
        ),
    )
    failed = await count(Document, Document.status == DocumentStatus.FAILED.value)

    avg_conf_stmt = select(func.avg(LandRecord.confidence_overall))
    for clause in jurisdiction_filter(principal, LandRecord):
        avg_conf_stmt = avg_conf_stmt.where(clause)
    avg_confidence = (await session.execute(avg_conf_stmt)).scalar()

    recent = await count(LandRecord, LandRecord.created_at >= _since(days))
    prior = await count(
        LandRecord,
        LandRecord.created_at >= _since(days * 2),
        LandRecord.created_at < _since(days),
    )

    return {
        "documents_processed": documents,
        "pages_processed": int(pages),
        "records_extracted": records,
        "records_verified": verified,
        "records_pending": pending,
        "documents_failed": failed,
        "straight_through_rate_pct": round(auto_approved / records * 100, 1) if records else 0.0,
        "verification_rate_pct": round(verified / records * 100, 1) if records else 0.0,
        "avg_confidence": round(float(avg_confidence), 4) if avg_confidence else 0.0,
        "period_days": days,
        "records_this_period": recent,
        "records_prior_period": prior,
        "trend_pct": round((recent - prior) / prior * 100, 1) if prior else None,
        "generated_at": datetime.now(UTC),
    }


@router.get("/progress", summary="Digitization progress by jurisdiction")
async def progress(
    principal: CurrentUser,
    session: SessionDep,
    level: str = Query("district", pattern="^(state|district|tehsil|village)$"),
    parent_id: uuid.UUID | None = None,
):
    """Drives the choropleth drilldown: state → district → tehsil → village."""
    model, name_col, id_col, parent_col = {
        "state": (State, State.name_en, LandRecord.state_id, None),
        "district": (District, District.name_en, LandRecord.district_id, District.state_id),
        "tehsil": (Tehsil, Tehsil.name_en, LandRecord.tehsil_id, Tehsil.district_id),
        "village": (Village, Village.name_en, LandRecord.village_id, Village.tehsil_id),
    }[level]

    verified_case = func.count().filter(
        LandRecord.verification_status.in_(
            [VerificationStatus.VERIFIED.value, VerificationStatus.AUTO_APPROVED.value]
        )
    )
    pending_case = func.count().filter(
        LandRecord.verification_status.in_(
            [VerificationStatus.PENDING_REVIEW.value, VerificationStatus.IN_REVIEW.value]
        )
    )

    stmt = (
        select(
            model.id,
            name_col,
            model.name_local,
            model.lgd_code,
            func.count(LandRecord.id).label("total"),
            verified_case.label("verified"),
            pending_case.label("pending"),
            func.avg(LandRecord.confidence_overall).label("avg_confidence"),
        )
        .select_from(model)
        .outerjoin(LandRecord, id_col == model.id)
        .group_by(model.id, name_col, model.name_local, model.lgd_code)
        .order_by(func.count(LandRecord.id).desc())
    )
    if parent_id is not None and parent_col is not None:
        stmt = stmt.where(parent_col == parent_id)

    rows = (await session.execute(stmt)).all()
    return {
        "level": level,
        "parent_id": str(parent_id) if parent_id else None,
        "items": [
            {
                "id": str(r.id),
                "name": r[1],
                "name_local": r[2],
                "lgd_code": r[3],
                "total": r.total,
                "verified": r.verified,
                "pending": r.pending,
                "progress_pct": round(r.verified / r.total * 100, 1) if r.total else 0.0,
                "avg_confidence": round(float(r.avg_confidence), 3) if r.avg_confidence else None,
            }
            for r in rows
        ],
    }


@router.get("/accuracy", summary="Field-level accuracy and correction rates")
async def accuracy(principal: CurrentUser, session: SessionDep, days: int = Query(90, ge=1, le=730)):
    """Correction rate per field is the honest accuracy signal: how often a
    human had to change what the model produced."""
    total_by_field = dict(
        (
            await session.execute(
                select(RecordField.field_name, func.count()).group_by(RecordField.field_name)
            )
        ).all()
    )
    corrected_by_field = dict(
        (
            await session.execute(
                select(Correction.field_name, func.count())
                .where(Correction.created_at >= _since(days))
                .group_by(Correction.field_name)
            )
        ).all()
    )

    fields = []
    for name, total in sorted(total_by_field.items(), key=lambda kv: -kv[1]):
        corrected = corrected_by_field.get(name, 0)
        fields.append(
            {
                "field": name,
                "extracted": total,
                "corrected": corrected,
                "correction_rate_pct": round(corrected / total * 100, 2) if total else 0.0,
                "accuracy_pct": round((1 - corrected / total) * 100, 2) if total else None,
            }
        )

    by_language = (
        await session.execute(
            select(
                Correction.language,
                func.count(),
                func.count().filter(Correction.is_handwritten.is_(True)),
            )
            .where(Correction.created_at >= _since(days))
            .group_by(Correction.language)
        )
    ).all()

    histogram = (
        await session.execute(
            select(
                func.width_bucket(cast(LandRecord.confidence_overall, Float), 0, 1, 10).label("bucket"),
                func.count(),
            ).group_by("bucket").order_by("bucket")
        )
    ).all()

    return {
        "period_days": days,
        "fields": fields,
        "by_language": [
            {"language": lang or "unknown", "corrections": n, "handwritten": hw}
            for lang, n, hw in by_language
        ],
        "confidence_histogram": [
            {"range": f"{(b - 1) / 10:.1f}–{b / 10:.1f}", "count": c}
            for b, c in histogram
            if b is not None
        ],
        "total_corrections": sum(corrected_by_field.values()),
    }


@router.get("/operations", summary="Throughput, latency and queue health")
async def operations(principal: CurrentUser, session: SessionDep, days: int = Query(7, ge=1, le=90)):
    by_status = dict(
        (
            await session.execute(
                select(Document.status, func.count()).group_by(Document.status)
            )
        ).all()
    )

    daily = (
        await session.execute(
            select(func.date(Document.created_at), func.count(), func.sum(Document.page_count))
            .where(Document.created_at >= _since(days))
            .group_by(func.date(Document.created_at))
            .order_by(func.date(Document.created_at))
        )
    ).all()

    latency = (
        await session.execute(
            select(
                func.avg(
                    func.extract(
                        "epoch", Document.processing_finished_at - Document.processing_started_at
                    )
                ),
                func.percentile_cont(0.95).within_group(
                    func.extract(
                        "epoch", Document.processing_finished_at - Document.processing_started_at
                    )
                ),
            ).where(Document.processing_finished_at.is_not(None))
        )
    ).first()

    queue_depth = dict(
        (
            await session.execute(
                select(ReviewQueueItem.queue_type, func.count())
                .where(ReviewQueueItem.status == QueueStatus.OPEN.value)
                .group_by(ReviewQueueItem.queue_type)
            )
        ).all()
    )

    failures = (
        await session.execute(
            select(Document.error_code, func.count())
            .where(Document.status == DocumentStatus.FAILED.value)
            .group_by(Document.error_code)
            .order_by(func.count().desc())
            .limit(15)
        )
    ).all()

    quality = (
        await session.execute(
            select(func.avg(DocumentPage.quality_score), func.min(DocumentPage.quality_score))
        )
    ).first()

    return {
        "documents_by_status": by_status,
        "daily_throughput": [
            {"date": str(d), "documents": n, "pages": int(p or 0)} for d, n, p in daily
        ],
        "avg_processing_seconds": round(float(latency[0]), 2) if latency and latency[0] else None,
        "p95_processing_seconds": round(float(latency[1]), 2) if latency and latency[1] else None,
        "queue_depth": queue_depth,
        "top_failures": [{"error_code": e or "UNKNOWN", "count": c} for e, c in failures],
        "avg_page_quality": round(float(quality[0]), 1) if quality and quality[0] else None,
        "worst_page_quality": quality[1] if quality else None,
    }


@router.get("/verification", summary="Verifier workload and handling times")
async def verification(principal: CurrentUser, session: SessionDep, days: int = Query(30, ge=1, le=365)):
    leaderboard = (
        await session.execute(
            select(
                ReviewQueueItem.completed_by,
                func.count(),
                func.avg(ReviewQueueItem.handling_seconds),
            )
            .where(
                ReviewQueueItem.status == QueueStatus.COMPLETED.value,
                ReviewQueueItem.completed_at >= _since(days),
            )
            .group_by(ReviewQueueItem.completed_by)
            .order_by(func.count().desc())
            .limit(25)
        )
    ).all()

    breaches = (
        await session.execute(
            select(func.count()).where(
                ReviewQueueItem.status == QueueStatus.OPEN.value,
                ReviewQueueItem.sla_due_at < datetime.now(UTC),
            )
        )
    ).scalar() or 0

    aging = (
        await session.execute(
            select(
                func.count().filter(ReviewQueueItem.created_at >= _since(1)).label("under_1d"),
                func.count()
                .filter(
                    ReviewQueueItem.created_at < _since(1),
                    ReviewQueueItem.created_at >= _since(3),
                )
                .label("one_to_three_d"),
                func.count()
                .filter(
                    ReviewQueueItem.created_at < _since(3),
                    ReviewQueueItem.created_at >= _since(7),
                )
                .label("three_to_seven_d"),
                func.count().filter(ReviewQueueItem.created_at < _since(7)).label("over_7d"),
            ).where(ReviewQueueItem.status == QueueStatus.OPEN.value)
        )
    ).first()

    edits = (
        await session.execute(
            select(func.count())
            .select_from(ReviewAction)
            .where(ReviewAction.action == "FIELD_EDIT", ReviewAction.created_at >= _since(days))
        )
    ).scalar() or 0

    return {
        "period_days": days,
        "verifiers": [
            {
                "user_id": str(u) if u else None,
                "records_completed": n,
                "avg_handling_seconds": round(float(a), 1) if a else None,
            }
            for u, n, a in leaderboard
        ],
        "sla_breaches": breaches,
        "queue_aging": dict(aging._mapping) if aging else {},
        "field_edits": edits,
    }


@router.get("/errors", summary="Validation failures and exceptions")
async def errors(principal: CurrentUser, session: SessionDep, days: int = Query(30, ge=1, le=365)):
    by_rule = (
        await session.execute(
            select(
                ValidationResult.rule_key,
                ValidationResult.severity,
                func.count(),
            )
            .where(
                ValidationResult.status.in_(["FAIL", "WARN"]),
                ValidationResult.created_at >= _since(days),
            )
            .group_by(ValidationResult.rule_key, ValidationResult.severity)
            .order_by(func.count().desc())
            .limit(30)
        )
    ).all()

    rescan = (
        await session.execute(
            select(func.count()).where(Document.status == DocumentStatus.RESCAN_NEEDED.value)
        )
    ).scalar() or 0

    return {
        "period_days": days,
        "top_validation_failures": [
            {"rule": r, "severity": s, "count": c} for r, s, c in by_rule
        ],
        "documents_needing_rescan": rescan,
    }


@router.get("/batches/summary", summary="Batch progress roll-up")
async def batch_summary(principal: CurrentUser, session: SessionDep, limit: int = 20):
    stmt = select(Batch).order_by(Batch.created_at.desc()).limit(limit)
    for clause in jurisdiction_filter(principal, Batch):
        stmt = stmt.where(clause)
    rows = (await session.execute(stmt)).scalars().all()
    return [
        {
            "id": str(b.id),
            "name": b.name,
            "status": b.status,
            "total_documents": b.total_documents,
            "processed_documents": b.processed_documents,
            "failed_documents": b.failed_documents,
            "progress_pct": b.progress_pct,
            "created_at": b.created_at,
        }
        for b in rows
    ]
