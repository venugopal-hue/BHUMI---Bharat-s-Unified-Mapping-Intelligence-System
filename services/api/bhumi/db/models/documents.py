"""Intake and Vision tables: batches, documents, pages, regions, OCR spans."""

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
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from bhumi.core.enums import DocumentStatus, DocumentType
from bhumi.db.base import Base, TimestampMixin, UUIDMixin


class Batch(Base, UUIDMixin, TimestampMixin):
    """A district office uploads a register as one batch; metadata applies to all
    documents in it and is overridable per document."""

    __tablename__ = "batches"

    name: Mapped[str] = mapped_column(String(200))
    reference_no: Mapped[str | None] = mapped_column(String(64), index=True)

    state_id: Mapped[uuid.UUID | None] = mapped_column(PGUUID(as_uuid=True), ForeignKey("states.id"), index=True)
    district_id: Mapped[uuid.UUID | None] = mapped_column(PGUUID(as_uuid=True), ForeignKey("districts.id"), index=True)
    tehsil_id: Mapped[uuid.UUID | None] = mapped_column(PGUUID(as_uuid=True), ForeignKey("tehsils.id"), index=True)
    village_id: Mapped[uuid.UUID | None] = mapped_column(PGUUID(as_uuid=True), ForeignKey("villages.id"), index=True)

    record_year: Mapped[int | None] = mapped_column(Integer)
    document_type: Mapped[str | None] = mapped_column(String(40))
    source_office: Mapped[str | None] = mapped_column(String(200))
    language_hint: Mapped[str | None] = mapped_column(String(8))
    notes: Mapped[str | None] = mapped_column(Text)

    total_documents: Mapped[int] = mapped_column(Integer, default=0)
    processed_documents: Mapped[int] = mapped_column(Integer, default=0)
    failed_documents: Mapped[int] = mapped_column(Integer, default=0)
    total_pages: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[str] = mapped_column(String(24), default="OPEN", index=True)

    uploaded_by: Mapped[uuid.UUID | None] = mapped_column(PGUUID(as_uuid=True), ForeignKey("users.id"))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    documents: Mapped[list["Document"]] = relationship(back_populates="batch")

    @property
    def progress_pct(self) -> float:
        if not self.total_documents:
            return 0.0
        return round(self.processed_documents / self.total_documents * 100, 1)


class Document(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "documents"
    __table_args__ = (
        Index("ix_documents_status_created", "status", "created_at"),
        Index("ix_documents_hash", "content_sha256"),
    )

    batch_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("batches.id", ondelete="SET NULL"), index=True
    )

    original_filename: Mapped[str] = mapped_column(String(400))
    content_sha256: Mapped[str] = mapped_column(String(64), index=True)
    mime_type: Mapped[str] = mapped_column(String(120))
    size_bytes: Mapped[int] = mapped_column(Integer)
    storage_key: Mapped[str] = mapped_column(String(500))

    page_count: Mapped[int] = mapped_column(Integer, default=0)
    document_type: Mapped[str] = mapped_column(String(40), default=DocumentType.UNKNOWN.value)
    document_type_confidence: Mapped[float | None] = mapped_column(Float)
    detected_languages: Mapped[list[str]] = mapped_column(JSONB, default=list)
    quality_score: Mapped[int | None] = mapped_column(Integer)
    quality_issues: Mapped[list[str]] = mapped_column(JSONB, default=list)

    # Jurisdiction denormalized from the batch for fast ABAC filtering.
    state_id: Mapped[uuid.UUID | None] = mapped_column(PGUUID(as_uuid=True), index=True)
    district_id: Mapped[uuid.UUID | None] = mapped_column(PGUUID(as_uuid=True), index=True)
    tehsil_id: Mapped[uuid.UUID | None] = mapped_column(PGUUID(as_uuid=True), index=True)
    village_id: Mapped[uuid.UUID | None] = mapped_column(PGUUID(as_uuid=True), index=True)

    status: Mapped[str] = mapped_column(String(24), default=DocumentStatus.UPLOADED.value, index=True)
    current_stage: Mapped[str | None] = mapped_column(String(24))
    error_code: Mapped[str | None] = mapped_column(String(64))
    error_message: Mapped[str | None] = mapped_column(Text)
    retry_count: Mapped[int] = mapped_column(Integer, default=0)

    is_duplicate_of: Mapped[uuid.UUID | None] = mapped_column(PGUUID(as_uuid=True))
    uploaded_by: Mapped[uuid.UUID | None] = mapped_column(PGUUID(as_uuid=True), ForeignKey("users.id"))

    processing_started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    processing_finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    model_versions: Mapped[dict] = mapped_column(JSONB, default=dict)

    batch: Mapped[Batch | None] = relationship(back_populates="documents")
    pages: Mapped[list["DocumentPage"]] = relationship(
        back_populates="document", cascade="all, delete-orphan", order_by="DocumentPage.page_no"
    )


