"""Review — the human verification workflow.

This is where government throughput actually happens. The design goal for the
whole module is that a verifier clears a record in under a minute without
touching the mouse, and that nothing they do is ever lost or double-handled.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import and_, func, or_, select

from bhumi.core.audit import record_audit
from bhumi.core.config import settings
from bhumi.core.deps import CurrentUser, PageDep, RequirePermissions, SessionDep, client_ip
from bhumi.core.enums import (
    AuditAction,
    QueueStatus,
    QueueType,
    ReviewAction as ActionKind,
    VerificationStatus,
)
from bhumi.core.rbac import Perm, jurisdiction_filter
from bhumi.db.models.records import LandRecord
from bhumi.db.models.review import ReviewAction, ReviewQueueItem
from bhumi.modules.review.schemas import (
    ApproveRequest,
    BulkApproveRequest,
    EscalateRequest,
    QueueItemOut,
    QueueStatsOut,
    RejectRequest,
)

router = APIRouter()


def _now() -> datetime:
    return datetime.now(UTC)


# ── Queue ───────────────────────────────────────────────────────────
@router.get("/queue", response_model=list[QueueItemOut], summary="Review work list")
async def list_queue(
    principal: CurrentUser,
    session: SessionDep,
    page: PageDep,
    queue_type: Annotated[str | None, Query()] = None,
    assigned_to_me: bool = False,
    sort: str = Query("priority", pattern="^(priority|confidence|sla|age)$"),
):
    stmt = select(ReviewQueueItem, LandRecord).join(
        LandRecord, LandRecord.id == ReviewQueueItem.record_id
    ).where(ReviewQueueItem.status.in_([QueueStatus.OPEN.value, QueueStatus.CLAIMED.value]))

    for clause in jurisdiction_filter(principal, ReviewQueueItem):
        stmt = stmt.where(clause)
    if queue_type:
        stmt = stmt.where(ReviewQueueItem.queue_type == queue_type)
    if assigned_to_me:
        stmt = stmt.where(
            or_(
                ReviewQueueItem.assigned_to == uuid.UUID(principal.user_id),
                ReviewQueueItem.locked_by == uuid.UUID(principal.user_id),
            )
        )

    order = {
        "priority": (ReviewQueueItem.priority.desc(), ReviewQueueItem.created_at.asc()),
        "confidence": (ReviewQueueItem.confidence_overall.asc(),),
        "sla": (ReviewQueueItem.sla_due_at.asc().nulls_last(),),
        "age": (ReviewQueueItem.created_at.asc(),),
    }[sort]
    stmt = stmt.order_by(*order)

    rows = (await session.execute(stmt.offset(page.offset).limit(page.limit))).all()
    return [QueueItemOut.from_models(item, rec) for item, rec in rows]


@router.get("/queue/stats", response_model=QueueStatsOut, summary="Queue depth and SLA")
async def queue_stats(principal: CurrentUser, session: SessionDep):
    stmt = select(
        ReviewQueueItem.queue_type,
        func.count(),
        func.avg(ReviewQueueItem.confidence_overall),
    ).where(ReviewQueueItem.status == QueueStatus.OPEN.value).group_by(ReviewQueueItem.queue_type)
    for clause in jurisdiction_filter(principal, ReviewQueueItem):
        stmt = stmt.where(clause)
    rows = (await session.execute(stmt)).all()

    breach_stmt = select(func.count()).where(
        ReviewQueueItem.status == QueueStatus.OPEN.value,
        ReviewQueueItem.sla_due_at < _now(),
    )
    for clause in jurisdiction_filter(principal, ReviewQueueItem):
        breach_stmt = breach_stmt.where(clause)
    breaches = (await session.execute(breach_stmt)).scalar() or 0

    handled_stmt = select(func.avg(ReviewQueueItem.handling_seconds)).where(
        ReviewQueueItem.status == QueueStatus.COMPLETED.value,
        ReviewQueueItem.completed_at > _now() - timedelta(days=7),
    )
    avg_handling = (await session.execute(handled_stmt)).scalar()

    return QueueStatsOut(
        by_type={t: {"count": c, "avg_confidence": round(float(a or 0), 3)} for t, c, a in rows},
        total_open=sum(c for _, c, _ in rows),
        sla_breaches=breaches,
        avg_handling_seconds=round(float(avg_handling), 1) if avg_handling else None,
    )


@router.get("/queue/next", response_model=QueueItemOut | None, summary="Claim the next record")
async def next_in_queue(
    principal: CurrentUser,
    session: SessionDep,
    queue_type: str | None = None,
):
    """Powers the "Start reviewing" button and auto-advance after approval.
    ``FOR UPDATE SKIP LOCKED`` is what keeps ten verifiers from colliding on the
    same record without any of them waiting."""
    stmt = (
        select(ReviewQueueItem)
        .where(
            ReviewQueueItem.status == QueueStatus.OPEN.value,
            or_(
                ReviewQueueItem.locked_until.is_(None),
                ReviewQueueItem.locked_until < _now(),
            ),
        )
        .order_by(ReviewQueueItem.priority.desc(), ReviewQueueItem.created_at.asc())
        .limit(1)
        .with_for_update(skip_locked=True)
    )
    for clause in jurisdiction_filter(principal, ReviewQueueItem):
        stmt = stmt.where(clause)
    if queue_type:
        stmt = stmt.where(ReviewQueueItem.queue_type == queue_type)

    item = (await session.execute(stmt)).scalar_one_or_none()
    if item is None:
        return None

    item.status = QueueStatus.CLAIMED.value
    item.locked_by = uuid.UUID(principal.user_id)
    item.locked_until = _now() + timedelta(seconds=settings.REVIEW_LOCK_TTL_SECONDS)
    item.assigned_to = item.assigned_to or uuid.UUID(principal.user_id)

    record = await session.get(LandRecord, item.record_id)
    if record:
        record.verification_status = VerificationStatus.IN_REVIEW.value

    session.add(
        ReviewAction(
            record_id=item.record_id,
            queue_item_id=item.id,
            user_id=uuid.UUID(principal.user_id),
            action=ActionKind.CLAIM.value,
        )
    )
    return QueueItemOut.from_models(item, record)


# ── Locks ───────────────────────────────────────────────────────────
@router.post(
    "/{record_id}/claim",
    summary="Lock a record for review",
    dependencies=[Depends(RequirePermissions(Perm.REVIEW_CLAIM))],
)
async def claim(record_id: uuid.UUID, principal: CurrentUser, session: SessionDep):
    item = await _get_queue_item(session, record_id)
    me = uuid.UUID(principal.user_id)

    if item.locked_by and item.locked_by != me and item.locked_until and item.locked_until > _now():
        raise HTTPException(
            status_code=409,
            detail={
                "error": "record_locked",
                "message": "Another verifier is working on this record.",
                "locked_until": item.locked_until.isoformat(),
            },
        )

    item.status = QueueStatus.CLAIMED.value
    item.locked_by = me
    item.locked_until = _now() + timedelta(seconds=settings.REVIEW_LOCK_TTL_SECONDS)

    record = await session.get(LandRecord, record_id)
    if record:
        record.verification_status = VerificationStatus.IN_REVIEW.value

    session.add(
        ReviewAction(
            record_id=record_id,
            queue_item_id=item.id,
            user_id=me,
            action=ActionKind.CLAIM.value,
        )
    )
    return {"locked_until": item.locked_until, "record_id": str(record_id)}


@router.post("/{record_id}/heartbeat", summary="Extend the lock")
async def heartbeat(record_id: uuid.UUID, principal: CurrentUser, session: SessionDep):
    item = await _get_queue_item(session, record_id)
    if item.locked_by != uuid.UUID(principal.user_id):
        raise HTTPException(status_code=409, detail="You do not hold the lock on this record.")
    item.locked_until = _now() + timedelta(seconds=settings.REVIEW_LOCK_TTL_SECONDS)
    return {"locked_until": item.locked_until}


@router.post("/{record_id}/release", status_code=204, summary="Release the lock")
async def release(record_id: uuid.UUID, principal: CurrentUser, session: SessionDep):
    item = await _get_queue_item(session, record_id)
    if item.locked_by == uuid.UUID(principal.user_id):
        item.locked_by = None
        item.locked_until = None
        item.status = QueueStatus.OPEN.value
        record = await session.get(LandRecord, record_id)
        if record and record.verification_status == VerificationStatus.IN_REVIEW.value:
            record.verification_status = VerificationStatus.PENDING_REVIEW.value


# ── Decisions ───────────────────────────────────────────────────────
@router.post(
    "/{record_id}/approve",
    summary="Approve a record",
    dependencies=[Depends(RequirePermissions(Perm.REVIEW_APPROVE))],
)
async def approve(
    record_id: uuid.UUID,
    payload: ApproveRequest,
    principal: CurrentUser,
    session: SessionDep,
    request: Request,
):
    item = await _get_queue_item(session, record_id)
    record = await session.get(LandRecord, record_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Record not found.")

    me = uuid.UUID(principal.user_id)
    if item.locked_by and item.locked_by != me and item.locked_until and item.locked_until > _now():
        raise HTTPException(status_code=409, detail="Another verifier holds this record.")

    if record.blocking_failures and not payload.override_blocking:
        raise HTTPException(
            status_code=422,
            detail={
                "error": "blocking_validation_failures",
                "count": record.blocking_failures,
                "message": "Resolve the blocking validation failures before approving.",
            },
        )

    # Maker–checker: high-value records need a second, different approver.
    if item.requires_second_approval and item.first_approver is None:
        item.first_approver = me
        item.status = QueueStatus.OPEN.value
        item.queue_type = QueueType.MAKER_CHECKER.value
        item.locked_by = None
        item.locked_until = None
        session.add(
            ReviewAction(
                record_id=record_id,
                queue_item_id=item.id,
                user_id=me,
                action=ActionKind.APPROVE.value,
                comment="First approval — awaiting checker.",
                duration_ms=payload.duration_ms,
            )
        )
        return {
            "status": "awaiting_second_approval",
            "message": "First approval recorded. A second approver must confirm this record.",
        }

    if item.requires_second_approval and item.first_approver == me:
        raise HTTPException(
            status_code=409,
            detail="The checker must be a different officer from the maker.",
        )

    now = _now()
    record.verification_status = VerificationStatus.VERIFIED.value
    record.verified_at = now
    record.verified_by = me

    item.status = QueueStatus.COMPLETED.value
    item.completed_at = now
    item.completed_by = me
    item.locked_by = None
    item.locked_until = None
    if payload.duration_ms:
        item.handling_seconds = round(payload.duration_ms / 1000)

    session.add(
        ReviewAction(
            record_id=record_id,
            queue_item_id=item.id,
            user_id=me,
            action=ActionKind.APPROVE.value,
            comment=payload.comment,
            duration_ms=payload.duration_ms,
        )
    )

    await record_audit(
        session,
        entity_type="land_record",
        entity_id=str(record_id),
        action=AuditAction.APPROVE.value,
        actor_id=principal.user_id,
        actor_username=principal.username,
        actor_roles=[r.value for r in principal.roles],
        actor_ip=client_ip(request),
        payload={
            "survey_number": record.survey_number,
            "confidence": record.confidence_overall,
            "corrections": record.correction_count,
        },
    )

    _queue_publish(str(record_id))
    return {
        "status": "verified",
        "record_id": str(record_id),
        "verified_at": now,
        "corrections_applied": record.correction_count,
    }


@router.post(
    "/{record_id}/reject",
    summary="Reject a record",
    dependencies=[Depends(RequirePermissions(Perm.REVIEW_APPROVE))],
)
async def reject(
    record_id: uuid.UUID,
    payload: RejectRequest,
    principal: CurrentUser,
    session: SessionDep,
    request: Request,
):
    item = await _get_queue_item(session, record_id)
    record = await session.get(LandRecord, record_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Record not found.")

    record.verification_status = VerificationStatus.REJECTED.value
    record.rejection_reason = payload.reason
    item.status = QueueStatus.COMPLETED.value
    item.completed_at = _now()
    item.completed_by = uuid.UUID(principal.user_id)
    item.locked_by = None
    item.locked_until = None

    session.add(
        ReviewAction(
            record_id=record_id,
            queue_item_id=item.id,
            user_id=uuid.UUID(principal.user_id),
            action=ActionKind.REJECT.value,
            reason_code=payload.reason_code,
            comment=payload.reason,
            duration_ms=payload.duration_ms,
        )
    )
    await record_audit(
        session,
        entity_type="land_record",
        entity_id=str(record_id),
        action=AuditAction.REJECT.value,
        actor_id=principal.user_id,
        actor_username=principal.username,
        actor_ip=client_ip(request),
        payload={"reason_code": payload.reason_code, "reason": payload.reason},
    )
    return {"status": "rejected", "record_id": str(record_id)}


@router.post(
    "/{record_id}/escalate",
    summary="Escalate to a supervisor",
    dependencies=[Depends(RequirePermissions(Perm.REVIEW_ESCALATE))],
)
async def escalate(
    record_id: uuid.UUID,
    payload: EscalateRequest,
    principal: CurrentUser,
    session: SessionDep,
):
    item = await _get_queue_item(session, record_id)
    item.queue_type = QueueType.EXCEPTION.value
    item.priority = min(100, item.priority + 30)
    item.status = QueueStatus.OPEN.value
    item.assigned_to = payload.assign_to
    item.locked_by = None
    item.locked_until = None

    session.add(
        ReviewAction(
            record_id=record_id,
            queue_item_id=item.id,
            user_id=uuid.UUID(principal.user_id),
            action=ActionKind.ESCALATE.value,
            comment=payload.reason,
        )
    )
    return {"status": "escalated", "priority": item.priority}


@router.post(
    "/bulk-approve",
    summary="Approve every high-confidence record in a batch",
    dependencies=[Depends(RequirePermissions(Perm.REVIEW_BULK_APPROVE))],
)
async def bulk_approve(
    payload: BulkApproveRequest,
    principal: CurrentUser,
    session: SessionDep,
    request: Request,
):
    """A supervisor clearing a clean batch should not click 400 times. Only
    records above the threshold with zero blocking failures are eligible."""
    threshold = payload.min_confidence or settings.AUTO_APPROVE_THRESHOLD
    stmt = (
        select(ReviewQueueItem, LandRecord)
        .join(LandRecord, LandRecord.id == ReviewQueueItem.record_id)
        .where(
            ReviewQueueItem.status == QueueStatus.OPEN.value,
            LandRecord.confidence_overall >= threshold,
            LandRecord.blocking_failures == 0,
        )
    )
    for clause in jurisdiction_filter(principal, ReviewQueueItem):
        stmt = stmt.where(clause)
    if payload.batch_id:
        stmt = stmt.where(ReviewQueueItem.batch_id == payload.batch_id)

    rows = (await session.execute(stmt.limit(payload.limit))).all()

    now = _now()
    me = uuid.UUID(principal.user_id)
    approved: list[str] = []
    for item, record in rows:
        record.verification_status = VerificationStatus.VERIFIED.value
        record.verified_at = now
        record.verified_by = me
        item.status = QueueStatus.COMPLETED.value
        item.completed_at = now
        item.completed_by = me
        session.add(
            ReviewAction(
                record_id=record.id,
                queue_item_id=item.id,
                user_id=me,
                action=ActionKind.APPROVE.value,
                comment=f"Bulk approval at ≥{threshold:.0%} confidence.",
            )
        )
        approved.append(str(record.id))

    await record_audit(
        session,
        entity_type="review",
        action=AuditAction.APPROVE.value,
        actor_id=principal.user_id,
        actor_username=principal.username,
        actor_ip=client_ip(request),
        payload={"bulk": True, "count": len(approved), "threshold": threshold},
    )
    for rid in approved:
        _queue_publish(rid)

    return {"approved": len(approved), "threshold": threshold, "record_ids": approved}


# ── Helpers ─────────────────────────────────────────────────────────
async def _get_queue_item(session, record_id: uuid.UUID) -> ReviewQueueItem:
    item = (
        await session.execute(
            select(ReviewQueueItem)
            .where(ReviewQueueItem.record_id == record_id)
            .order_by(ReviewQueueItem.created_at.desc())
            .limit(1)
        )
    ).scalar_one_or_none()
    if item is None:
        raise HTTPException(status_code=404, detail="This record is not in a review queue.")
    return item


def _queue_publish(record_id: str) -> None:
    try:
        from celery import Celery

        Celery(broker=settings.CELERY_BROKER_URL).send_task(
            "worker.tasks.publish.publish_record", args=[record_id], queue="publish"
        )
    except Exception:
        import structlog

        structlog.get_logger().warning("publish_enqueue_failed", record_id=record_id)
