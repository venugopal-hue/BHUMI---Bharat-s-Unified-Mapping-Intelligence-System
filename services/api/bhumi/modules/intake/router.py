"""Intake — batches, uploads, document listing, reprocessing, live progress."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import func, select
from sse_starlette.sse import EventSourceResponse

from bhumi.core.audit import record_audit
from bhumi.core.config import settings
from bhumi.core.deps import CurrentUser, PageDep, RequirePermissions, SessionDep, client_ip
from bhumi.core.enums import AuditAction, DocumentStatus
from bhumi.core.rbac import Perm, jurisdiction_filter
from bhumi.core.storage import build_key, presigned_get, presigned_put
from bhumi.db.models.documents import Batch, Document, DocumentPage
from bhumi.modules.intake.schemas import (
    BatchCreate,
    BatchOut,
    DocumentOut,
    DocumentPageOut,
    PresignRequest,
    PresignResponse,
    RegisterRequest,
    RegisterResponse,
)

router = APIRouter()

ALLOWED_MIME = {
    "application/pdf",
    "image/jpeg",
    "image/png",
    "image/tiff",
    "image/bmp",
    "image/webp",
}


# ── Batches ─────────────────────────────────────────────────────────
@router.post(
    "/batches",
    response_model=BatchOut,
    status_code=201,
    summary="Create an upload batch",
    dependencies=[Depends(RequirePermissions(Perm.DOCUMENT_UPLOAD))],
)
async def create_batch(
    payload: BatchCreate, principal: CurrentUser, session: SessionDep, request: Request
):
    batch = Batch(
        name=payload.name,
        reference_no=payload.reference_no,
        state_id=payload.state_id,
        district_id=payload.district_id,
        tehsil_id=payload.tehsil_id,
        village_id=payload.village_id,
        record_year=payload.record_year,
        document_type=payload.document_type,
        source_office=payload.source_office,
        language_hint=payload.language_hint,
        notes=payload.notes,
        uploaded_by=uuid.UUID(principal.user_id),
    )
    session.add(batch)
    await session.flush()

    await record_audit(
        session,
        entity_type="batch",
        entity_id=str(batch.id),
        action=AuditAction.CREATE.value,
        actor_id=principal.user_id,
        actor_username=principal.username,
        actor_ip=client_ip(request),
        payload={"name": batch.name, "village_id": str(payload.village_id or "")},
    )
    return BatchOut.from_model(batch)


@router.get("/batches", response_model=list[BatchOut], summary="List batches")
async def list_batches(
    principal: CurrentUser,
    session: SessionDep,
    page: PageDep,
    status_filter: Annotated[str | None, Query(alias="status")] = None,
    district_id: uuid.UUID | None = None,
):
    stmt = select(Batch).order_by(Batch.created_at.desc())
    for clause in jurisdiction_filter(principal, Batch):
        stmt = stmt.where(clause)
    if status_filter:
        stmt = stmt.where(Batch.status == status_filter)
    if district_id:
        stmt = stmt.where(Batch.district_id == district_id)

    rows = (await session.execute(stmt.offset(page.offset).limit(page.limit))).scalars().all()
    return [BatchOut.from_model(b) for b in rows]


@router.get("/batches/{batch_id}", response_model=BatchOut, summary="Batch detail")
async def get_batch(batch_id: uuid.UUID, principal: CurrentUser, session: SessionDep):
    batch = await session.get(Batch, batch_id)
    if batch is None:
        raise HTTPException(status_code=404, detail="Batch not found.")
    if not principal.may_access(
        state_id=batch.state_id,
        district_id=batch.district_id,
        tehsil_id=batch.tehsil_id,
        village_id=batch.village_id,
    ):
        raise HTTPException(status_code=403, detail="Outside your jurisdiction.")
    return BatchOut.from_model(batch)


# ── Upload ──────────────────────────────────────────────────────────
@router.post(
    "/documents/presign",
    response_model=PresignResponse,
    summary="Get presigned upload URLs",
    dependencies=[Depends(RequirePermissions(Perm.DOCUMENT_UPLOAD))],
)
async def presign_uploads(payload: PresignRequest, principal: CurrentUser):
    """The browser uploads straight to object storage — the API never carries
    hundreds of megabytes of scans through its own process."""
    uploads = []
    for f in payload.files:
        if f.mime_type not in ALLOWED_MIME:
            raise HTTPException(
                status_code=415,
                detail=f"{f.filename}: {f.mime_type} is not an accepted document format.",
            )
        if f.size_bytes > settings.MAX_UPLOAD_MB * 1024 * 1024:
            raise HTTPException(
                status_code=413,
                detail=f"{f.filename} exceeds the {settings.MAX_UPLOAD_MB} MB limit.",
            )
        key = build_key(
            "uploads",
            str(payload.batch_id or "loose"),
            datetime.now(UTC).strftime("%Y/%m/%d"),
            f"{uuid.uuid4()}-{f.filename}",
        )
        uploads.append({**presigned_put(key, f.mime_type), "filename": f.filename})

    return PresignResponse(uploads=uploads, expires_in=settings.PRESIGN_EXPIRY_SECONDS)


@router.post(
    "/documents/register",
    response_model=RegisterResponse,
    status_code=202,
    summary="Register uploaded objects and start the pipeline",
    dependencies=[Depends(RequirePermissions(Perm.DOCUMENT_UPLOAD))],
)
async def register_documents(
    payload: RegisterRequest, principal: CurrentUser, session: SessionDep, request: Request
):
    batch = await session.get(Batch, payload.batch_id) if payload.batch_id else None

    created: list[Document] = []
    duplicates: list[dict[str, Any]] = []

    for item in payload.documents:
        # Content-addressed dedup: an identical scan is never processed twice.
        existing = (
            await session.execute(
                select(Document).where(Document.content_sha256 == item.content_sha256)
            )
        ).scalar_one_or_none()

        doc = Document(
            batch_id=payload.batch_id,
            original_filename=item.filename,
            content_sha256=item.content_sha256,
            mime_type=item.mime_type,
            size_bytes=item.size_bytes,
            storage_key=item.storage_key,
            uploaded_by=uuid.UUID(principal.user_id),
            state_id=batch.state_id if batch else None,
            district_id=batch.district_id if batch else None,
            tehsil_id=batch.tehsil_id if batch else None,
            village_id=batch.village_id if batch else None,
            document_type=(batch.document_type if batch else None) or "UNKNOWN",
        )

        if existing is not None:
            doc.status = DocumentStatus.REJECTED.value
            doc.error_code = "DUPLICATE_CONTENT"
            doc.error_message = "This exact scan has already been digitized."
            doc.is_duplicate_of = existing.id
            duplicates.append(
                {"filename": item.filename, "existing_document_id": str(existing.id)}
            )
        else:
            doc.status = DocumentStatus.QUEUED.value

        session.add(doc)
        created.append(doc)

    await session.flush()

    if batch:
        batch.total_documents += len(created)
        batch.status = "PROCESSING"

    queued = [d for d in created if d.status == DocumentStatus.QUEUED.value]
    _enqueue_pipeline([str(d.id) for d in queued])

    await record_audit(
        session,
        entity_type="batch",
        entity_id=str(payload.batch_id or ""),
        action=AuditAction.CREATE.value,
        actor_id=principal.user_id,
        actor_username=principal.username,
        actor_ip=client_ip(request),
        payload={"registered": len(created), "queued": len(queued), "duplicates": len(duplicates)},
    )

    return RegisterResponse(
        registered=len(created),
        queued=len(queued),
        duplicates=duplicates,
        document_ids=[str(d.id) for d in queued],
    )


def _enqueue_pipeline(document_ids: list[str]) -> None:
    """Hand off to Celery. Failure to enqueue must not lose the upload — the
    documents stay QUEUED and a sweeper picks them up."""
    if not document_ids:
        return
    try:
        from celery import Celery

        app = Celery(broker=settings.CELERY_BROKER_URL)
        for doc_id in document_ids:
            app.send_task("worker.tasks.pipeline.process_document", args=[doc_id], queue="pipeline")
    except Exception:
        import structlog

        structlog.get_logger().warning("enqueue_failed", count=len(document_ids))


# ── Documents ───────────────────────────────────────────────────────
@router.get("/documents", response_model=list[DocumentOut], summary="List documents")
async def list_documents(
    principal: CurrentUser,
    session: SessionDep,
    page: PageDep,
    batch_id: uuid.UUID | None = None,
    status_filter: Annotated[str | None, Query(alias="status")] = None,
    document_type: str | None = None,
    min_quality: int | None = None,
    search: str | None = None,
):
    stmt = select(Document).order_by(Document.created_at.desc())
    for clause in jurisdiction_filter(principal, Document):
        stmt = stmt.where(clause)
    if batch_id:
        stmt = stmt.where(Document.batch_id == batch_id)
    if status_filter:
        stmt = stmt.where(Document.status == status_filter)
    if document_type:
        stmt = stmt.where(Document.document_type == document_type)
    if min_quality is not None:
        stmt = stmt.where(Document.quality_score >= min_quality)
    if search:
        stmt = stmt.where(Document.original_filename.ilike(f"%{search}%"))

    rows = (await session.execute(stmt.offset(page.offset).limit(page.limit))).scalars().all()
    return [DocumentOut.from_model(d) for d in rows]


@router.get("/documents/{document_id}", response_model=DocumentOut, summary="Document detail")
async def get_document(document_id: uuid.UUID, principal: CurrentUser, session: SessionDep):
    doc = await session.get(Document, document_id)
    if doc is None:
        raise HTTPException(status_code=404, detail="Document not found.")
    if not principal.may_access(
        state_id=doc.state_id,
        district_id=doc.district_id,
        tehsil_id=doc.tehsil_id,
        village_id=doc.village_id,
    ):
        raise HTTPException(status_code=403, detail="Outside your jurisdiction.")
    return DocumentOut.from_model(doc)


@router.get(
    "/documents/{document_id}/pages",
    response_model=list[DocumentPageOut],
    summary="Page images with signed URLs",
)
async def get_pages(document_id: uuid.UUID, principal: CurrentUser, session: SessionDep):
    rows = (
        await session.execute(
            select(DocumentPage)
            .where(DocumentPage.document_id == document_id)
            .order_by(DocumentPage.page_no)
        )
    ).scalars().all()

    out = []
    for p in rows:
        out.append(
            DocumentPageOut(
                id=str(p.id),
                page_no=p.page_no,
                width=p.width,
                height=p.height,
                dpi=p.dpi,
                quality_score=p.quality_score,
                quality_issues=p.quality_issues or [],
                skew_angle=p.skew_angle,
                detected_script=p.detected_script,
                has_handwriting=p.has_handwriting,
                is_map_page=p.is_map_page,
                url_raw=presigned_get(p.storage_key_raw) if p.storage_key_raw else None,
                url_clean=presigned_get(p.storage_key_clean) if p.storage_key_clean else None,
                url_thumb=presigned_get(p.storage_key_thumb) if p.storage_key_thumb else None,
            )
        )
    return out


@router.post(
    "/documents/{document_id}/reprocess",
    status_code=202,
    summary="Re-run the pipeline",
    dependencies=[Depends(RequirePermissions(Perm.DOCUMENT_REPROCESS))],
)
async def reprocess(
    document_id: uuid.UUID,
    principal: CurrentUser,
    session: SessionDep,
    from_stage: str | None = None,
):
    doc = await session.get(Document, document_id)
    if doc is None:
        raise HTTPException(status_code=404, detail="Document not found.")

    doc.status = DocumentStatus.QUEUED.value
    doc.error_code = None
    doc.error_message = None
    doc.retry_count += 1
    _enqueue_pipeline([str(doc.id)])

    await record_audit(
        session,
        entity_type="document",
        entity_id=str(doc.id),
        action=AuditAction.UPDATE.value,
        actor_id=principal.user_id,
        actor_username=principal.username,
        payload={"reprocess": True, "from_stage": from_stage},
    )
    return {"status": "queued", "document_id": str(doc.id), "from_stage": from_stage}


# ── Live progress ───────────────────────────────────────────────────
@router.get("/batches/{batch_id}/stream", summary="Live batch progress (SSE)")
async def stream_batch_progress(batch_id: uuid.UUID, session: SessionDep):
    """Drives the animated pipeline stepper in the UI. Polling the aggregate is
    cheap and avoids a second message bus just for the browser."""
    import asyncio
    import json

    async def events():
        last = None
        for _ in range(600):  # ~10 minutes at 1s
            counts = (
                await session.execute(
                    select(Document.status, func.count())
                    .where(Document.batch_id == batch_id)
                    .group_by(Document.status)
                )
            ).all()
            payload = {s: c for s, c in counts}
            total = sum(payload.values())
            done = sum(
                payload.get(s, 0)
                for s in (
                    DocumentStatus.PENDING_REVIEW.value,
                    DocumentStatus.VERIFIED.value,
                    DocumentStatus.PUBLISHED.value,
                    DocumentStatus.FAILED.value,
                    DocumentStatus.REJECTED.value,
                )
            )
            body = {
                "batch_id": str(batch_id),
                "total": total,
                "completed": done,
                "progress_pct": round(done / total * 100, 1) if total else 0.0,
                "by_status": payload,
            }
            if body != last:
                yield {"event": "progress", "data": json.dumps(body)}
                last = body
            if total and done >= total:
                yield {"event": "complete", "data": json.dumps(body)}
                return
            await asyncio.sleep(1)

    return EventSourceResponse(events())
