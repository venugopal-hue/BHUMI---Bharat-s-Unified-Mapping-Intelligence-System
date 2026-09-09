from __future__ import annotations

import json
import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class ParcelOut(BaseModel):
    id: str
    village_id: str | None = None
    survey_number: str | None = None
    khasra_number: str | None = None
    sub_division: str | None = None
    area_sqm: float | None = None
    perimeter_m: float | None = None
    land_classification: str | None = None
    source: str = "IMPORT"
    map_sheet_ref: str | None = None
    is_validated: bool = False
    topology_issues: list[str] = []
    geometry: dict[str, Any] | None = None
    created_at: datetime | None = None

    @classmethod
    def from_row(cls, p: Any, geojson: str | None) -> "ParcelOut":
        return cls(
            id=str(p.id),
            village_id=str(p.village_id) if p.village_id else None,
            survey_number=p.survey_number,
            khasra_number=p.khasra_number,
            sub_division=p.sub_division,
            area_sqm=float(p.area_sqm) if p.area_sqm is not None else None,
            perimeter_m=float(p.perimeter_m) if p.perimeter_m is not None else None,
            land_classification=p.land_classification,
            source=p.source,
            map_sheet_ref=p.map_sheet_ref,
            is_validated=p.is_validated,
            topology_issues=p.topology_issues or [],
            geometry=json.loads(geojson) if geojson else None,
            created_at=p.created_at,
        )


class ControlPoint(BaseModel):
    """One ground control point: a pixel on the scan matched to a real-world
    coordinate the operator picked on the basemap."""

    pixel_x: float = Field(..., ge=0)
    pixel_y: float = Field(..., ge=0)
    longitude: float = Field(..., ge=-180, le=180)
    latitude: float = Field(..., ge=-90, le=90)
    label: str | None = None


class GeoreferenceRequest(BaseModel):
    control_points: list[ControlPoint] = Field(..., min_length=3, max_length=200)
    transform_type: str = Field("affine", pattern="^(affine|polynomial2|similarity)$")


class LinkRequest(BaseModel):
    record_id: uuid.UUID
    match_type: str = Field("MANUAL", pattern="^(EXACT|FUZZY|MANUAL|SPATIAL)$")
    confidence: float = Field(1.0, ge=0, le=1)
