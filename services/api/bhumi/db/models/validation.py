"""Validation rules, results and duplicate clusters."""

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
from sqlalchemy.orm import Mapped, mapped_column, relationship

from bhumi.db.base import Base, TimestampMixin, UUIDMixin


class ValidationRule(Base, UUIDMixin, TimestampMixin):
    """Rules are data, not code — an admin can add or disable one without a redeploy."""

    __tablename__ = "validation_rules"

    rule_key: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(200))
    category: Mapped[str] = mapped_column(String(32), index=True)
    description_en: Mapped[str | None] = mapped_column(Text)
    description_hi: Mapped[str | None] = mapped_column(Text)
    severity: Mapped[str] = mapped_column(String(16), index=True)

    applies_to_document_types: Mapped[list[str]] = mapped_column(JSONB, default=list)
    applies_to_states: Mapped[list[str]] = mapped_column(JSONB, default=list)
    requires_fields: Mapped[list[str]] = mapped_column(JSONB, default=list)

    expression: Mapped[str] = mapped_column(Text)
    params: Mapped[dict] = mapped_column(JSONB, default=dict)
    message_en: Mapped[str | None] = mapped_column(Text)
    message_hi: Mapped[str | None] = mapped_column(Text)
    fix_hint: Mapped[str | None] = mapped_column(Text)

    is_enabled: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
    version: Mapped[int] = mapped_column(Integer, default=1)
    execution_order: Mapped[int] = mapped_column(Integer, default=100)
    created_by: Mapped[uuid.UUID | None] = mapped_column(PGUUID(as_uuid=True))


class ValidationResult(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "validation_results"
    __table_args__ = (
        Index("ix_validation_record_status", "record_id", "status"),
        Index("ix_validation_rule_status", "rule_key", "status"),
    )

    record_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("land_records.id", ondelete="CASCADE"), index=True
    )
    rule_key: Mapped[str] = mapped_column(String(64), index=True)
    rule_version: Mapped[int] = mapped_column(Integer, default=1)

    status: Mapped[str] = mapped_column(String(16), index=True)
    severity: Mapped[str] = mapped_column(String(16))
    message: Mapped[str | None] = mapped_column(Text)
    fix_hint: Mapped[str | None] = mapped_column(Text)
    observed: Mapped[dict | None] = mapped_column(JSONB)
    affected_fields: Mapped[list[str]] = mapped_column(JSONB, default=list)

    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    resolved_by: Mapped[uuid.UUID | None] = mapped_column(PGUUID(as_uuid=True))
    resolution_note: Mapped[str | None] = mapped_column(Text)


class DuplicateCluster(Base, UUIDMixin, TimestampMixin):
    """Records suspected to describe the same parcel, grouped for a merge decision."""

    __tablename__ = "duplicate_clusters"

    cluster_key: Mapped[str] = mapped_column(String(200), index=True)
    match_type: Mapped[str] = mapped_column(String(24))     # EXACT_KEY | CONTENT_HASH | FUZZY
    score: Mapped[float] = mapped_column(Float, default=0.0)
    signals: Mapped[dict | None] = mapped_column(JSONB)

    status: Mapped[str] = mapped_column(String(24), default="OPEN", index=True)
    resolution: Mapped[str | None] = mapped_column(String(24))  # MERGED | KEPT_BOTH | REJECTED
    primary_record_id: Mapped[uuid.UUID | None] = mapped_column(PGUUID(as_uuid=True))
    resolved_by: Mapped[uuid.UUID | None] = mapped_column(PGUUID(as_uuid=True))
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    resolution_note: Mapped[str | None] = mapped_column(Text)

    members: Mapped[list["DuplicateMember"]] = relationship(
        back_populates="cluster", cascade="all, delete-orphan", lazy="selectin"
    )


class DuplicateMember(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "duplicate_members"

    cluster_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("duplicate_clusters.id", ondelete="CASCADE"), index=True
    )
    record_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("land_records.id", ondelete="CASCADE"), index=True
    )
    is_primary: Mapped[bool] = mapped_column(Boolean, default=False)
    similarity: Mapped[float | None] = mapped_column(Float)

    cluster: Mapped[DuplicateCluster] = relationship(back_populates="members")
