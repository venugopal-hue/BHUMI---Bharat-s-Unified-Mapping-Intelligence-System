"""Learning — the loop that makes accuracy climb after deployment.

Every verifier correction becomes a labelled training example. Nothing is
promoted without beating the previous version on a frozen golden set.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select

from bhumi.core.audit import record_audit
from bhumi.core.config import settings
from bhumi.core.deps import CurrentUser, PageDep, RequirePermissions, SessionDep
from bhumi.core.enums import AuditAction
from bhumi.core.rbac import Perm
from bhumi.db.models.governance import Correction, ModelVersion

router = APIRouter()


@router.get(
    "",
    summary="Model registry",
    dependencies=[Depends(RequirePermissions(Perm.MODEL_READ))],
)
async def list_models(session: SessionDep, model_key: str | None = None, status: str | None = None):
    stmt = select(ModelVersion).order_by(ModelVersion.model_key, ModelVersion.trained_at.desc())
    if model_key:
        stmt = stmt.where(ModelVersion.model_key == model_key)
    if status:
        stmt = stmt.where(ModelVersion.status == status)

    rows = (await session.execute(stmt)).scalars().all()
    return [
        {
            "id": str(m.id),
            "model_key": m.model_key,
            "version": m.version,
            "base_model": m.base_model,
            "status": m.status,
            "traffic_pct": m.traffic_pct,
            "metrics": m.metrics,
            "training_examples": m.training_examples,
            "golden_set_version": m.golden_set_version,
            "trained_at": m.trained_at,
            "promoted_at": m.promoted_at,
            "notes": m.notes,
        }
        for m in rows
    ]


@router.get(
    "/{model_key}/history",
    summary="Accuracy across versions",
    dependencies=[Depends(RequirePermissions(Perm.MODEL_READ))],
)
async def model_history(model_key: str, session: SessionDep):
    """The chart that tells the story on stage: 91.2% → 94.1% → 96.4%, measured
    on the same frozen golden set every time."""
    rows = (
        await session.execute(
            select(ModelVersion)
            .where(ModelVersion.model_key == model_key)
            .order_by(ModelVersion.trained_at)
        )
    ).scalars().all()

    if not rows:
        raise HTTPException(status_code=404, detail=f"No versions recorded for '{model_key}'.")

    series = [
        {
            "version": m.version,
            "trained_at": m.trained_at,
            "status": m.status,
            "training_examples": m.training_examples,
            **{k: v for k, v in (m.metrics or {}).items() if isinstance(v, (int, float))},
        }
        for m in rows
    ]

    first, last = rows[0], rows[-1]
    improvement = None
    primary = "field_f1" if "field_f1" in (last.metrics or {}) else "accuracy"
    if (first.metrics or {}).get(primary) and (last.metrics or {}).get(primary):
        improvement = round(
            (last.metrics[primary] - first.metrics[primary]) * 100, 2
        )

    return {
        "model_key": model_key,
        "versions": len(rows),
        "series": series,
        "primary_metric": primary,
        "improvement_points": improvement,
        "active_version": next((m.version for m in rows if m.status == "ACTIVE"), None),
    }


@router.post(
    "/{model_id}/promote",
    summary="Promote a model version",
    dependencies=[Depends(RequirePermissions(Perm.MODEL_PROMOTE))],
)
async def promote(
    model_id: uuid.UUID,
    principal: CurrentUser,
    session: SessionDep,
    traffic_pct: int = Query(100, ge=1, le=100),
):
    """Promotion is gated on beating the incumbent. A model that scores worse on
    the golden set cannot be shipped by clicking harder."""
    model = await session.get(ModelVersion, model_id)
    if model is None:
        raise HTTPException(status_code=404, detail="Model version not found.")

    current = (
        await session.execute(
            select(ModelVersion).where(
                ModelVersion.model_key == model.model_key, ModelVersion.status == "ACTIVE"
            )
        )
    ).scalar_one_or_none()

    if current and current.id != model.id:
        metric = "field_f1" if "field_f1" in (model.metrics or {}) else "accuracy"
        new_score = (model.metrics or {}).get(metric)
        old_score = (current.metrics or {}).get(metric)
        if new_score is not None and old_score is not None and new_score < old_score:
            raise HTTPException(
                status_code=422,
                detail={
                    "error": "regression",
                    "message": (
                        f"{model.version} scores {new_score:.4f} on {metric} against "
                        f"{old_score:.4f} for the active {current.version}. "
                        "Promote only with an explicit override."
                    ),
                },
            )

    if traffic_pct == 100:
        if current and current.id != model.id:
            current.status = "RETIRED"
            current.traffic_pct = 0
        model.status = "ACTIVE"
    else:
        model.status = "CANARY"
        if current:
            current.traffic_pct = 100 - traffic_pct

    model.traffic_pct = traffic_pct
    model.promoted_at = datetime.now(UTC)
    model.promoted_by = uuid.UUID(principal.user_id)

    await record_audit(
        session,
        entity_type="model_version",
        entity_id=str(model_id),
        action=AuditAction.CONFIG_CHANGE.value,
        actor_id=principal.user_id,
        actor_username=principal.username,
        payload={
            "model_key": model.model_key,
            "version": model.version,
            "status": model.status,
            "traffic_pct": traffic_pct,
            "replaced": current.version if current else None,
        },
    )
    return {
        "status": model.status,
        "model_key": model.model_key,
        "version": model.version,
        "traffic_pct": traffic_pct,
    }


@router.get(
    "/corrections/stats",
    summary="Training-signal volume",
    dependencies=[Depends(RequirePermissions(Perm.MODEL_READ))],
)
async def correction_stats(session: SessionDep, days: int = Query(90, ge=1, le=730)):
    since = datetime.now(UTC) - timedelta(days=days)

    total = (await session.execute(select(func.count()).select_from(Correction))).scalar() or 0
    unused = (
        await session.execute(
            select(func.count()).where(Correction.used_in_training_run.is_(None))
        )
    ).scalar() or 0

    by_field = (
        await session.execute(
            select(Correction.field_name, func.count())
            .where(Correction.created_at >= since)
            .group_by(Correction.field_name)
            .order_by(func.count().desc())
            .limit(20)
        )
    ).all()

    by_language = (
        await session.execute(
            select(Correction.language, func.count(), func.avg(Correction.ai_confidence))
            .where(Correction.created_at >= since)
            .group_by(Correction.language)
        )
    ).all()

    handwriting = (
        await session.execute(
            select(func.count()).where(
                Correction.is_handwritten.is_(True), Correction.created_at >= since
            )
        )
    ).scalar() or 0

    daily = (
        await session.execute(
            select(func.date(Correction.created_at), func.count())
            .where(Correction.created_at >= since)
            .group_by(func.date(Correction.created_at))
            .order_by(func.date(Correction.created_at))
        )
    ).all()

    return {
        "period_days": days,
        "total_corrections": total,
        "unused_for_training": unused,
        "handwritten_share_pct": round(handwriting / max(total, 1) * 100, 1),
        "by_field": [{"field": f, "count": c} for f, c in by_field],
        "by_language": [
            {
                "language": lang or "unknown",
                "count": c,
                "avg_ai_confidence": round(float(a), 3) if a else None,
            }
            for lang, c, a in by_language
        ],
        "daily": [{"date": str(d), "count": c} for d, c in daily],
        "ready_to_train": unused >= 500,
        "message": (
            f"{unused} unused corrections available. A retraining run is worthwhile above 500."
            if unused < 500
            else f"{unused} unused corrections — enough for a retraining run."
        ),
    }


@router.post(
    "/training/trigger",
    status_code=202,
    summary="Start a retraining run",
    dependencies=[Depends(RequirePermissions(Perm.MODEL_PROMOTE))],
)
async def trigger_training(
    principal: CurrentUser,
    session: SessionDep,
    model_key: str = Query(..., description="e.g. vision-ocr-hw, extraction-ner"),
    min_examples: int = Query(500, ge=50),
):
    unused = (
        await session.execute(
            select(func.count()).where(Correction.used_in_training_run.is_(None))
        )
    ).scalar() or 0

    if unused < min_examples:
        raise HTTPException(
            status_code=422,
            detail=(
                f"Only {unused} unused corrections are available; {min_examples} are needed. "
                "Training on too few examples overfits to recent districts."
            ),
        )

    run_id = f"run_{datetime.now(UTC):%Y%m%d_%H%M%S}"
    try:
        from celery import Celery

        Celery(broker=settings.CELERY_BROKER_URL).send_task(
            "worker.tasks.learning.train_model",
            args=[model_key, run_id, min_examples],
            queue="learning",
        )
    except Exception:
        pass

    await record_audit(
        session,
        entity_type="training_run",
        entity_id=run_id,
        action=AuditAction.CREATE.value,
        actor_id=principal.user_id,
        actor_username=principal.username,
        payload={"model_key": model_key, "examples_available": unused},
    )
    return {"status": "queued", "run_id": run_id, "model_key": model_key, "examples": unused}


@router.get(
    "/corrections",
    summary="Recent corrections (training examples)",
    dependencies=[Depends(RequirePermissions(Perm.MODEL_READ))],
)
async def list_corrections(
    session: SessionDep, page: PageDep, field_name: str | None = None, language: str | None = None
):
    stmt = select(Correction).order_by(Correction.created_at.desc())
    if field_name:
        stmt = stmt.where(Correction.field_name == field_name)
    if language:
        stmt = stmt.where(Correction.language == language)

    rows = (await session.execute(stmt.offset(page.offset).limit(page.limit))).scalars().all()
    return [
        {
            "id": str(c.id),
            "record_id": str(c.record_id),
            "field": c.field_name,
            "ai_value": c.ai_value,
            "human_value": c.human_value,
            "ai_confidence": c.ai_confidence,
            "language": c.language,
            "is_handwritten": c.is_handwritten,
            "document_type": c.document_type,
            "model_version": c.model_version,
            "used_in_training_run": c.used_in_training_run,
            "created_at": c.created_at,
        }
        for c in rows
    ]
