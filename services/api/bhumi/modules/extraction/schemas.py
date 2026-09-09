from __future__ import annotations

from datetime import datetime
from typing import Any, Callable

from pydantic import BaseModel, Field

from bhumi.modules.extraction.fields import FIELD_GROUPS, field_label, group_of


def confidence_band(value: float) -> str:
    """The colour ramp that is BHUMI's signature visual. Always paired with a
    number and an icon in the UI — never colour alone."""
    if value >= 0.95:
        return "high"
    if value >= 0.85:
        return "good"
    if value >= 0.70:
        return "medium"
    return "low"


class FieldOut(BaseModel):
    name: str
    label: str
    group: str | None = None
    value: str | None = None
    value_roman: str | None = None
    raw_text: str | None = None
    confidence: float = 0.0
    confidence_band: str = "low"
    confidence_breakdown: dict[str, float] | None = None
    source: str | None = None
    engine: str | None = None
    page_no: int | None = None
    bbox: dict[str, float] | None = None
    alternatives: list[Any] | None = None
    is_mandatory: bool = False
    is_corrected: bool = False
    original_value: str | None = None
    flag: str | None = None
    note: str | None = None


class CoOwnerOut(BaseModel):
    name: str
    name_roman: str | None = None
    relation: str | None = None
    share: float | None = None
    share_text: str | None = None
    confidence: float = 0.0


class ValidationResultOut(BaseModel):
    rule: str
    status: str
    severity: str
    message: str | None = None
    fix_hint: str | None = None
    affected_fields: list[str] = []
    observed: dict | None = None


class PageRefOut(BaseModel):
    id: str
    page_no: int
    width: int | None = None
    height: int | None = None
    url: str | None = None
    url_thumb: str | None = None


class RecordSummary(BaseModel):
    id: str
    document_id: str
    survey_number: str | None = None
    khasra_number: str | None = None
    owner_name: str | None = None
    owner_name_roman: str | None = None
    village_id: str | None = None
    district_id: str | None = None
    plot_area_sqm: float | None = None
    land_classification: str | None = None
    document_type: str | None = None
    record_year: int | None = None
    source_language: str | None = None
    confidence_overall: float = 0.0
    confidence_band: str = "low"
    verification_status: str
    validation_status: str | None = None
    blocking_failures: int = 0
    created_at: datetime

    @classmethod
    def from_model(cls, r: Any) -> "RecordSummary":
        return cls(
            id=str(r.id),
            document_id=str(r.document_id),
            survey_number=r.survey_number,
            khasra_number=r.khasra_number,
            owner_name=r.owner_name,
            owner_name_roman=r.owner_name_roman,
            village_id=str(r.village_id) if r.village_id else None,
            district_id=str(r.district_id) if r.district_id else None,
            plot_area_sqm=float(r.plot_area_sqm) if r.plot_area_sqm is not None else None,
            land_classification=r.land_classification,
            document_type=r.document_type,
            record_year=r.record_year,
            source_language=r.source_language,
            confidence_overall=r.confidence_overall,
            confidence_band=confidence_band(r.confidence_overall),
            verification_status=r.verification_status,
            validation_status=r.validation_status,
            blocking_failures=r.blocking_failures,
            created_at=r.created_at,
        )


class RecordDetail(RecordSummary):
    fields: list[FieldOut] = []
    field_groups: list[dict[str, Any]] = []
    co_owners: list[CoOwnerOut] = []
    validation: list[ValidationResultOut] = []
    validation_summary: dict[str, int] = {}
    pages: list[PageRefOut] = []
    parcel_id: str | None = None
    area_delta_pct: float | None = None
    model_version: str | None = None
    correction_count: int = 0
    extracted_at: datetime | None = None
    verified_at: datetime | None = None

    @classmethod
    def build(
        cls,
        record: Any,
        validations: list[Any],
        pages: list[Any],
        sign: Callable[[str], str],
    ) -> "RecordDetail":
        fields = [
            FieldOut(
                name=f.field_name,
                label=field_label(f.field_name),
                group=group_of(f.field_name),
                value=f.value_normalized or f.value_text,
                value_roman=f.value_roman,
                raw_text=f.value_text,
                confidence=f.confidence,
                confidence_band=confidence_band(f.confidence),
                confidence_breakdown=f.confidence_breakdown,
                source=f.source,
                engine=f.engine,
                page_no=f.page_no,
                bbox=f.bbox,
                alternatives=f.alternatives,
                is_mandatory=f.is_mandatory,
                is_corrected=f.is_corrected,
                original_value=f.original_value,
                flag=f.flag,
                note=f.note,
            )
            for f in record.fields
        ]

        summary: dict[str, int] = {}
        for v in validations:
            if v.status in ("FAIL", "WARN"):
                summary[v.severity] = summary.get(v.severity, 0) + 1

        base = RecordSummary.from_model(record)
        return cls(
            **base.model_dump(),
            fields=fields,
            field_groups=[
                {"key": k, "label": g["label"], "label_hi": g["label_hi"], "fields": g["fields"]}
                for k, g in FIELD_GROUPS.items()
            ],
            co_owners=[
                CoOwnerOut(
                    name=c.name,
                    name_roman=c.name_roman,
                    relation=c.relation,
                    share=float(c.share) if c.share is not None else None,
                    share_text=c.share_text,
                    confidence=c.confidence,
                )
                for c in record.co_owners
            ],
            validation=[
                ValidationResultOut(
                    rule=v.rule_key,
                    status=v.status,
                    severity=v.severity,
                    message=v.message,
                    fix_hint=v.fix_hint,
                    affected_fields=v.affected_fields or [],
                    observed=v.observed,
                )
                for v in validations
            ],
            validation_summary=summary,
            pages=[
                PageRefOut(
                    id=str(p.id),
                    page_no=p.page_no,
                    width=p.width,
                    height=p.height,
                    url=sign(p.storage_key_clean or p.storage_key_raw),
                    url_thumb=sign(p.storage_key_thumb) if p.storage_key_thumb else None,
                )
                for p in pages
            ],
            parcel_id=str(record.parcel_id) if record.parcel_id else None,
            area_delta_pct=record.area_delta_pct,
            model_version=record.model_version,
            correction_count=record.correction_count,
            extracted_at=record.extracted_at,
            verified_at=record.verified_at,
        )


class FieldPatch(BaseModel):
    field_name: str = Field(..., max_length=64)
    value: str | None = None
    flag: str | None = None
    note: str | None = None


class RecordUpdateRequest(BaseModel):
    fields: list[FieldPatch] = Field(..., min_length=1, max_length=64)
