from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class BatchCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=200)
    reference_no: str | None = None
    state_id: uuid.UUID | None = None
    district_id: uuid.UUID | None = None
    tehsil_id: uuid.UUID | None = None
    village_id: uuid.UUID | None = None
    record_year: int | None = Field(None, ge=1800, le=2100)
    document_type: str | None = None
    source_office: str | None = None
    language_hint: str | None = None
    notes: str | None = None


class BatchOut(BaseModel):
    id: str
    name: str
    reference_no: str | None = None
    district_id: str | None = None
    tehsil_id: str | None = None
    village_id: str | None = None
    record_year: int | None = None
    document_type: str | None = None
    source_office: str | None = None
    status: str
    total_documents: int
    processed_documents: int
    failed_documents: int
    total_pages: int
    progress_pct: float
    created_at: datetime
    completed_at: datetime | None = None

    @classmethod
    def from_model(cls, b: Any) -> "BatchOut":
        return cls(
            id=str(b.id),
            name=b.name,
            reference_no=b.reference_no,
            district_id=str(b.district_id) if b.district_id else None,
            tehsil_id=str(b.tehsil_id) if b.tehsil_id else None,
            village_id=str(b.village_id) if b.village_id else None,
            record_year=b.record_year,
            document_type=b.document_type,
            source_office=b.source_office,
            status=b.status,
            total_documents=b.total_documents,
            processed_documents=b.processed_documents,
            failed_documents=b.failed_documents,
            total_pages=b.total_pages,
            progress_pct=b.progress_pct,
            created_at=b.created_at,
            completed_at=b.completed_at,
        )


class PresignFile(BaseModel):
    filename: str = Field(..., max_length=400)
    mime_type: str
    size_bytes: int = Field(..., ge=1)


class PresignRequest(BaseModel):
    batch_id: uuid.UUID | None = None
    files: list[PresignFile] = Field(..., min_length=1, max_length=500)


class PresignResponse(BaseModel):
    uploads: list[dict[str, str]]
    expires_in: int


class RegisterItem(BaseModel):
    filename: str
    storage_key: str
    content_sha256: str = Field(..., min_length=64, max_length=64)
    mime_type: str
    size_bytes: int


class RegisterRequest(BaseModel):
    batch_id: uuid.UUID | None = None
    documents: list[RegisterItem] = Field(..., min_length=1, max_length=500)


class RegisterResponse(BaseModel):
    registered: int
    queued: int
    duplicates: list[dict[str, Any]] = []
    document_ids: list[str] = []


class DocumentOut(BaseModel):
    id: str
    batch_id: str | None = None
    original_filename: str
    content_sha256: str
    mime_type: str
    size_bytes: int
    page_count: int
    document_type: str
    document_type_confidence: float | None = None
    detected_languages: list[str] = []
    quality_score: int | None = None
    quality_issues: list[str] = []
    status: str
    current_stage: str | None = None
    error_code: str | None = None
    error_message: str | None = None
    is_duplicate_of: str | None = None
    created_at: datetime
    processing_started_at: datetime | None = None
    processing_finished_at: datetime | None = None

    @classmethod
    def from_model(cls, d: Any) -> "DocumentOut":
        return cls(
            id=str(d.id),
            batch_id=str(d.batch_id) if d.batch_id else None,
            original_filename=d.original_filename,
            content_sha256=d.content_sha256,
            mime_type=d.mime_type,
            size_bytes=d.size_bytes,
            page_count=d.page_count,
            document_type=d.document_type,
            document_type_confidence=d.document_type_confidence,
            detected_languages=d.detected_languages or [],
            quality_score=d.quality_score,
            quality_issues=d.quality_issues or [],
            status=d.status,
            current_stage=d.current_stage,
            error_code=d.error_code,
            error_message=d.error_message,
            is_duplicate_of=str(d.is_duplicate_of) if d.is_duplicate_of else None,
            created_at=d.created_at,
            processing_started_at=d.processing_started_at,
            processing_finished_at=d.processing_finished_at,
        )


class DocumentPageOut(BaseModel):
    id: str
    page_no: int
    width: int | None = None
    height: int | None = None
    dpi: int | None = None
    quality_score: int | None = None
    quality_issues: list[str] = []
    skew_angle: float | None = None
    detected_script: str | None = None
    has_handwriting: bool = False
    is_map_page: bool = False
    url_raw: str | None = None
    url_clean: str | None = None
    url_thumb: str | None = None
