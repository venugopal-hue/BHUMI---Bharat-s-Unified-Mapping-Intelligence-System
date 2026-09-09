"""Cadastral parcels, georeferenced map sheets, and parcel↔record links."""

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
    Numeric,
    String,
    Text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from bhumi.db.base import Base, TimestampMixin, UUIDMixin


class Parcel(Base, UUIDMixin, TimestampMixin):
    """A cadastral parcel polygon. Geometry stored in WGS84; areas computed on
    the geography type so they are in real square metres, not degrees."""

    __tablename__ = "parcels"
    __table_args__ = (
        Index("ix_parcels_village_survey", "village_id", "survey_number"),
    )

    village_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("villages.id", ondelete="SET NULL"), index=True
    )
    tehsil_id: Mapped[uuid.UUID | None] = mapped_column(PGUUID(as_uuid=True), index=True)
    district_id: Mapped[uuid.UUID | None] = mapped_column(PGUUID(as_uuid=True), index=True)
    state_id: Mapped[uuid.UUID | None] = mapped_column(PGUUID(as_uuid=True), index=True)

    survey_number: Mapped[str | None] = mapped_column(String(64), index=True)
    khasra_number: Mapped[str | None] = mapped_column(String(64), index=True)
    sub_division: Mapped[str | None] = mapped_column(String(64))

    geom: Mapped[str | None] = mapped_column(Text)
    centroid: Mapped[str | None] = mapped_column(Text)
    area_sqm: Mapped[float | None] = mapped_column(Numeric(16, 2))
    perimeter_m: Mapped[float | None] = mapped_column(Numeric(16, 2))

    source: Mapped[str] = mapped_column(String(32), default="IMPORT")  # IMPORT | VECTORIZED | SURVEY
    map_sheet_id: Mapped[uuid.UUID | None] = mapped_column(PGUUID(as_uuid=True), index=True)
    map_sheet_ref: Mapped[str | None] = mapped_column(String(120))
    label_confidence: Mapped[float | None] = mapped_column(Float)

    is_validated: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    topology_issues: Mapped[list[str]] = mapped_column(JSONB, default=list)
    land_classification: Mapped[str | None] = mapped_column(String(32))
    notes: Mapped[str | None] = mapped_column(Text)


class MapSheet(Base, UUIDMixin, TimestampMixin):
    """A scanned cadastral map (Shajra / Tippan / FMB) and its georeferencing."""

    __tablename__ = "map_sheets"

    village_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("villages.id", ondelete="SET NULL"), index=True
    )
    document_id: Mapped[uuid.UUID | None] = mapped_column(PGUUID(as_uuid=True), index=True)
    page_id: Mapped[uuid.UUID | None] = mapped_column(PGUUID(as_uuid=True))

    sheet_ref: Mapped[str | None] = mapped_column(String(120), index=True)
    storage_key: Mapped[str] = mapped_column(String(500))
    storage_key_warped: Mapped[str | None] = mapped_column(String(500))
    scale_denominator: Mapped[int | None] = mapped_column(Integer)   # e.g. 4000 for 1:4000

    ground_control_points: Mapped[list | None] = mapped_column(JSONB)
    transform: Mapped[dict | None] = mapped_column(JSONB)            # affine / polynomial coefficients
    transform_type: Mapped[str | None] = mapped_column(String(24))
    srid: Mapped[int | None] = mapped_column(Integer)
    rms_error_m: Mapped[float | None] = mapped_column(Float)
    bounds: Mapped[str | None] = mapped_column(Text)

    status: Mapped[str] = mapped_column(String(24), default="UPLOADED", index=True)
    parcels_extracted: Mapped[int] = mapped_column(Integer, default=0)
    georeferenced_by: Mapped[uuid.UUID | None] = mapped_column(PGUUID(as_uuid=True))
    georeferenced_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class ParcelRecordLink(Base, UUIDMixin, TimestampMixin):
    """Joins the text record to the geometry. Both sides can be orphaned, and
    orphans are a first-class worklist rather than silently dropped."""

    __tablename__ = "parcel_record_links"
    __table_args__ = (
        Index("ix_link_parcel_record", "parcel_id", "record_id", unique=True),
    )

    parcel_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("parcels.id", ondelete="CASCADE"), index=True
    )
    record_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("land_records.id", ondelete="CASCADE"), index=True
    )
    match_type: Mapped[str] = mapped_column(String(24))   # EXACT | FUZZY | MANUAL | SPATIAL
    confidence: Mapped[float] = mapped_column(Float, default=0.0)
    area_delta_pct: Mapped[float | None] = mapped_column(Float)
    linked_by: Mapped[uuid.UUID | None] = mapped_column(PGUUID(as_uuid=True))
