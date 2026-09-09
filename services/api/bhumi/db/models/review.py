"""Review queues, locks and the action log that feeds the Learning module."""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from bhumi.core.enums import QueueStatus, QueueType
from bhumi.db.base import Base, TimestampMixin, UUIDMixin


class ReviewQueueItem(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "review_queue"
    __table_args__ = (
        Index("ix_queue_pick", "status", "queue_type", "priority", "created_at"),
        Index("ix_queue_assignee", "assigned_to", "status"),
        Index("ix_queue_sla", "status", "sla_due_at"),
    )

    record_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("land_records.id", ondelete="CASCADE"), index=True
    )
    document_id: Mapped[uuid.UUID | None] = mapped_column(PGUUID(as_uuid=True), index=True)
    batch_id: Mapped[uuid.UUID | None] = mapped_column(PGUUID(as_uuid=True), index=True)

    # Denormalized for ABAC filtering without a join.
    state_id: Mapped[uuid.UUID | None] = mapped_column(PGUUID(as_uuid=True), index=True)
    district_id: Mapped[uuid.UUID | None] = mapped_column(PGUUID(as_uuid=True), index=True)
    tehsil_id: Mapped[uuid.UUID | None] = mapped_column(PGUUID(as_uuid=True), index=True)
    village_id: Mapped[uuid.UUID | None] = mapped_column(PGUUID(as_uuid=True), index=True)

    queue_type: Mapped[str] = mapped_column(String(24), default=QueueType.STANDARD.value, index=True)
    priority: Mapped[int] = mapped_column(Integer, default=50, index=True)
    reason: Mapped[str | None] = mapped_column(String(200))
    low_confidence_fields: Mapped[list[str]] = mapped_column(JSONB, default=list)
    confidence_overall: Mapped[float | None] = mapped_column(Float)

    status: Mapped[str] = mapped_column(String(16), default=QueueStatus.OPEN.value, index=True)
    assigned_to: Mapped[uuid.UUID | None] = mapped_column(PGUUID(as_uuid=True))
    locked_by: Mapped[uuid.UUID | None] = mapped_column(PGUUID(as_uuid=True))
    locked_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    sla_due_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    completed_by: Mapped[uuid.UUID | None] = mapped_column(PGUUID(as_uuid=True))
    handling_seconds: Mapped[int | None] = mapped_column(Integer)

    requires_second_approval: Mapped[bool] = mapped_column(Boolean, default=False)
    first_approver: Mapped[uuid.UUID | None] = mapped_column(PGUUID(as_uuid=True))

    @property
    def is_locked(self) -> bool:
        from datetime import UTC

        return bool(self.locked_until and self.locked_until > datetime.now(UTC))


class ReviewAction(Base, UUIDMixin, TimestampMixin):
    """Every keystroke that matters. Also the raw material for retraining."""

    __tablename__ = "review_actions"
    __table_args__ = (
        Index("ix_review_actions_record", "record_id", "created_at"),
        Index("ix_review_actions_user", "user_id", "created_at"),
    )

    record_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("land_records.id", ondelete="CASCADE"), index=True
    )
    queue_item_id: Mapped[uuid.UUID | None] = mapped_column(PGUUID(as_uuid=True))
    user_id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), index=True)

    action: Mapped[str] = mapped_column(String(32), index=True)
    field_name: Mapped[str | None] = mapped_column(String(64))
    old_value: Mapped[str | None] = mapped_column(Text)
    new_value: Mapped[str | None] = mapped_column(Text)
    comment: Mapped[str | None] = mapped_column(Text)
    reason_code: Mapped[str | None] = mapped_column(String(48))
    duration_ms: Mapped[int | None] = mapped_column(Integer)
    client_meta: Mapped[dict | None] = mapped_column(JSONB)
