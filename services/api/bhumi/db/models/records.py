"""The canonical land record — 24 fields, every one confidence-scored."""

from __future__ import annotations

import uuid
from datetime import date, datetime

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from bhumi.core.enums import VerificationStatus
from bhumi.db.base import Base, TimestampMixin, UUIDMixin


class LandRecord(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "land_records"
    __table_args__ = (
        Index("ix_records_status_conf", "verification_status", "confidence_overall"),
        Index("ix_records_survey", "village_id", "survey_number"),
        Index(
            "ix_records_owner_trgm",
            "owner_name",
            postgresql_using="gin",
            postgresql_ops={"owner_name": "gin_trgm_ops"},
        ),
        Index(
            "ix_records_owner_roman_trgm",
            "owner_name_roman",
            postgresql_using="gin",
            postgresql_ops={"owner_name_roman": "gin_trgm_ops"},
        ),
    )

    # ── Provenance ──────────────────────────────────────────────────
    document_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("documents.id", ondelete="CASCADE"), index=True
    )
    page_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("document_pages.id", ondelete="SET NULL")
    )
    batch_id: Mapped[uuid.UUID | None] = mapped_column(PGUUID(as_uuid=True), index=True)

    # ── Jurisdiction (also the ABAC scope columns) ──────────────────
    state_id: Mapped[uuid.UUID | None] = mapped_column(PGUUID(as_uuid=True), index=True)
    district_id: Mapped[uuid.UUID | None] = mapped_column(PGUUID(as_uuid=True), index=True)
    tehsil_id: Mapped[uuid.UUID | None] = mapped_column(PGUUID(as_uuid=True), index=True)
    village_id: Mapped[uuid.UUID | None] = mapped_column(PGUUID(as_uuid=True), index=True)

    # ── Identity fields ─────────────────────────────────────────────
    survey_number: Mapped[str | None] = mapped_column(String(64), index=True)
    khasra_number: Mapped[str | None] = mapped_column(String(64), index=True)
    khata_number: Mapped[str | None] = mapped_column(String(64), index=True)
    plot_number: Mapped[str | None] = mapped_column(String(64))
    sub_division: Mapped[str | None] = mapped_column(String(64))

    # ── Owner fields ────────────────────────────────────────────────
    owner_name: Mapped[str | None] = mapped_column(String(300), index=True)
    owner_name_roman: Mapped[str | None] = mapped_column(String(300))
    father_or_husband_name: Mapped[str | None] = mapped_column(String(300))
    father_or_husband_name_roman: Mapped[str | None] = mapped_column(String(300))
    owner_share: Mapped[float | None] = mapped_column(Numeric(10, 6))
    owner_category: Mapped[str | None] = mapped_column(String(24))

    # ── Land fields ─────────────────────────────────────────────────
    plot_area_original: Mapped[float | None] = mapped_column(Numeric(16, 4))
    area_unit_original: Mapped[str | None] = mapped_column(String(24))
    plot_area_sqm: Mapped[float | None] = mapped_column(Numeric(16, 2), index=True)
    land_classification: Mapped[str | None] = mapped_column(String(32), index=True)
    soil_type: Mapped[str | None] = mapped_column(String(64))
    irrigation_source: Mapped[str | None] = mapped_column(String(64))

    # ── Legal fields ────────────────────────────────────────────────
    mutation_number: Mapped[str | None] = mapped_column(String(64), index=True)
    mutation_date: Mapped[date | None] = mapped_column(Date)
    registration_number: Mapped[str | None] = mapped_column(String(64))
    registration_date: Mapped[date | None] = mapped_column(Date)
    encumbrance: Mapped[str | None] = mapped_column(Text)
    tenancy_rights: Mapped[str | None] = mapped_column(Text)
    revenue_assessment: Mapped[float | None] = mapped_column(Numeric(14, 2))

    # ── Metadata ────────────────────────────────────────────────────
    document_type: Mapped[str | None] = mapped_column(String(40), index=True)
    record_year: Mapped[int | None] = mapped_column(Integer, index=True)
    source_language: Mapped[str | None] = mapped_column(String(8), index=True)

    # ── Confidence & lifecycle ──────────────────────────────────────
    confidence_overall: Mapped[float] = mapped_column(Float, default=0.0, index=True)
    confidence_min_mandatory: Mapped[float | None] = mapped_column(Float)
    verification_status: Mapped[str] = mapped_column(
        String(24), default=VerificationStatus.PENDING_REVIEW.value, index=True
    )
    validation_status: Mapped[str | None] = mapped_column(String(16), index=True)
    blocking_failures: Mapped[int] = mapped_column(Integer, default=0)

    # ── GIS link ────────────────────────────────────────────────────
    parcel_id: Mapped[uuid.UUID | None] = mapped_column(PGUUID(as_uuid=True), index=True)
    map_sheet_ref: Mapped[str | None] = mapped_column(String(120))
    area_delta_pct: Mapped[float | None] = mapped_column(Float)

    # ── Audit ───────────────────────────────────────────────────────
    extracted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    verified_by: Mapped[uuid.UUID | None] = mapped_column(PGUUID(as_uuid=True))
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    rejection_reason: Mapped[str | None] = mapped_column(Text)
    model_version: Mapped[str | None] = mapped_column(String(120))
    correction_count: Mapped[int] = mapped_column(Integer, default=0)

    fields: Mapped[list["RecordField"]] = relationship(
        back_populates="record", cascade="all, delete-orphan", lazy="selectin"
    )
    co_owners: Mapped[list["CoOwner"]] = relationship(
        back_populates="record", cascade="all, delete-orphan", lazy="selectin"
    )


