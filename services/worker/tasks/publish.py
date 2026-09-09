"""Publishing verified records to external systems, via the outbox."""

from __future__ import annotations

import asyncio
import hashlib
import uuid
from datetime import UTC, datetime, timedelta

import structlog
from celery import shared_task
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session

log = structlog.get_logger()


def _session() -> Session:
    from bhumi.core.config import settings

    return Session(create_engine(settings.SYNC_DATABASE_URL, pool_pre_ping=True))


@shared_task(name="worker.tasks.publish.publish_record")
def publish_record(record_id: str) -> dict:
    """Queue a verified record for every enabled push connector."""
    from bhumi.core.enums import SyncDirection, SyncStatus, VerificationStatus
    from bhumi.db.models.governance import Integration, SyncJob
    from bhumi.db.models.records import LandRecord

    session = _session()
    try:
        record = session.get(LandRecord, uuid.UUID(record_id))
        if record is None:
            return {"error": "record_not_found"}
        if record.verification_status not in (
            VerificationStatus.VERIFIED.value,
            VerificationStatus.AUTO_APPROVED.value,
        ):
            return {"skipped": "record is not verified"}

        connectors = (
            session.execute(
                select(Integration).where(
                    Integration.is_enabled.is_(True),
                    Integration.kind.in_(["DILRMP", "LRMS"]),
                )
            )
            .scalars()
            .all()
        )

        queued = 0
        for connector in connectors:
            idempotency_key = hashlib.sha256(
                f"{connector.key}:{record.id}:{record.verified_at}".encode()
            ).hexdigest()[:40]

            already = (
                session.execute(
                    select(SyncJob).where(
                        SyncJob.idempotency_key == idempotency_key,
                        SyncJob.status.in_(
                            [SyncStatus.SUCCESS.value, SyncStatus.PENDING.value]
                        ),
                    )
                )
                .scalar_one_or_none()
            )
            if already:
                continue

            session.add(
                SyncJob(
                    integration_key=connector.key,
                    record_id=record.id,
                    document_id=record.document_id,
                    direction=SyncDirection.PUSH.value,
                    idempotency_key=idempotency_key,
                    status=SyncStatus.PENDING.value,
                    next_attempt_at=datetime.now(UTC),
                )
            )
            queued += 1

        session.commit()
        if queued:
            drain_outbox.apply_async(queue="publish")
        return {"record_id": record_id, "queued": queued}
    finally:
        session.close()


