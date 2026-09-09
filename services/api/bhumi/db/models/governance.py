"""Vault (audit chain, document access), Integrations (sync, webhooks),
Learning (corrections, model registry) and notifications."""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import (
    BigInteger,
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

from bhumi.db.base import Base, TimestampMixin, UUIDMixin


# ── Vault ───────────────────────────────────────────────────────────
class AuditLog(Base, TimestampMixin):
    """Append-only, hash-chained. Each entry commits to the previous one, so any
    edit or deletion anywhere in the history breaks the chain verifiably."""

    __tablename__ = "audit_log"
    __table_args__ = (
        Index("ix_audit_entity", "entity_type", "entity_id", "created_at"),
        Index("ix_audit_actor", "actor_id", "created_at"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    actor_id: Mapped[uuid.UUID | None] = mapped_column(PGUUID(as_uuid=True), index=True)
    actor_username: Mapped[str | None] = mapped_column(String(64))
    actor_ip: Mapped[str | None] = mapped_column(String(64))
    actor_roles: Mapped[list[str]] = mapped_column(JSONB, default=list)

    entity_type: Mapped[str] = mapped_column(String(48), index=True)
    entity_id: Mapped[str | None] = mapped_column(String(64), index=True)
    action: Mapped[str] = mapped_column(String(32), index=True)

    payload: Mapped[dict | None] = mapped_column(JSONB)
    payload_hash: Mapped[str] = mapped_column(String(64))
    prev_hash: Mapped[str | None] = mapped_column(String(64))
    chain_hash: Mapped[str] = mapped_column(String(64), index=True)

    request_id: Mapped[str | None] = mapped_column(String(64), index=True)


class DocumentAccessLog(Base, UUIDMixin, TimestampMixin):
    """CERT-In and RTI expect us to know who looked at which record, and why."""

    __tablename__ = "document_access_log"
    __table_args__ = (Index("ix_access_doc_time", "document_id", "created_at"),)

    document_id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), index=True)
    record_id: Mapped[uuid.UUID | None] = mapped_column(PGUUID(as_uuid=True), index=True)
    user_id: Mapped[uuid.UUID | None] = mapped_column(PGUUID(as_uuid=True), index=True)
    api_client_id: Mapped[uuid.UUID | None] = mapped_column(PGUUID(as_uuid=True))
    ip_address: Mapped[str | None] = mapped_column(String(64))
    action: Mapped[str] = mapped_column(String(24))       # VIEW | DOWNLOAD | EXPORT | PRINT
    purpose: Mapped[str | None] = mapped_column(String(200))
    user_agent: Mapped[str | None] = mapped_column(String(300))


# ── Integrations ────────────────────────────────────────────────────
class Integration(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "integrations"

    key: Mapped[str] = mapped_column(String(48), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(160))
    kind: Mapped[str] = mapped_column(String(32))          # LRMS | DILRMP | GIS | KYC | NOTIFY
    base_url: Mapped[str | None] = mapped_column(String(400))
    auth_config: Mapped[dict] = mapped_column(JSONB, default=dict)
    field_mapping: Mapped[dict] = mapped_column(JSONB, default=dict)
    is_enabled: Mapped[bool] = mapped_column(Boolean, default=True, index=True)

    health_status: Mapped[str | None] = mapped_column(String(16))
    last_health_check: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    circuit_open_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    success_count: Mapped[int] = mapped_column(Integer, default=0)
    failure_count: Mapped[int] = mapped_column(Integer, default=0)


class SyncJob(Base, UUIDMixin, TimestampMixin):
    """Transactional outbox: written in the same transaction as the record, then
    drained by a dispatcher — so a publish is never lost or double-sent."""

    __tablename__ = "sync_jobs"
    __table_args__ = (
        Index("ix_sync_pending", "status", "next_attempt_at"),
        Index("ix_sync_record", "record_id", "integration_key"),
    )

    integration_key: Mapped[str] = mapped_column(String(48), index=True)
    record_id: Mapped[uuid.UUID | None] = mapped_column(PGUUID(as_uuid=True), index=True)
    document_id: Mapped[uuid.UUID | None] = mapped_column(PGUUID(as_uuid=True))

    direction: Mapped[str] = mapped_column(String(16))
    idempotency_key: Mapped[str] = mapped_column(String(80), index=True)
    status: Mapped[str] = mapped_column(String(16), default="PENDING", index=True)

    external_id: Mapped[str | None] = mapped_column(String(120))
    request_payload: Mapped[dict | None] = mapped_column(JSONB)
    response_payload: Mapped[dict | None] = mapped_column(JSONB)
    http_status: Mapped[int | None] = mapped_column(Integer)

    attempts: Mapped[int] = mapped_column(Integer, default=0)
    max_attempts: Mapped[int] = mapped_column(Integer, default=5)
    next_attempt_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    error: Mapped[str | None] = mapped_column(Text)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Webhook(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "webhooks"

    client_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("api_clients.id", ondelete="CASCADE"), index=True
    )
    url: Mapped[str] = mapped_column(String(500))
    events: Mapped[list[str]] = mapped_column(JSONB, default=list)
    secret: Mapped[str] = mapped_column(String(120))
    is_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    failure_count: Mapped[int] = mapped_column(Integer, default=0)
    last_delivery_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


# ── Learning ────────────────────────────────────────────────────────
class Correction(Base, UUIDMixin, TimestampMixin):
    """One verifier correction = one labelled training example. This table is the
    entire reason accuracy climbs after deployment."""

    __tablename__ = "learning_corrections"
    __table_args__ = (
        Index("ix_corrections_training", "used_in_training_run", "created_at"),
        Index("ix_corrections_field_lang", "field_name", "language"),
    )

    record_id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), index=True)
    page_id: Mapped[uuid.UUID | None] = mapped_column(PGUUID(as_uuid=True))
    field_name: Mapped[str] = mapped_column(String(64), index=True)

    ai_value: Mapped[str | None] = mapped_column(Text)
    human_value: Mapped[str | None] = mapped_column(Text)
    ai_confidence: Mapped[float | None] = mapped_column(Float)

    bbox: Mapped[dict | None] = mapped_column(JSONB)
    crop_storage_key: Mapped[str | None] = mapped_column(String(500))
    script: Mapped[str | None] = mapped_column(String(24))
    language: Mapped[str | None] = mapped_column(String(8), index=True)
    is_handwritten: Mapped[bool] = mapped_column(Boolean, default=False)
    document_type: Mapped[str | None] = mapped_column(String(40), index=True)
    district_id: Mapped[uuid.UUID | None] = mapped_column(PGUUID(as_uuid=True), index=True)

    model_version: Mapped[str | None] = mapped_column(String(120))
    corrected_by: Mapped[uuid.UUID | None] = mapped_column(PGUUID(as_uuid=True))
    used_in_training_run: Mapped[str | None] = mapped_column(String(64), index=True)


