from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class QueueItemOut(BaseModel):
    id: str
    record_id: str
    document_id: str | None = None
    batch_id: str | None = None
    queue_type: str
    priority: int
    reason: str | None = None
    low_confidence_fields: list[str] = []
    confidence_overall: float | None = None
    status: str
    assigned_to: str | None = None
    locked_by: str | None = None
    locked_until: datetime | None = None
    sla_due_at: datetime | None = None
    is_sla_breached: bool = False
    requires_second_approval: bool = False
    created_at: datetime

    # Denormalized so the queue table renders without an N+1 fetch.
    survey_number: str | None = None
    owner_name: str | None = None
    village_id: str | None = None
    document_type: str | None = None
    source_language: str | None = None
    blocking_failures: int = 0

    @classmethod
    def from_models(cls, item: Any, record: Any | None) -> "QueueItemOut":
        from datetime import UTC

        return cls(
            id=str(item.id),
            record_id=str(item.record_id),
            document_id=str(item.document_id) if item.document_id else None,
            batch_id=str(item.batch_id) if item.batch_id else None,
            queue_type=item.queue_type,
            priority=item.priority,
            reason=item.reason,
            low_confidence_fields=item.low_confidence_fields or [],
            confidence_overall=item.confidence_overall,
            status=item.status,
            assigned_to=str(item.assigned_to) if item.assigned_to else None,
            locked_by=str(item.locked_by) if item.locked_by else None,
            locked_until=item.locked_until,
            sla_due_at=item.sla_due_at,
            is_sla_breached=bool(item.sla_due_at and item.sla_due_at < datetime.now(UTC)),
            requires_second_approval=item.requires_second_approval,
            created_at=item.created_at,
            survey_number=record.survey_number if record else None,
            owner_name=record.owner_name if record else None,
            village_id=str(record.village_id) if record and record.village_id else None,
            document_type=record.document_type if record else None,
            source_language=record.source_language if record else None,
            blocking_failures=record.blocking_failures if record else 0,
        )


class QueueStatsOut(BaseModel):
    by_type: dict[str, dict[str, float]] = {}
    total_open: int = 0
    sla_breaches: int = 0
    avg_handling_seconds: float | None = None


class ApproveRequest(BaseModel):
    comment: str | None = Field(None, max_length=1000)
    duration_ms: int | None = None
    override_blocking: bool = False


class RejectRequest(BaseModel):
    reason_code: str = Field(..., max_length=48)
    reason: str = Field(..., min_length=3, max_length=1000)
    duration_ms: int | None = None


class EscalateRequest(BaseModel):
    reason: str = Field(..., min_length=3, max_length=1000)
    assign_to: uuid.UUID | None = None


class BulkApproveRequest(BaseModel):
    batch_id: uuid.UUID | None = None
    min_confidence: float | None = Field(None, ge=0, le=1)
    limit: int = Field(500, ge=1, le=5000)