class DocumentPage(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "document_pages"
    __table_args__ = (UniqueConstraint("document_id", "page_no", name="uq_page_no"),)

    document_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("documents.id", ondelete="CASCADE"), index=True
    )
    page_no: Mapped[int] = mapped_column(Integer)

    storage_key_raw: Mapped[str] = mapped_column(String(500))
    storage_key_clean: Mapped[str | None] = mapped_column(String(500))
    storage_key_thumb: Mapped[str | None] = mapped_column(String(500))

    width: Mapped[int | None] = mapped_column(Integer)
    height: Mapped[int | None] = mapped_column(Integer)
    dpi: Mapped[int | None] = mapped_column(Integer)
    skew_angle: Mapped[float | None] = mapped_column(Float)
    rotation_applied: Mapped[int] = mapped_column(Integer, default=0)

    quality_score: Mapped[int | None] = mapped_column(Integer)
    quality_issues: Mapped[list[str]] = mapped_column(JSONB, default=list)
    blur_score: Mapped[float | None] = mapped_column(Float)
    contrast_score: Mapped[float | None] = mapped_column(Float)
    ink_coverage: Mapped[float | None] = mapped_column(Float)

    detected_script: Mapped[str | None] = mapped_column(String(24))
    has_handwriting: Mapped[bool] = mapped_column(Boolean, default=False)
    is_map_page: Mapped[bool] = mapped_column(Boolean, default=False)

    document: Mapped[Document] = relationship(back_populates="pages")
    regions: Mapped[list["PageRegion"]] = relationship(
        back_populates="page", cascade="all, delete-orphan"
    )


class PageRegion(Base, UUIDMixin, TimestampMixin):
    """Layout detection output — a table, an owner block, a stamp, a damaged area."""

    __tablename__ = "page_regions"

    page_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("document_pages.id", ondelete="CASCADE"), index=True
    )
    parent_region_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("page_regions.id", ondelete="CASCADE")
    )

    region_type: Mapped[str] = mapped_column(String(32), index=True)
    bbox: Mapped[dict] = mapped_column(JSONB)          # {x, y, w, h} in page pixels
    polygon: Mapped[list | None] = mapped_column(JSONB)
    confidence: Mapped[float] = mapped_column(Float, default=0.0)

    row_index: Mapped[int | None] = mapped_column(Integer)   # for table cells
    col_index: Mapped[int | None] = mapped_column(Integer)
    reading_order: Mapped[int | None] = mapped_column(Integer)

    model_version: Mapped[str | None] = mapped_column(String(64))

    page: Mapped[DocumentPage] = relationship(back_populates="regions")
    spans: Mapped[list["OcrSpan"]] = relationship(
        back_populates="region", cascade="all, delete-orphan"
    )


class OcrSpan(Base, UUIDMixin, TimestampMixin):
    """A recognized text run with its box, script, engine and confidence."""

    __tablename__ = "ocr_spans"
    __table_args__ = (Index("ix_spans_page_conf", "page_id", "confidence"),)

    page_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("document_pages.id", ondelete="CASCADE"), index=True
    )
    region_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("page_regions.id", ondelete="CASCADE"), index=True
    )

    text: Mapped[str] = mapped_column(Text)
    text_normalized: Mapped[str | None] = mapped_column(Text)
    script: Mapped[str | None] = mapped_column(String(24))
    language: Mapped[str | None] = mapped_column(String(8))

    bbox: Mapped[dict] = mapped_column(JSONB)
    confidence: Mapped[float] = mapped_column(Float, default=0.0)
    raw_confidence: Mapped[float | None] = mapped_column(Float)  # pre-calibration
    engine: Mapped[str | None] = mapped_column(String(32))
    is_handwritten: Mapped[bool] = mapped_column(Boolean, default=False)
    alternatives: Mapped[list | None] = mapped_column(JSONB)
    reading_order: Mapped[int | None] = mapped_column(Integer)

    region: Mapped[PageRegion | None] = relationship(back_populates="spans")
