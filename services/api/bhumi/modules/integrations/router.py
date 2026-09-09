"""Integrations — connectors, sync jobs, webhooks and the public API."""

from __future__ import annotations

import hashlib
import hmac
import json
import secrets
import uuid
from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, or_, select

from bhumi.core.audit import record_audit
from bhumi.core.config import settings
from bhumi.core.deps import CurrentUser, OptionalUser, PageDep, RequirePermissions, SessionDep
from bhumi.core.enums import AuditAction, SyncDirection, SyncStatus, VerificationStatus
from bhumi.core.rbac import Perm
from bhumi.db.models.governance import Integration, SyncJob, Webhook
from bhumi.db.models.records import LandRecord
from bhumi.modules.integrations.connectors import build_connector

router = APIRouter()


# ── Connectors ──────────────────────────────────────────────────────
@router.get(
    "/integrations",
    summary="Connector catalogue and health",
    dependencies=[Depends(RequirePermissions(Perm.INTEGRATION_READ))],
)
async def list_integrations(session: SessionDep):
    rows = (await session.execute(select(Integration).order_by(Integration.key))).scalars().all()
    return [
        {
            "key": i.key,
            "name": i.name,
            "kind": i.kind,
            "base_url": i.base_url,
            "enabled": i.is_enabled,
            "health_status": i.health_status,
            "last_health_check": i.last_health_check,
            "circuit_open": bool(i.circuit_open_until and i.circuit_open_until > datetime.now(UTC)),
            "success_count": i.success_count,
            "failure_count": i.failure_count,
            "mapped_fields": len((i.field_mapping or {}).get("fields", {})),
        }
        for i in rows
    ]


@router.post(
    "/integrations/{key}/health",
    summary="Check a connector",
    dependencies=[Depends(RequirePermissions(Perm.INTEGRATION_READ))],
)
async def check_health(key: str, session: SessionDep):
    integration = (
        await session.execute(select(Integration).where(Integration.key == key))
    ).scalar_one_or_none()
    if integration is None:
        raise HTTPException(status_code=404, detail="Connector not configured.")

    connector = build_connector(
        key,
        {
            "base_url": integration.base_url,
            "api_key": (integration.auth_config or {}).get("api_key"),
            "field_mapping": integration.field_mapping,
        },
    )
    status = await connector.health()
    integration.health_status = "HEALTHY" if status.healthy else "UNHEALTHY"
    integration.last_health_check = datetime.now(UTC)

    return {
        "key": key,
        "healthy": status.healthy,
        "latency_ms": status.latency_ms,
        "message": status.message,
    }


@router.post(
    "/integrations/{key}/sync",
    status_code=202,
    summary="Publish verified records to a connector",
    dependencies=[Depends(RequirePermissions(Perm.INTEGRATION_MANAGE))],
)
async def trigger_sync(
    key: str,
    principal: CurrentUser,
    session: SessionDep,
    record_id: uuid.UUID | None = None,
    batch_id: uuid.UUID | None = None,
    limit: int = Query(200, ge=1, le=2000),
):
    """Writes to the outbox in the same transaction as the caller's request, so
    a publish is never lost between the decision and the network call."""
    stmt = select(LandRecord).where(
        LandRecord.verification_status.in_(
            [VerificationStatus.VERIFIED.value, VerificationStatus.AUTO_APPROVED.value]
        )
    )
    if record_id:
        stmt = stmt.where(LandRecord.id == record_id)
    if batch_id:
        stmt = stmt.where(LandRecord.batch_id == batch_id)

    records = (await session.execute(stmt.limit(limit))).scalars().all()
    if not records:
        return {"queued": 0, "message": "No verified records matched."}

    queued = 0
    for record in records:
        idempotency_key = hashlib.sha256(
            f"{key}:{record.id}:{record.verified_at}".encode()
        ).hexdigest()[:40]

        existing = (
            await session.execute(
                select(SyncJob).where(
                    SyncJob.idempotency_key == idempotency_key,
                    SyncJob.status == SyncStatus.SUCCESS.value,
                )
            )
        ).scalar_one_or_none()
        if existing:
            continue

        session.add(
            SyncJob(
                integration_key=key,
                record_id=record.id,
                document_id=record.document_id,
                direction=SyncDirection.PUSH.value,
                idempotency_key=idempotency_key,
                status=SyncStatus.PENDING.value,
                next_attempt_at=datetime.now(UTC),
            )
        )
        queued += 1

    await record_audit(
        session,
        entity_type="integration",
        entity_id=key,
        action=AuditAction.PUBLISH.value,
        actor_id=principal.user_id,
        actor_username=principal.username,
        payload={"queued": queued, "batch_id": str(batch_id or "")},
    )
    _drain_outbox()
    return {"queued": queued, "integration": key}


