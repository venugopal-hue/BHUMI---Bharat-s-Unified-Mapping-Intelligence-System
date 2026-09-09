"""Validation — rule management, dry-run testing and duplicate resolution."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import yaml
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select

from bhumi.core.audit import record_audit
from bhumi.core.deps import CurrentUser, PageDep, RequirePermissions, SessionDep
from bhumi.core.enums import AuditAction
from bhumi.core.rbac import Perm
from bhumi.db.models.records import LandRecord
from bhumi.db.models.validation import (
    DuplicateCluster,
    ValidationResult,
    ValidationRule,
)
from bhumi.modules.validation.engine import Rule, UnsafeExpression, ValidationEngine, compile_expression
from bhumi.modules.validation.schemas import (
    DuplicateResolveRequest,
    RuleIn,
    RuleOut,
    RuleTestRequest,
)

router = APIRouter()

RULES_FILE = Path(__file__).parent / "rules.yaml"


def load_rules_from_file() -> list[Rule]:
    """The YAML library is the seed set; the database is the live source of truth."""
    if not RULES_FILE.exists():
        return []
    raw = yaml.safe_load(RULES_FILE.read_text(encoding="utf-8")) or []
    return [Rule.from_dict(item) for item in raw]


async def load_rules(session) -> list[Rule]:
    rows = (
        await session.execute(select(ValidationRule).where(ValidationRule.is_enabled.is_(True)))
    ).scalars().all()
    if not rows:
        return load_rules_from_file()

    from bhumi.core.enums import Severity

    return [
        Rule(
            key=r.rule_key,
            name=r.name,
            category=r.category,
            severity=Severity(r.severity),
            expression=r.expression,
            requires=r.requires_fields or [],
            applies_to_document_types=r.applies_to_document_types or [],
            applies_to_states=r.applies_to_states or [],
            params=r.params or {},
            message_en=r.message_en or "",
            message_hi=r.message_hi or "",
            fix_hint=r.fix_hint or "",
            description_en=r.description_en or "",
            enabled=r.is_enabled,
            execution_order=r.execution_order,
        )
        for r in rows
    ]


# ── Rules ───────────────────────────────────────────────────────────
@router.get("/rules", response_model=list[RuleOut], summary="List validation rules")
async def list_rules(
    principal: CurrentUser,
    session: SessionDep,
    category: str | None = None,
    severity: str | None = None,
    enabled_only: bool = False,
):
    rows = (await session.execute(select(ValidationRule).order_by(ValidationRule.execution_order))).scalars().all()

    if not rows:
        # Fall back to the shipped library so the screen is never empty on a
        # fresh install.
        return [
            RuleOut(
                id=r.key,
                rule_key=r.key,
                name=r.name,
                category=r.category,
                severity=r.severity.value,
                expression=r.expression,
                requires_fields=r.requires,
                message_en=r.message_en,
                message_hi=r.message_hi,
                fix_hint=r.fix_hint,
                is_enabled=r.enabled,
                execution_order=r.execution_order,
                source="library",
            )
            for r in load_rules_from_file()
            if (not category or r.category == category)
            and (not severity or r.severity.value == severity)
        ]

    out = []
    for r in rows:
        if category and r.category != category:
            continue
        if severity and r.severity != severity:
            continue
        if enabled_only and not r.is_enabled:
            continue
        out.append(RuleOut.from_model(r))
    return out


@router.post(
    "/rules",
    response_model=RuleOut,
    status_code=201,
    summary="Create a validation rule",
    dependencies=[Depends(RequirePermissions(Perm.RULES_EDIT))],
)
async def create_rule(payload: RuleIn, principal: CurrentUser, session: SessionDep):
    try:
        compile_expression(payload.expression)
    except (SyntaxError, UnsafeExpression) as exc:
        raise HTTPException(status_code=422, detail={"error": "invalid_expression", "message": str(exc)}) from None

    rule = ValidationRule(
        rule_key=payload.rule_key,
        name=payload.name,
        category=payload.category,
        severity=payload.severity,
        description_en=payload.description_en,
        description_hi=payload.description_hi,
        expression=payload.expression,
        params=payload.params,
        requires_fields=payload.requires_fields,
        applies_to_document_types=payload.applies_to_document_types,
        applies_to_states=payload.applies_to_states,
        message_en=payload.message_en,
        message_hi=payload.message_hi,
        fix_hint=payload.fix_hint,
        is_enabled=payload.is_enabled,
        execution_order=payload.execution_order,
        created_by=uuid.UUID(principal.user_id),
    )
    session.add(rule)
    await session.flush()

    await record_audit(
        session,
        entity_type="validation_rule",
        entity_id=str(rule.id),
        action=AuditAction.CONFIG_CHANGE.value,
        actor_id=principal.user_id,
        actor_username=principal.username,
        payload={"rule_key": rule.rule_key, "created": True},
    )
    return RuleOut.from_model(rule)


@router.patch(
    "/rules/{rule_id}",
    response_model=RuleOut,
    summary="Update a rule",
    dependencies=[Depends(RequirePermissions(Perm.RULES_EDIT))],
)
async def update_rule(
    rule_id: uuid.UUID, payload: RuleIn, principal: CurrentUser, session: SessionDep
):
    rule = await session.get(ValidationRule, rule_id)
    if rule is None:
        raise HTTPException(status_code=404, detail="Rule not found.")

    try:
        compile_expression(payload.expression)
    except (SyntaxError, UnsafeExpression) as exc:
        raise HTTPException(status_code=422, detail={"error": "invalid_expression", "message": str(exc)}) from None

    before = {"expression": rule.expression, "enabled": rule.is_enabled, "severity": rule.severity}
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(rule, key, value)
    rule.version += 1

    await record_audit(
        session,
        entity_type="validation_rule",
        entity_id=str(rule.id),
        action=AuditAction.CONFIG_CHANGE.value,
        actor_id=principal.user_id,
        actor_username=principal.username,
        payload={"rule_key": rule.rule_key, "before": before, "version": rule.version},
    )
    return RuleOut.from_model(rule)


@router.post(
    "/rules/test",
    summary="Dry-run a rule expression",
    dependencies=[Depends(RequirePermissions(Perm.RULES_READ))],
)
async def test_rule(payload: RuleTestRequest, principal: CurrentUser, session: SessionDep):
    """Lets an admin see exactly what a rule does before enabling it — against
    a hand-written context, or against a real record."""
    from bhumi.core.enums import Severity

    try:
        compile_expression(payload.expression)
    except (SyntaxError, UnsafeExpression) as exc:
        return {"valid": False, "error": str(exc)}

    context: dict[str, Any] = dict(payload.context or {})
    if payload.record_id:
        record = await session.get(LandRecord, payload.record_id)
        if record is None:
            raise HTTPException(status_code=404, detail="Record not found.")
        context = {**build_context_from_record(record), **context}

    rule = Rule(
        key="TEST",
        name="Test",
        category="test",
        severity=Severity(payload.severity),
        expression=payload.expression,
        requires=payload.requires_fields or [],
        params=payload.params or {},
        message_en=payload.message_en or "Rule failed.",
    )
    outcomes = ValidationEngine([rule]).evaluate(context)
    o = outcomes[0]
    return {
        "valid": True,
        "status": o.status.value,
        "message": o.message,
        "observed": o.observed,
        "context_used": {k: v for k, v in context.items() if k in (payload.requires_fields or [])},
    }


def build_context_from_record(record: LandRecord) -> dict[str, Any]:
    """Flatten a record into the namespace rules evaluate against."""
    fields = {f.field_name: f.value_normalized for f in (record.fields or [])}
    confidences = {f"{f.field_name}_confidence": f.confidence for f in (record.fields or [])}
    shares = [float(c.share) for c in (record.co_owners or []) if c.share is not None]

    return {
        **fields,
        **confidences,
        "survey_number": record.survey_number,
        "khasra_number": record.khasra_number,
        "khata_number": record.khata_number,
        "owner_name": record.owner_name,
        "owner_share": float(record.owner_share) if record.owner_share is not None else None,
        "owner_category": record.owner_category,
        "plot_area": float(record.plot_area_original) if record.plot_area_original else None,
        "plot_area_sqm": float(record.plot_area_sqm) if record.plot_area_sqm else None,
        "area_unit": record.area_unit_original,
        "land_classification": record.land_classification,
        "mutation_number": record.mutation_number,
        "mutation_date": record.mutation_date,
        "registration_number": record.registration_number,
        "registration_date": record.registration_date,
        "revenue_assessment": float(record.revenue_assessment) if record.revenue_assessment else None,
        "record_year": record.record_year,
        "document_type": record.document_type,
        "source_language": record.source_language,
        "co_owner_share_sum": round(sum(shares), 6) if shares else None,
        "has_parcel_link": record.parcel_id is not None,
        "min_mandatory_confidence": record.confidence_min_mandatory,
    }


@router.post(
    "/records/{record_id}/revalidate",
    summary="Re-run validation for one record",
    dependencies=[Depends(RequirePermissions(Perm.RECORD_EDIT))],
)
async def revalidate(record_id: uuid.UUID, principal: CurrentUser, session: SessionDep):
    record = await session.get(LandRecord, record_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Record not found.")

    rules = await load_rules(session)
    engine = ValidationEngine(rules)
    outcomes = engine.evaluate(build_context_from_record(record))
    summary = engine.summarize(outcomes)

    await session.execute(
        ValidationResult.__table__.delete().where(ValidationResult.record_id == record_id)
    )
    for o in outcomes:
        session.add(
            ValidationResult(
                record_id=record_id,
                rule_key=o.rule_key,
                status=o.status.value,
                severity=o.severity.value,
                message=o.message,
                fix_hint=o.fix_hint,
                observed=o.observed,
                affected_fields=o.affected_fields,
            )
        )

    record.validation_status = summary["status"]
    record.blocking_failures = summary["blocking"]
    return {"record_id": str(record_id), "summary": summary, "validated_at": datetime.now(UTC)}


# ── Duplicates ──────────────────────────────────────────────────────
@router.get("/duplicates", summary="Open duplicate clusters")
async def list_duplicates(principal: CurrentUser, session: SessionDep, page: PageDep):
    rows = (
        await session.execute(
            select(DuplicateCluster)
            .where(DuplicateCluster.status == "OPEN")
            .order_by(DuplicateCluster.score.desc())
            .offset(page.offset)
            .limit(page.limit)
        )
    ).scalars().all()

    return [
        {
            "id": str(c.id),
            "cluster_key": c.cluster_key,
            "match_type": c.match_type,
            "score": c.score,
            "signals": c.signals,
            "status": c.status,
            "record_ids": [str(m.record_id) for m in c.members],
            "created_at": c.created_at,
        }
        for c in rows
    ]


@router.post(
    "/duplicates/{cluster_id}/resolve",
    summary="Resolve a duplicate cluster",
    dependencies=[Depends(RequirePermissions(Perm.REVIEW_APPROVE))],
)
async def resolve_duplicate(
    cluster_id: uuid.UUID,
    payload: DuplicateResolveRequest,
    principal: CurrentUser,
    session: SessionDep,
):
    from bhumi.core.enums import VerificationStatus

    cluster = await session.get(DuplicateCluster, cluster_id)
    if cluster is None:
        raise HTTPException(status_code=404, detail="Duplicate cluster not found.")

    cluster.status = "RESOLVED"
    cluster.resolution = payload.resolution
    cluster.primary_record_id = payload.keep_record_id
    cluster.resolved_by = uuid.UUID(principal.user_id)
    cluster.resolved_at = datetime.now(UTC)
    cluster.resolution_note = payload.note

    if payload.resolution == "MERGED":
        for member in cluster.members:
            if member.record_id != payload.keep_record_id:
                record = await session.get(LandRecord, member.record_id)
                if record:
                    record.verification_status = VerificationStatus.DUPLICATE.value

    await record_audit(
        session,
        entity_type="duplicate_cluster",
        entity_id=str(cluster_id),
        action=AuditAction.UPDATE.value,
        actor_id=principal.user_id,
        actor_username=principal.username,
        payload={"resolution": payload.resolution, "kept": str(payload.keep_record_id or "")},
    )
    return {"status": "resolved", "resolution": payload.resolution}