@shared_task(name="worker.tasks.publish.drain_outbox")
def drain_outbox(limit: int = 50) -> dict:
    """Send pending sync jobs.

    The outbox is what makes a publish reliable: the job row was written in the
    same transaction as the approval, so a crash between "verified" and "sent"
    loses nothing — this task simply picks it up next time round.
    """
    from bhumi.core.enums import SyncStatus
    from bhumi.db.models.governance import Integration, SyncJob
    from bhumi.db.models.records import LandRecord
    from bhumi.modules.integrations.connectors import build_connector

    session = _session()
    sent = failed = 0

    try:
        jobs = (
            session.execute(
                select(SyncJob)
                .where(
                    SyncJob.status == SyncStatus.PENDING.value,
                    SyncJob.next_attempt_at <= datetime.now(UTC),
                )
                .order_by(SyncJob.created_at)
                .limit(limit)
                .with_for_update(skip_locked=True)
            )
            .scalars()
            .all()
        )

        for job in jobs:
            integration = (
                session.execute(
                    select(Integration).where(Integration.key == job.integration_key)
                )
                .scalar_one_or_none()
            )
            if integration is None or not integration.is_enabled:
                job.status = SyncStatus.DEAD_LETTER.value
                job.error = "Connector is not configured or is disabled."
                continue

            if integration.circuit_open_until and integration.circuit_open_until > datetime.now(UTC):
                job.next_attempt_at = integration.circuit_open_until
                continue

            record = session.get(LandRecord, job.record_id)
            if record is None:
                job.status = SyncStatus.DEAD_LETTER.value
                job.error = "Record no longer exists."
                continue

            payload = _record_payload(session, record)
            connector = build_connector(
                integration.key,
                {
                    "base_url": integration.base_url,
                    "api_key": (integration.auth_config or {}).get("api_key"),
                    "field_mapping": integration.field_mapping,
                },
            )

            job.status = SyncStatus.IN_PROGRESS.value
            job.attempts += 1
            job.request_payload = payload
            session.commit()

            result = asyncio.run(connector.push_record(payload, job.idempotency_key))

            if result.success:
                job.status = SyncStatus.SUCCESS.value
                job.external_id = result.external_id
                job.http_status = result.http_status
                job.response_payload = result.response
                job.completed_at = datetime.now(UTC)
                job.error = None
                integration.success_count += 1
                integration.failure_count = 0
                integration.health_status = "HEALTHY"
                record.published_at = datetime.now(UTC)
                sent += 1
            else:
                job.http_status = result.http_status
                job.error = (result.error or "Unknown error")[:2000]
                integration.failure_count += 1

                if job.attempts >= job.max_attempts:
                    job.status = SyncStatus.DEAD_LETTER.value
                    log.error(
                        "sync_dead_lettered",
                        job_id=str(job.id),
                        connector=job.integration_key,
                        error=job.error,
                    )
                else:
                    job.status = SyncStatus.PENDING.value
                    backoff = min(2**job.attempts, 60)
                    job.next_attempt_at = datetime.now(UTC) + timedelta(minutes=backoff)

                # Five consecutive failures: stop hammering a system that is
                # clearly down, and surface it on the operations dashboard.
                if integration.failure_count >= 5:
                    integration.circuit_open_until = datetime.now(UTC) + timedelta(minutes=5)
                    integration.health_status = "CIRCUIT_OPEN"
                    log.warning("connector_circuit_opened", connector=integration.key)
                failed += 1

            session.commit()

        return {"processed": len(jobs), "sent": sent, "failed": failed}
    finally:
        session.close()


def _record_payload(session: Session, record) -> dict:
    from bhumi.db.models.jurisdiction import District, State, Tehsil, Village

    village = session.get(Village, record.village_id) if record.village_id else None
    tehsil = session.get(Tehsil, record.tehsil_id) if record.tehsil_id else None
    district = session.get(District, record.district_id) if record.district_id else None
    state = session.get(State, record.state_id) if record.state_id else None

    return {
        "id": str(record.id),
        "survey_number": record.survey_number,
        "khasra_number": record.khasra_number,
        "khata_number": record.khata_number,
        "owner_name": record.owner_name,
        "owner_name_roman": record.owner_name_roman,
        "father_or_husband_name": record.father_or_husband_name,
        "plot_area_sqm": float(record.plot_area_sqm) if record.plot_area_sqm else None,
        "land_classification": record.land_classification,
        "mutation_number": record.mutation_number,
        "registration_number": record.registration_number,
        "record_year": record.record_year,
        "village": village.name_en if village else None,
        "village_lgd_code": village.lgd_code if village else None,
        "tehsil": tehsil.name_en if tehsil else None,
        "district": district.name_en if district else None,
        "state": state.name_en if state else None,
        "verified_at": record.verified_at.isoformat() if record.verified_at else None,
        "confidence": record.confidence_overall,
        "source": "BHUMI",
    }


@shared_task(name="worker.tasks.publish.check_connector_health")
def check_connector_health() -> dict:
    """Poll every connector so a broken integration is visible before someone
    notices a day of records failed to publish."""
    from bhumi.db.models.governance import Integration
    from bhumi.modules.integrations.connectors import build_connector

    session = _session()
    try:
        integrations = (
            session.execute(select(Integration).where(Integration.is_enabled.is_(True)))
            .scalars()
            .all()
        )
        results = {}
        for integration in integrations:
            connector = build_connector(
                integration.key,
                {
                    "base_url": integration.base_url,
                    "api_key": (integration.auth_config or {}).get("api_key"),
                },
            )
            status = asyncio.run(connector.health())
            integration.health_status = "HEALTHY" if status.healthy else "UNHEALTHY"
            integration.last_health_check = datetime.now(UTC)
            if status.healthy and integration.circuit_open_until:
                integration.circuit_open_until = None
                integration.failure_count = 0
            results[integration.key] = status.healthy

        session.commit()
        return results
    finally:
        session.close()