class ModelVersion(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "model_versions"
    __table_args__ = (Index("ix_model_key_version", "model_key", "version", unique=True),)

    model_key: Mapped[str] = mapped_column(String(48), index=True)   # vision-ocr-hw, extraction-ner…
    version: Mapped[str] = mapped_column(String(32))
    artifact_uri: Mapped[str | None] = mapped_column(String(500))
    base_model: Mapped[str | None] = mapped_column(String(160))

    metrics: Mapped[dict] = mapped_column(JSONB, default=dict)       # CER, F1, per-language
    training_examples: Mapped[int | None] = mapped_column(Integer)
    training_run_id: Mapped[str | None] = mapped_column(String(64))
    golden_set_version: Mapped[str | None] = mapped_column(String(32))

    status: Mapped[str] = mapped_column(String(16), default="TRAINED", index=True)  # TRAINED|CANARY|ACTIVE|RETIRED
    traffic_pct: Mapped[int] = mapped_column(Integer, default=0)
    trained_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    promoted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    promoted_by: Mapped[uuid.UUID | None] = mapped_column(PGUUID(as_uuid=True))
    notes: Mapped[str | None] = mapped_column(Text)


# ── Notifications ───────────────────────────────────────────────────
class Notification(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "notifications"
    __table_args__ = (Index("ix_notif_user_unread", "user_id", "read_at"),)

    user_id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), index=True)
    kind: Mapped[str] = mapped_column(String(48), index=True)
    title: Mapped[str] = mapped_column(String(200))
    body: Mapped[str | None] = mapped_column(Text)
    link: Mapped[str | None] = mapped_column(String(500))
    severity: Mapped[str] = mapped_column(String(16), default="INFO")
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    channels_sent: Mapped[list[str]] = mapped_column(JSONB, default=list)