def _drain_outbox() -> None:
    try:
        from celery import Celery

        Celery(broker=settings.CELERY_BROKER_URL).send_task(
            "worker.tasks.publish.drain_outbox", queue="publish"
        )
    except Exception:
        pass


@router.get(
    "/integrations/sync-jobs",
    summary="Sync history",
    dependencies=[Depends(RequirePermissions(Perm.INTEGRATION_READ))],
)
async def sync_jobs(
    session: SessionDep,
    page: PageDep,
    integration_key: str | None = None,
    status: str | None = None,
):
    stmt = select(SyncJob).order_by(SyncJob.created_at.desc())
    if integration_key:
        stmt = stmt.where(SyncJob.integration_key == integration_key)
    if status:
        stmt = stmt.where(SyncJob.status == status)

    rows = (await session.execute(stmt.offset(page.offset).limit(page.limit))).scalars().all()
    return [
        {
            "id": str(j.id),
            "integration": j.integration_key,
            "record_id": str(j.record_id) if j.record_id else None,
            "direction": j.direction,
            "status": j.status,
            "external_id": j.external_id,
            "http_status": j.http_status,
            "attempts": j.attempts,
            "error": j.error,
            "created_at": j.created_at,
            "completed_at": j.completed_at,
        }
        for j in rows
    ]


