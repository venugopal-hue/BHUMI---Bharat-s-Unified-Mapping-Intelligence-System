"""Vault — the audit trail and document access log.

The point of this module is that we do not ask anyone to *believe* the records
were never altered. We let them check.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select

from bhumi.core.audit import verify_chain
from bhumi.core.deps import CurrentUser, PageDep, RequirePermissions, SessionDep
from bhumi.core.rbac import Perm
from bhumi.core.storage import presigned_get
from bhumi.db.models.documents import Document
from bhumi.db.models.governance import AuditLog, DocumentAccessLog

router = APIRouter()


@router.get(
    "/audit",
    summary="Filterable audit trail",
    dependencies=[Depends(RequirePermissions(Perm.AUDIT_READ))],
)
async def list_audit(
    session: SessionDep,
    page: PageDep,
    entity_type: str | None = None,
    entity_id: str | None = None,
    action: str | None = None,
    actor: str | None = None,
    since_days: int | None = Query(None, ge=1, le=3650),
):
    stmt = select(AuditLog).order_by(AuditLog.id.desc())
    if entity_type:
        stmt = stmt.where(AuditLog.entity_type == entity_type)
    if entity_id:
        stmt = stmt.where(AuditLog.entity_id == entity_id)
    if action:
        stmt = stmt.where(AuditLog.action == action)
    if actor:
        stmt = stmt.where(AuditLog.actor_username == actor)
    if since_days:
        stmt = stmt.where(AuditLog.created_at >= datetime.now(UTC) - timedelta(days=since_days))

    rows = (await session.execute(stmt.offset(page.offset).limit(page.limit))).scalars().all()
    return [
        {
            "id": e.id,
            "at": e.created_at,
            "actor": e.actor_username,
            "actor_id": str(e.actor_id) if e.actor_id else None,
            "actor_roles": e.actor_roles,
            "actor_ip": e.actor_ip,
            "entity_type": e.entity_type,
            "entity_id": e.entity_id,
            "action": e.action,
            "payload": e.payload,
            "payload_hash": e.payload_hash,
            "prev_hash": e.prev_hash,
            "chain_hash": e.chain_hash,
            "request_id": e.request_id,
        }
        for e in rows
    ]


@router.get(
    "/audit/verify-chain",
    summary="Verify the audit chain is unbroken",
    dependencies=[Depends(RequirePermissions(Perm.AUDIT_VERIFY))],
)
async def verify(session: SessionDep, start_id: int = 0, limit: int = Query(100_000, ge=1)):
    """The demo moment: click, and we walk every entry, recompute each hash, and
    prove nothing in the history has been edited."""
    started = datetime.now(UTC)
    result = await verify_chain(session, start_id=start_id, limit=limit)
    result["verified_at"] = started
    result["elapsed_ms"] = round(
        (datetime.now(UTC) - started).total_seconds() * 1000, 1
    )
    return result


@router.get(
    "/audit/summary",
    summary="Audit activity summary",
    dependencies=[Depends(RequirePermissions(Perm.AUDIT_READ))],
)
async def audit_summary(session: SessionDep, days: int = Query(30, ge=1, le=365)):
    since = datetime.now(UTC) - timedelta(days=days)

    by_action = (
        await session.execute(
            select(AuditLog.action, func.count())
            .where(AuditLog.created_at >= since)
            .group_by(AuditLog.action)
            .order_by(func.count().desc())
        )
    ).all()

    by_actor = (
        await session.execute(
            select(AuditLog.actor_username, func.count())
            .where(AuditLog.created_at >= since, AuditLog.actor_username.is_not(None))
            .group_by(AuditLog.actor_username)
            .order_by(func.count().desc())
            .limit(20)
        )
    ).all()

    daily = (
        await session.execute(
            select(func.date(AuditLog.created_at), func.count())
            .where(AuditLog.created_at >= since)
            .group_by(func.date(AuditLog.created_at))
            .order_by(func.date(AuditLog.created_at))
        )
    ).all()

    total = (await session.execute(select(func.count()).select_from(AuditLog))).scalar() or 0
    head = (
        await session.execute(select(AuditLog.chain_hash).order_by(AuditLog.id.desc()).limit(1))
    ).scalar()

    failed_logins = (
        await session.execute(
            select(func.count()).where(
                AuditLog.action == "LOGIN_FAILED", AuditLog.created_at >= since
            )
        )
    ).scalar() or 0

    return {
        "period_days": days,
        "total_entries": total,
        "head_chain_hash": head,
        "failed_logins": failed_logins,
        "by_action": [{"action": a, "count": c} for a, c in by_action],
        "top_actors": [{"actor": u, "count": c} for u, c in by_actor],
        "daily": [{"date": str(d), "count": c} for d, c in daily],
    }


@router.get(
    "/vault/documents/{document_id}/access-log",
    summary="Who has viewed this document",
    dependencies=[Depends(RequirePermissions(Perm.AUDIT_READ))],
)
async def access_log(document_id: uuid.UUID, session: SessionDep, page: PageDep):
    rows = (
        await session.execute(
            select(DocumentAccessLog)
            .where(DocumentAccessLog.document_id == document_id)
            .order_by(DocumentAccessLog.created_at.desc())
            .offset(page.offset)
            .limit(page.limit)
        )
    ).scalars().all()
    return [
        {
            "at": a.created_at,
            "user_id": str(a.user_id) if a.user_id else None,
            "ip": a.ip_address,
            "action": a.action,
            "purpose": a.purpose,
        }
        for a in rows
    ]


@router.get(
    "/vault/documents/{document_id}/download",
    summary="Signed download URL (access-logged)",
    dependencies=[Depends(RequirePermissions(Perm.DOCUMENT_READ))],
)
async def download(
    document_id: uuid.UUID,
    principal: CurrentUser,
    session: SessionDep,
    purpose: str = Query("verification", max_length=200),
):
    document = await session.get(Document, document_id)
    if document is None:
        raise HTTPException(status_code=404, detail="Document not found.")
    if not principal.may_access(
        state_id=document.state_id,
        district_id=document.district_id,
        tehsil_id=document.tehsil_id,
        village_id=document.village_id,
    ):
        raise HTTPException(status_code=403, detail="Outside your jurisdiction.")

    session.add(
        DocumentAccessLog(
            document_id=document_id,
            user_id=uuid.UUID(principal.user_id),
            action="DOWNLOAD",
            purpose=purpose,
        )
    )
    return {
        "url": presigned_get(document.storage_key),
        "filename": document.original_filename,
        "content_sha256": document.content_sha256,
        "expires_in_seconds": 3600,
        "note": "This download has been recorded in the access log.",
    }


@router.get(
    "/vault/stats",
    summary="Repository statistics",
    dependencies=[Depends(RequirePermissions(Perm.DOCUMENT_READ))],
)
async def vault_stats(session: SessionDep):
    documents = (await session.execute(select(func.count()).select_from(Document))).scalar() or 0
    total_bytes = (
        await session.execute(select(func.coalesce(func.sum(Document.size_bytes), 0)))
    ).scalar() or 0
    pages = (
        await session.execute(select(func.coalesce(func.sum(Document.page_count), 0)))
    ).scalar() or 0
    deduped = (
        await session.execute(
            select(func.count()).where(Document.is_duplicate_of.is_not(None))
        )
    ).scalar() or 0

    return {
        "documents_stored": documents,
        "pages_stored": int(pages),
        "storage_bytes": int(total_bytes),
        "storage_gb": round(int(total_bytes) / 1024**3, 2),
        "duplicates_prevented": deduped,
        "encryption": "AES-256 server-side",
        "integrity": "SHA-256 content addressing + hash-chained audit log",
    }