class RecordField(Base, UUIDMixin, TimestampMixin):
    """Per-field provenance: what was read, how sure we are, and where on the page.

    The bbox is what makes the Review console's click-to-locate work.
    """

    __tablename__ = "record_fields"
    __table_args__ = (
        Index("ix_record_fields_record_name", "record_id", "field_name", unique=True),
        Index("ix_record_fields_low_conf", "record_id", "confidence"),
    )

    record_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("land_records.id", ondelete="CASCADE"), index=True
    )
    field_name: Mapped[str] = mapped_column(String(64))

    value_text: Mapped[str | None] = mapped_column(Text)            # as read
    value_normalized: Mapped[str | None] = mapped_column(Text)      # canonical
    value_roman: Mapped[str | None] = mapped_column(Text)           # transliterated

    confidence: Mapped[float] = mapped_column(Float, default=0.0)
    confidence_breakdown: Mapped[dict | None] = mapped_column(JSONB)
    source: Mapped[str | None] = mapped_column(String(16))          # FieldSource
    engine: Mapped[str | None] = mapped_column(String(32))

    page_no: Mapped[int | None] = mapped_column(Integer)
    bbox: Mapped[dict | None] = mapped_column(JSONB)
    span_ids: Mapped[list | None] = mapped_column(JSONB)
    alternatives: Mapped[list | None] = mapped_column(JSONB)

    is_mandatory: Mapped[bool] = mapped_column(Boolean, default=False)
    is_corrected: Mapped[bool] = mapped_column(Boolean, default=False)
    original_value: Mapped[str | None] = mapped_column(Text)
    corrected_by: Mapped[uuid.UUID | None] = mapped_column(PGUUID(as_uuid=True))
    flag: Mapped[str | None] = mapped_column(String(32))            # illegible / damaged
    note: Mapped[str | None] = mapped_column(Text)

    record: Mapped[LandRecord] = relationship(back_populates="fields")


class CoOwner(Base, UUIDMixin, TimestampMixin):
    """Joint holdings are the norm, not the exception, in Indian land records."""

    __tablename__ = "co_owners"

    record_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("land_records.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(300))
    name_roman: Mapped[str | None] = mapped_column(String(300))
    relation: Mapped[str | None] = mapped_column(String(64))     # s/o, w/o, d/o
    relation_name: Mapped[str | None] = mapped_column(String(300))
    share: Mapped[float | None] = mapped_column(Numeric(10, 6))
    share_text: Mapped[str | None] = mapped_column(String(64))    # "1/3"
    confidence: Mapped[float] = mapped_column(Float, default=0.0)
    bbox: Mapped[dict | None] = mapped_column(JSONB)
    sequence: Mapped[int] = mapped_column(Integer, default=0)

    record: Mapped[LandRecord] = relationship(back_populates="co_owners")