@router.post(
    "/integrations/sync-jobs/{job_id}/retry",
    summary="Retry a dead-lettered sync",
    dependencies=[Depends(RequirePermissions(Perm.INTEGRATION_MANAGE))],
)
async def retry_sync(job_id: uuid.UUID, session: SessionDep):
    job = await session.get(SyncJob, job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Sync job not found.")
    job.status = SyncStatus.PENDING.value
    job.attempts = 0
    job.error = None
    job.next_attempt_at = datetime.now(UTC)
    _drain_outbox()
    return {"status": "requeued", "job_id": str(job_id)}


# ── Webhooks ────────────────────────────────────────────────────────
@router.post(
    "/webhooks",
    status_code=201,
    summary="Register a webhook",
    dependencies=[Depends(RequirePermissions(Perm.INTEGRATION_MANAGE))],
)
async def create_webhook(
    url: str,
    events: list[str],
    session: SessionDep,
    client_id: uuid.UUID | None = None,
):
    secret = secrets.token_urlsafe(32)
    hook = Webhook(client_id=client_id, url=url, events=events, secret=secret)
    session.add(hook)
    await session.flush()
    return {
        "id": str(hook.id),
        "url": url,
        "events": events,
        "secret": secret,
        "signature_header": "X-BHUMI-Signature",
        "note": "Store this secret now — it is not shown again.",
    }


def sign_payload(secret: str, payload: dict[str, Any]) -> str:
    body = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()
    return hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()


# ── Public API (citizen-facing, masked) ─────────────────────────────
@router.get("/public/records/search", summary="Public record search")
async def public_search(
    session: SessionDep,
    principal: OptionalUser,
    page: PageDep,
    survey_number: str | None = None,
    village_lgd_code: str | None = None,
    owner_name: str | None = None,
):
    """Citizen-facing search. Only verified records, and owner names are masked
    unless the caller is an authenticated officer — a public land-record portal
    should not double as a bulk personal-data export."""
    if not any([survey_number, village_lgd_code, owner_name]):
        raise HTTPException(
            status_code=400,
            detail="Provide at least a survey number, village code, or owner name.",
        )

    from bhumi.db.models.jurisdiction import Village

    stmt = select(LandRecord).where(
        LandRecord.verification_status.in_(
            [VerificationStatus.VERIFIED.value, VerificationStatus.AUTO_APPROVED.value]
        )
    )
    if survey_number:
        stmt = stmt.where(LandRecord.survey_number == survey_number.strip())
    if village_lgd_code:
        village = (
            await session.execute(select(Village).where(Village.lgd_code == village_lgd_code))
        ).scalar_one_or_none()
        if village is None:
            raise HTTPException(status_code=404, detail="Village code not recognised.")
        stmt = stmt.where(LandRecord.village_id == village.id)
    if owner_name:
        pattern = f"%{owner_name.strip()}%"
        stmt = stmt.where(
            or_(LandRecord.owner_name.ilike(pattern), LandRecord.owner_name_roman.ilike(pattern))
        )

    rows = (await session.execute(stmt.limit(min(page.limit, 50)))).scalars().all()
    authenticated = principal is not None

    return {
        "count": len(rows),
        "masked": not authenticated,
        "results": [
            {
                "id": str(r.id),
                "survey_number": r.survey_number,
                "khasra_number": r.khasra_number,
                "owner_name": r.owner_name if authenticated else _mask_name(r.owner_name),
                "plot_area_sqm": float(r.plot_area_sqm) if r.plot_area_sqm else None,
                "land_classification": r.land_classification,
                "record_year": r.record_year,
                "verified_at": r.verified_at,
                "certificate_url": f"/api/v1/public/records/{r.id}/certificate",
            }
            for r in rows
        ],
    }


def _mask_name(name: str | None) -> str | None:
    """Show enough for a citizen to recognise their own record, not enough to
    harvest a village's ownership roll."""
    if not name:
        return None
    parts = name.split()
    return " ".join(p[0] + "·" * max(len(p) - 1, 1) if len(p) > 1 else p for p in parts)


@router.get("/public/records/{record_id}/certificate", summary="QR-verifiable extract")
async def certificate(record_id: uuid.UUID, session: SessionDep):
    record = await session.get(LandRecord, record_id)
    if record is None or record.verification_status not in (
        VerificationStatus.VERIFIED.value,
        VerificationStatus.AUTO_APPROVED.value,
    ):
        raise HTTPException(status_code=404, detail="No verified record with that identifier.")

    verification_code = hashlib.sha256(
        f"{record.id}{record.verified_at}{settings.SECRET_KEY}".encode()
    ).hexdigest()[:16].upper()

    return {
        "record_id": str(record.id),
        "survey_number": record.survey_number,
        "khasra_number": record.khasra_number,
        "owner_name": record.owner_name,
        "plot_area_sqm": float(record.plot_area_sqm) if record.plot_area_sqm else None,
        "land_classification": record.land_classification,
        "record_year": record.record_year,
        "verified_at": record.verified_at,
        "verification_code": verification_code,
        "verify_url": f"/verify/{verification_code}",
        "issued_at": datetime.now(UTC),
        "issuer": "BHUMI — Government of India",
        "disclaimer": (
            "This is a digitized extract of a land record. It reflects the source "
            "document held by the revenue office and is not by itself a title deed."
        ),
    }


@router.get("/public/stats", summary="Open digitization statistics")
async def public_stats(session: SessionDep):
    """Open data: aggregate counts only, no personal information."""
    total = (await session.execute(select(func.count()).select_from(LandRecord))).scalar() or 0
    verified = (
        await session.execute(
            select(func.count()).where(
                LandRecord.verification_status.in_(
                    [VerificationStatus.VERIFIED.value, VerificationStatus.AUTO_APPROVED.value]
                )
            )
        )
    ).scalar() or 0
    return {
        "records_digitized": total,
        "records_verified": verified,
        "verification_rate_pct": round(verified / total * 100, 1) if total else 0.0,
        "as_of": datetime.now(UTC),
    }
