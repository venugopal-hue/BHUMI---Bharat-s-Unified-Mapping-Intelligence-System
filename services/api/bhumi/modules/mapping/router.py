"""Mapping — cadastral parcels, vector tiles, georeferencing, record linking.

The differentiator: BHUMI does not only read the register, it reads the *map*,
extracts the parcels, and reconciles the recorded area against the mapped one.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy import func, select, text

from bhumi.core.audit import record_audit
from bhumi.core.deps import CurrentUser, PageDep, RequirePermissions, SessionDep
from bhumi.core.enums import AuditAction
from bhumi.core.rbac import Perm, jurisdiction_filter
from bhumi.db.models.mapping import MapSheet, Parcel, ParcelRecordLink
from bhumi.db.models.records import LandRecord
from bhumi.modules.mapping.schemas import (
    GeoreferenceRequest,
    LinkRequest,
    ParcelOut,
)

router = APIRouter()


@router.get("/parcels", response_model=list[ParcelOut], summary="Parcels as GeoJSON features")
async def list_parcels(
    principal: CurrentUser,
    session: SessionDep,
    page: PageDep,
    village_id: uuid.UUID | None = None,
    survey_number: str | None = None,
    bbox: str | None = Query(None, description="minLon,minLat,maxLon,maxLat"),
    unlinked_only: bool = False,
):
    stmt = select(
        Parcel,
        func.ST_AsGeoJSON(Parcel.geom).label("geojson"),
        func.ST_Area(func.ST_Transform(Parcel.geom, 3857)).label("planar_area"),
    )
    for clause in jurisdiction_filter(principal, Parcel):
        stmt = stmt.where(clause)
    if village_id:
        stmt = stmt.where(Parcel.village_id == village_id)
    if survey_number:
        stmt = stmt.where(Parcel.survey_number == survey_number)
    if bbox:
        try:
            min_lon, min_lat, max_lon, max_lat = (float(v) for v in bbox.split(","))
        except ValueError:
            raise HTTPException(status_code=400, detail="bbox must be minLon,minLat,maxLon,maxLat") from None
        stmt = stmt.where(
            func.ST_Intersects(
                Parcel.geom, func.ST_MakeEnvelope(min_lon, min_lat, max_lon, max_lat, 4326)
            )
        )
    if unlinked_only:
        linked = select(ParcelRecordLink.parcel_id)
        stmt = stmt.where(Parcel.id.not_in(linked))

    rows = (await session.execute(stmt.offset(page.offset).limit(page.limit))).all()
    return [ParcelOut.from_row(p, gj) for p, gj, _ in rows]


@router.get("/parcels/{parcel_id}", response_model=ParcelOut, summary="Parcel detail")
async def get_parcel(parcel_id: uuid.UUID, principal: CurrentUser, session: SessionDep):
    row = (
        await session.execute(
            select(Parcel, func.ST_AsGeoJSON(Parcel.geom)).where(Parcel.id == parcel_id)
        )
    ).first()
    if row is None:
        raise HTTPException(status_code=404, detail="Parcel not found.")
    return ParcelOut.from_row(row[0], row[1])


@router.get(
    "/tiles/{z}/{x}/{y}.mvt",
    summary="Cadastral vector tiles",
    response_class=Response,
)
async def vector_tiles(z: int, x: int, y: int, session: SessionDep):
    """Mapbox Vector Tiles straight out of PostGIS. Rendering 40,000 parcels as
    GeoJSON would stall the browser; tiles keep the map fluid at any zoom."""
    if not (0 <= z <= 22):
        raise HTTPException(status_code=400, detail="Zoom out of range.")

    query = text(
        """
        WITH bounds AS (SELECT ST_TileEnvelope(:z, :x, :y) AS geom),
        mvtgeom AS (
            SELECT
                ST_AsMVTGeom(ST_Transform(p.geom, 3857), bounds.geom) AS geom,
                p.id::text            AS id,
                p.survey_number       AS survey_number,
                p.khasra_number       AS khasra_number,
                p.area_sqm            AS area_sqm,
                p.is_validated        AS is_validated,
                p.land_classification AS land_classification
            FROM parcels p, bounds
            WHERE ST_Intersects(ST_Transform(p.geom, 3857), bounds.geom)
            LIMIT 20000
        )
        SELECT ST_AsMVT(mvtgeom.*, 'parcels') FROM mvtgeom
        """
    )
    tile = (await session.execute(query, {"z": z, "x": x, "y": y})).scalar()
    return Response(
        content=bytes(tile or b""),
        media_type="application/vnd.mapbox-vector-tile",
        headers={"Cache-Control": "public, max-age=300"},
    )


@router.get("/villages/{village_id}/summary", summary="Digitization status for a village")
async def village_summary(village_id: uuid.UUID, principal: CurrentUser, session: SessionDep):
    parcels = (
        await session.execute(select(func.count()).where(Parcel.village_id == village_id))
    ).scalar() or 0
    linked = (
        await session.execute(
            select(func.count(func.distinct(ParcelRecordLink.parcel_id)))
            .select_from(ParcelRecordLink)
            .join(Parcel, Parcel.id == ParcelRecordLink.parcel_id)
            .where(Parcel.village_id == village_id)
        )
    ).scalar() or 0
    records = (
        await session.execute(
            select(func.count()).where(LandRecord.village_id == village_id)
        )
    ).scalar() or 0
    orphan_records = (
        await session.execute(
            select(func.count()).where(
                LandRecord.village_id == village_id, LandRecord.parcel_id.is_(None)
            )
        )
    ).scalar() or 0

    return {
        "village_id": str(village_id),
        "parcels": parcels,
        "parcels_linked": linked,
        "parcels_orphaned": parcels - linked,
        "records": records,
        "records_orphaned": orphan_records,
        "link_coverage_pct": round(linked / parcels * 100, 1) if parcels else 0.0,
    }


@router.get(
    "/validate/{village_id}",
    summary="Topology report for a village",
    dependencies=[Depends(RequirePermissions(Perm.GIS_READ))],
)
async def validate_topology(village_id: uuid.UUID, session: SessionDep):
    """Invalid geometry, overlaps and slivers are the geometric equivalent of a
    boundary dispute waiting to happen."""
    invalid = (
        await session.execute(
            select(Parcel.id, Parcel.survey_number, func.ST_IsValidReason(Parcel.geom))
            .where(Parcel.village_id == village_id, ~func.ST_IsValid(Parcel.geom))
            .limit(200)
        )
    ).all()

    overlaps = (
        await session.execute(
            text(
                """
                SELECT a.id::text AS a_id, a.survey_number AS a_survey,
                       b.id::text AS b_id, b.survey_number AS b_survey,
                       ROUND((ST_Area(ST_Intersection(a.geom, b.geom)::geography)
                              / NULLIF(ST_Area(a.geom::geography), 0) * 100)::numeric, 3) AS overlap_pct
                FROM parcels a
                JOIN parcels b
                  ON a.village_id = b.village_id
                 AND a.id < b.id
                 AND ST_Overlaps(a.geom, b.geom)
                WHERE a.village_id = :village_id
                  AND ST_Area(ST_Intersection(a.geom, b.geom)::geography) > 1
                LIMIT 200
                """
            ),
            {"village_id": str(village_id)},
        )
    ).mappings().all()

    slivers = (
        await session.execute(
            select(Parcel.id, Parcel.survey_number, Parcel.area_sqm)
            .where(Parcel.village_id == village_id, Parcel.area_sqm < 10)
            .limit(200)
        )
    ).all()

    issues = len(invalid) + len(overlaps) + len(slivers)
    return {
        "village_id": str(village_id),
        "issues_found": issues,
        "clean": issues == 0,
        "invalid_geometry": [
            {"parcel_id": str(i), "survey_number": s, "reason": r} for i, s, r in invalid
        ],
        "overlaps": [dict(row) for row in overlaps],
        "slivers": [
            {"parcel_id": str(i), "survey_number": s, "area_sqm": float(a or 0)}
            for i, s, a in slivers
        ],
    }


# ── Georeferencing ──────────────────────────────────────────────────
@router.get("/mapsheets", summary="Scanned cadastral map sheets")
async def list_map_sheets(
    principal: CurrentUser, session: SessionDep, page: PageDep, village_id: uuid.UUID | None = None
):
    stmt = select(MapSheet).order_by(MapSheet.created_at.desc())
    if village_id:
        stmt = stmt.where(MapSheet.village_id == village_id)
    rows = (await session.execute(stmt.offset(page.offset).limit(page.limit))).scalars().all()

    from bhumi.core.storage import presigned_get

    return [
        {
            "id": str(m.id),
            "sheet_ref": m.sheet_ref,
            "village_id": str(m.village_id) if m.village_id else None,
            "status": m.status,
            "scale_denominator": m.scale_denominator,
            "rms_error_m": m.rms_error_m,
            "parcels_extracted": m.parcels_extracted,
            "gcp_count": len(m.ground_control_points or []),
            "url": presigned_get(m.storage_key) if m.storage_key else None,
            "georeferenced_at": m.georeferenced_at,
        }
        for m in rows
    ]


@router.post(
    "/mapsheets/{sheet_id}/georeference",
    summary="Submit ground control points",
    dependencies=[Depends(RequirePermissions(Perm.GIS_GEOREFERENCE))],
)
async def georeference(
    sheet_id: uuid.UUID,
    payload: GeoreferenceRequest,
    principal: CurrentUser,
    session: SessionDep,
):
    """The operator clicks matching points on the scan and on the basemap; we
    fit a transform and report the residual error so a bad fit is obvious."""
    sheet = await session.get(MapSheet, sheet_id)
    if sheet is None:
        raise HTTPException(status_code=404, detail="Map sheet not found.")
    if len(payload.control_points) < 3:
        raise HTTPException(
            status_code=422,
            detail="At least three control points are needed to fit a transform.",
        )

    from bhumi.modules.mapping.georeference import fit_transform

    result = fit_transform(
        [(p.pixel_x, p.pixel_y) for p in payload.control_points],
        [(p.longitude, p.latitude) for p in payload.control_points],
        kind=payload.transform_type,
    )

    sheet.ground_control_points = [p.model_dump() for p in payload.control_points]
    sheet.transform = result["coefficients"]
    sheet.transform_type = result["type"]
    sheet.rms_error_m = result["rms_error_m"]
    sheet.srid = 4326
    sheet.status = "GEOREFERENCED"
    sheet.georeferenced_by = uuid.UUID(principal.user_id)
    sheet.georeferenced_at = datetime.now(UTC)

    await record_audit(
        session,
        entity_type="map_sheet",
        entity_id=str(sheet_id),
        action=AuditAction.UPDATE.value,
        actor_id=principal.user_id,
        actor_username=principal.username,
        payload={"gcps": len(payload.control_points), "rms_error_m": result["rms_error_m"]},
    )

    return {
        "status": "georeferenced",
        "transform_type": result["type"],
        "rms_error_m": result["rms_error_m"],
        "quality": result["quality"],
        "message": result["message"],
    }


@router.post(
    "/mapsheets/{sheet_id}/vectorize",
    status_code=202,
    summary="Extract parcel polygons from a georeferenced map",
    dependencies=[Depends(RequirePermissions(Perm.GIS_EDIT))],
)
async def vectorize(sheet_id: uuid.UUID, principal: CurrentUser, session: SessionDep):
    sheet = await session.get(MapSheet, sheet_id)
    if sheet is None:
        raise HTTPException(status_code=404, detail="Map sheet not found.")
    if sheet.status != "GEOREFERENCED":
        raise HTTPException(status_code=409, detail="Georeference this sheet before vectorizing.")

    sheet.status = "VECTORIZING"
    try:
        from celery import Celery

        from bhumi.core.config import settings

        Celery(broker=settings.CELERY_BROKER_URL).send_task(
            "worker.tasks.mapping.vectorize_sheet", args=[str(sheet_id)], queue="pipeline"
        )
    except Exception:
        pass
    return {"status": "queued", "sheet_id": str(sheet_id)}


@router.post(
    "/parcels/{parcel_id}/link",
    summary="Link a parcel to a land record",
    dependencies=[Depends(RequirePermissions(Perm.GIS_EDIT))],
)
async def link_parcel(
    parcel_id: uuid.UUID, payload: LinkRequest, principal: CurrentUser, session: SessionDep
):
    parcel = await session.get(Parcel, parcel_id)
    record = await session.get(LandRecord, payload.record_id)
    if parcel is None or record is None:
        raise HTTPException(status_code=404, detail="Parcel or record not found.")

    delta = None
    if parcel.area_sqm and record.plot_area_sqm:
        delta = round(
            abs(float(parcel.area_sqm) - float(record.plot_area_sqm))
            / float(record.plot_area_sqm)
            * 100,
            2,
        )

    session.add(
        ParcelRecordLink(
            parcel_id=parcel_id,
            record_id=payload.record_id,
            match_type=payload.match_type,
            confidence=payload.confidence,
            area_delta_pct=delta,
            linked_by=uuid.UUID(principal.user_id),
        )
    )
    record.parcel_id = parcel_id
    record.area_delta_pct = delta

    return {
        "status": "linked",
        "parcel_id": str(parcel_id),
        "record_id": str(payload.record_id),
        "area_delta_pct": delta,
        "within_tolerance": delta is not None and delta <= 5,
    }
