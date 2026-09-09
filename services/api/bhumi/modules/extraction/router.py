"""Extraction — the canonical land record: search, detail, field edits, history."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import func, or_, select

from bhumi.core.audit import record_audit
from bhumi.core.deps import CurrentUser, PageDep, RequirePermissions, SessionDep, client_ip
from bhumi.core.enums import AuditAction, FieldSource, VerificationStatus
from bhumi.core.rbac import Perm, jurisdiction_filter
from bhumi.core.storage import presigned_get
from bhumi.db.models.documents import DocumentPage
from bhumi.db.models.governance import AuditLog, Correction
from bhumi.db.models.records import LandRecord, RecordField
from bhumi.db.models.validation import ValidationResult
from bhumi.modules.extraction.fields import (
    MANDATORY_FIELDS,
    FIELD_GROUPS,
    field_label,
)
from bhumi.modules.extraction.schemas import (
    FieldPatch,
    RecordDetail,
    RecordSummary,
    RecordUpdateRequest,
)

router = APIRouter()


@router.get("", response_model=list[RecordSummary], summary="Search land records")
async def search_records(
    principal: CurrentUser,
    session: SessionDep,
    page: PageDep,
    q: Annotated[str | None, Query(description="Owner name (any script), survey/khasra number")] = None,
    village_id: uuid.UUID | None = None,
    district_id: uuid.UUID | None = None,
    status: str | None = None,
    document_type: str | None = None,
    record_year: int | None = None,
    min_confidence: float | None = Query(None, ge=0, le=1),
    max_confidence: float | None = Query(None, ge=0, le=1),
    sort: str = Query("created_at", pattern="^(created_at|confidence_overall|survey_number)$"),
    order: str = Query("desc", pattern="^(asc|desc)$"),
):
    """Owner names are stored in both the native script and roman transliteration,
    so a search for "Ramchandra" finds "रामचंद्र" and vice versa."""
    stmt = select(LandRecord)
    for clause in jurisdiction_filter(principal, LandRecord):
        stmt = stmt.where(clause)

    if q:
        pattern = f"%{q.strip()}%"
        stmt = stmt.where(
            or_(
                LandRecord.owner_name.ilike(pattern),
                LandRecord.owner_name_roman.ilike(pattern),
                LandRecord.survey_number.ilike(pattern),
                LandRecord.khasra_number.ilike(pattern),
                LandRecord.khata_number.ilike(pattern),
            )
        )
    if village_id:
        stmt = stmt.where(LandRecord.village_id == village_id)
    if district_id:
        stmt = stmt.where(LandRecord.district_id == district_id)
    if status:
        stmt = stmt.where(LandRecord.verification_status == status)
    if document_type:
        stmt = stmt.where(LandRecord.document_type == document_type)
    if record_year:
        stmt = stmt.where(LandRecord.record_year == record_year)
    if min_confidence is not None:
        stmt = stmt.where(LandRecord.confidence_overall >= min_confidence)
    if max_confidence is not None:
        stmt = stmt.where(LandRecord.confidence_overall <= max_confidence)

    column = getattr(LandRecord, sort)
    stmt = stmt.order_by(column.desc() if order == "desc" else column.asc())

    rows = (await session.execute(stmt.offset(page.offset).limit(page.limit))).scalars().all()
    return [RecordSummary.from_model(r) for r in rows]


@router.get("/{record_id}", response_model=RecordDetail, summary="Record detail")
async def get_record(record_id: uuid.UUID, principal: CurrentUser, session: SessionDep):
    record = await session.get(LandRecord, record_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Record not found.")
    if not principal.may_access(
        state_id=record.state_id,
        district_id=record.district_id,
        tehsil_id=record.tehsil_id,
        village_id=record.village_id,
    ):
        raise HTTPException(status_code=403, detail="Outside your jurisdiction.")

    validations = (
        await session.execute(
            select(ValidationResult).where(ValidationResult.record_id == record_id)
        )
    ).scalars().all()

    pages = (
        await session.execute(
            select(DocumentPage)
            .where(DocumentPage.document_id == record.document_id)
            .order_by(DocumentPage.page_no)
        )
    ).scalars().all()

    return RecordDetail.build(record, validations, pages, presigned_get)


@router.patch(
    "/{record_id}",
    response_model=RecordDetail,
    summary="Correct field values",
    dependencies=[Depends(RequirePermissions(Perm.RECORD_EDIT))],
)
async def update_record(
    record_id: uuid.UUID,
    payload: RecordUpdateRequest,
    principal: CurrentUser,
    session: SessionDep,
    request: Request,
):
    """Every correction is captured twice: once on the record (so the data is
    right) and once in ``learning_corrections`` (so the model gets better)."""
    record = await session.get(LandRecord, record_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Record not found.")
    if not principal.may_access(
        state_id=record.state_id,
        district_id=record.district_id,
        tehsil_id=record.tehsil_id,
        village_id=record.village_id,
    ):
        raise HTTPException(status_code=403, detail="Outside your jurisdiction.")
    if record.verification_status in (VerificationStatus.VERIFIED.value,):
        raise HTTPException(
            status_code=409,
            detail="This record is already verified. Reopen it before editing.",
        )

    existing = {
        f.field_name: f
        for f in (
            await session.execute(
                select(RecordField).where(RecordField.record_id == record_id)
            )
        ).scalars().all()
    }

    changes: list[dict[str, Any]] = []
    for patch in payload.fields:
        field = existing.get(patch.field_name)
        old = field.value_normalized if field else None
        if old == patch.value:
            continue

        if field is None:
            field = RecordField(
                record_id=record_id,
                field_name=patch.field_name,
                is_mandatory=patch.field_name in MANDATORY_FIELDS,
            )
            session.add(field)
            existing[patch.field_name] = field

        if not field.is_corrected:
            field.original_value = field.value_normalized

        field.value_text = patch.value
        field.value_normalized = patch.value
        field.confidence = 1.0                       # a human said so
        field.source = FieldSource.HUMAN.value
        field.is_corrected = True
        field.corrected_by = uuid.UUID(principal.user_id)
        if patch.flag is not None:
            field.flag = patch.flag
        if patch.note is not None:
            field.note = patch.note

        # Mirror onto the denormalized column when one exists.
        if hasattr(record, patch.field_name):
            try:
                setattr(record, patch.field_name, patch.value)
            except Exception:
                pass

        session.add(
            Correction(
                record_id=record_id,
                page_id=record.page_id,
                field_name=patch.field_name,
                ai_value=field.original_value,
                human_value=patch.value,
                ai_confidence=field.confidence_breakdown.get("total")
                if field.confidence_breakdown
                else None,
                bbox=field.bbox,
                language=record.source_language,
                document_type=record.document_type,
                district_id=record.district_id,
                model_version=record.model_version,
                corrected_by=uuid.UUID(principal.user_id),
            )
        )
        changes.append({"field": patch.field_name, "from": old, "to": patch.value})

    if changes:
        record.correction_count += len(changes)
        record.confidence_overall = await _recompute_confidence(session, record_id)

    await record_audit(
        session,
        entity_type="land_record",
        entity_id=str(record_id),
        action=AuditAction.UPDATE.value,
        actor_id=principal.user_id,
        actor_username=principal.username,
        actor_roles=[r.value for r in principal.roles],
        actor_ip=client_ip(request),
        payload={"changes": changes},
    )

    await session.flush()
    return await get_record(record_id, principal, session)


async def _recompute_confidence(session, record_id: uuid.UUID) -> float:
    """Record confidence = 0.7 · min(mandatory) + 0.3 · mean(all).

    Weighting the weakest mandatory field this heavily is deliberate: a record
    with a perfect owner name and an unreadable survey number is not 90% good,
    it is unusable.
    """
    rows = (
        await session.execute(
            select(RecordField.field_name, RecordField.confidence).where(
                RecordField.record_id == record_id
            )
        )
    ).all()
    if not rows:
        return 0.0

    mandatory = [c for name, c in rows if name in MANDATORY_FIELDS]
    all_conf = [c for _, c in rows]
    min_mandatory = min(mandatory) if mandatory else 0.0
    mean_all = sum(all_conf) / len(all_conf)
    return round(min_mandatory * 0.7 + mean_all * 0.3, 4)


@router.get("/{record_id}/history", summary="Audit timeline for a record")
async def record_history(record_id: uuid.UUID, principal: CurrentUser, session: SessionDep):
    entries = (
        await session.execute(
            select(AuditLog)
            .where(AuditLog.entity_type == "land_record", AuditLog.entity_id == str(record_id))
            .order_by(AuditLog.created_at.desc())
            .limit(200)
        )
    ).scalars().all()

    return [
        {
            "id": e.id,
            "action": e.action,
            "actor": e.actor_username,
            "actor_roles": e.actor_roles,
            "at": e.created_at,
            "payload": e.payload,
            "chain_hash": e.chain_hash,
        }
        for e in entries
    ]


@router.get("/{record_id}/validation", summary="Validation results")
async def record_validation(record_id: uuid.UUID, principal: CurrentUser, session: SessionDep):
    rows = (
        await session.execute(
            select(ValidationResult)
            .where(ValidationResult.record_id == record_id)
            .order_by(ValidationResult.severity, ValidationResult.rule_key)
        )
    ).scalars().all()

    by_severity: dict[str, int] = {}
    for r in rows:
        if r.status in ("FAIL", "WARN"):
            by_severity[r.severity] = by_severity.get(r.severity, 0) + 1

    return {
        "record_id": str(record_id),
        "summary": by_severity,
        "passed": sum(1 for r in rows if r.status == "PASS"),
        "results": [
            {
                "rule": r.rule_key,
                "status": r.status,
                "severity": r.severity,
                "message": r.message,
                "fix_hint": r.fix_hint,
                "affected_fields": r.affected_fields,
                "observed": r.observed,
            }
            for r in rows
        ],
    }


@router.get("/meta/field-schema", summary="The 24-field canonical schema")
async def field_schema():
    """Served to the frontend so the Review console renders its form from one
    source of truth rather than a hard-coded list in two places."""
    return {
        "groups": [
            {
                "key": key,
                "label": group["label"],
                "fields": [
                    {
                        "name": f,
                        "label": field_label(f),
                        "mandatory": f in MANDATORY_FIELDS,
                    }
                    for f in group["fields"]
                ],
            }
            for key, group in FIELD_GROUPS.items()
        ],
        "mandatory": sorted(MANDATORY_FIELDS),
    }


@router.get("/meta/stats", summary="Record counts by status")
async def record_stats(principal: CurrentUser, session: SessionDep):
    stmt = select(LandRecord.verification_status, func.count()).group_by(
        LandRecord.verification_status
    )
    for clause in jurisdiction_filter(principal, LandRecord):
        stmt = stmt.where(clause)
    rows = (await session.execute(stmt)).all()
    return {"by_status": {s: c for s, c in rows}, "generated_at": datetime.now(UTC)}
