"""Extracting parcel polygons from a georeferenced cadastral map scan.

This is the part almost nobody attempts: reading the *map*, not just the
register, and reconciling the two. A recorded area that disagrees with the
mapped polygon is a boundary dispute waiting to be filed.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

import numpy as np
import structlog
from celery import shared_task
from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import Session

log = structlog.get_logger()


def _session() -> Session:
    from bhumi.core.config import settings

    return Session(create_engine(settings.SYNC_DATABASE_URL, pool_pre_ping=True))


def extract_polygons(
    image: np.ndarray, *, min_area_px: int = 800, max_polygons: int = 2000
) -> list[dict]:
    """Find closed parcel boundaries on a cadastral sheet.

    Cadastral maps are line drawings, so the approach is classical rather than
    learned: threshold, close the small gaps that scanning introduces, then take
    contours with a plausible shape. Every result is a *candidate* — an operator
    confirms before anything becomes an authoritative boundary.
    """
    import cv2

    gray = image if image.ndim == 2 else cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)

    binary = cv2.adaptiveThreshold(
        gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, 25, 8
    )

    # Scanned map lines break up; closing reconnects them so contours actually
    # close, which is the difference between 40 parcels and 4,000 fragments.
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
    closed = cv2.morphologyEx(binary, cv2.MORPH_CLOSE, kernel, iterations=2)

    contours, hierarchy = cv2.findContours(closed, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_SIMPLE)

    polygons: list[dict] = []
    for index, contour in enumerate(contours):
        area = cv2.contourArea(contour)
        if area < min_area_px:
            continue

        perimeter = cv2.arcLength(contour, True)
        if perimeter == 0:
            continue

        approx = cv2.approxPolyDP(contour, 0.008 * perimeter, True)
        if len(approx) < 4:
            continue

        # Parcels are compact; a long thin shape is almost always a road, a
        # canal, or a scanning artefact.
        compactness = 4 * np.pi * area / (perimeter**2)
        if compactness < 0.12:
            continue

        x, y, w, h = cv2.boundingRect(approx)
        aspect = max(w, h) / max(min(w, h), 1)
        if aspect > 12:
            continue

        ring = [(float(p[0][0]), float(p[0][1])) for p in approx]
        polygons.append(
            {
                "ring_px": ring,
                "area_px": float(area),
                "bbox": {"x": int(x), "y": int(y), "w": int(w), "h": int(h)},
                "vertices": len(ring),
                "compactness": round(float(compactness), 3),
                "confidence": round(min(0.55 + compactness, 0.92), 3),
                "index": index,
            }
        )

        if len(polygons) >= max_polygons:
            break

    return polygons


def read_parcel_labels(image: np.ndarray, polygons: list[dict]) -> None:
    """OCR the survey number written inside each parcel.

    This is what links geometry back to the register: a polygon with "142/2"
    inside it can be matched to the record extracted from the Khatauni page.
    """
    from ml.vision.ocr import TesseractEngine, normalize_digits

    engine = TesseractEngine("eng")

    for polygon in polygons:
        box = polygon["bbox"]
        pad = 4
        y1 = max(box["y"] + pad, 0)
        y2 = min(box["y"] + box["h"] - pad, image.shape[0])
        x1 = max(box["x"] + pad, 0)
        x2 = min(box["x"] + box["w"] - pad, image.shape[1])
        if y2 <= y1 or x2 <= x1:
            continue

        crop = image[y1:y2, x1:x2]
        if crop.size == 0 or min(crop.shape[:2]) < 12:
            continue

        spans = engine.recognize(crop, psm=7)
        candidates = [
            (normalize_digits(s.text).strip(), s.confidence)
            for s in spans
            if any(c.isdigit() for c in normalize_digits(s.text))
        ]
        if not candidates:
            continue

        text, confidence = max(candidates, key=lambda c: c[1])
        polygon["label"] = text
        polygon["label_confidence"] = round(confidence, 4)


@shared_task(name="worker.tasks.mapping.vectorize_sheet", bind=True)
def vectorize_sheet(self, sheet_id: str) -> dict:
    """Vectorize a georeferenced map sheet into parcels and link them to records."""
    import cv2

    from bhumi.core.storage import get_bytes
    from bhumi.db.models.mapping import MapSheet, Parcel
    from ml.mapping.georeference_client import polygon_to_world

    session = _session()
    try:
        sheet = session.get(MapSheet, uuid.UUID(sheet_id))
        if sheet is None:
            return {"error": "map_sheet_not_found"}
        if not sheet.transform:
            sheet.status = "GEOREFERENCE_REQUIRED"
            session.commit()
            return {"error": "sheet_not_georeferenced"}

        buffer = np.frombuffer(get_bytes(sheet.storage_key), dtype=np.uint8)
        image = cv2.imdecode(buffer, cv2.IMREAD_GRAYSCALE)
        if image is None:
            sheet.status = "FAILED"
            session.commit()
            return {"error": "image_decode_failed"}

        polygons = extract_polygons(image)
        read_parcel_labels(image, polygons)

        created = labelled = 0
        for polygon in polygons:
            ring = polygon_to_world(
                sheet.transform, polygon["ring_px"], sheet.transform_type or "affine"
            )
            wkt = "MULTIPOLYGON(((" + ",".join(f"{lon} {lat}" for lon, lat in ring) + ")))"

            parcel = Parcel(
                village_id=sheet.village_id,
                survey_number=polygon.get("label"),
                geom=func.ST_GeomFromText(wkt, 4326),
                source="VECTORIZED",
                map_sheet_id=sheet.id,
                map_sheet_ref=sheet.sheet_ref,
                label_confidence=polygon.get("label_confidence"),
                is_validated=False,
            )
            session.add(parcel)
            created += 1
            if polygon.get("label"):
                labelled += 1

        session.flush()

        # Compute real-world areas and centroids on the geography type, so the
        # numbers come out in square metres rather than square degrees.
        from sqlalchemy import text as sql_text

        session.execute(
            sql_text(
                """
                UPDATE parcels
                   SET area_sqm  = ROUND(ST_Area(geom::geography)::numeric, 2),
                       perimeter_m = ROUND(ST_Perimeter(geom::geography)::numeric, 2),
                       centroid  = ST_Centroid(geom),
                       topology_issues = CASE
                            WHEN NOT ST_IsValid(geom) THEN ARRAY['INVALID_GEOMETRY']::text[]
                            ELSE ARRAY[]::text[] END
                 WHERE map_sheet_id = :sheet_id
                """
            ),
            {"sheet_id": str(sheet.id)},
        )

        linked = _link_parcels_to_records(session, sheet)

        sheet.status = "VECTORIZED"
        sheet.parcels_extracted = created
        session.commit()

        log.info(
            "sheet_vectorized",
            sheet_id=sheet_id,
            parcels=created,
            labelled=labelled,
            linked=linked,
        )
        return {
            "sheet_id": sheet_id,
            "parcels_extracted": created,
            "parcels_labelled": labelled,
            "parcels_linked_to_records": linked,
        }
    except Exception as exc:
        session.rollback()
        log.exception("vectorize_failed", sheet_id=sheet_id)
        return {"error": str(exc)}
    finally:
        session.close()


def _link_parcels_to_records(session: Session, sheet) -> int:
    """Match each labelled parcel to the record with the same survey number.

    An unmatched parcel or an unmatched record is not discarded — both are
    tracked as orphans and surfaced on the Mapping worklist for field survey.
    """
    from bhumi.db.models.mapping import Parcel, ParcelRecordLink
    from bhumi.db.models.records import LandRecord

    parcels = (
        session.execute(
            select(Parcel).where(
                Parcel.map_sheet_id == sheet.id, Parcel.survey_number.is_not(None)
            )
        )
        .scalars()
        .all()
    )

    linked = 0
    for parcel in parcels:
        record = (
            session.execute(
                select(LandRecord)
                .where(
                    LandRecord.village_id == parcel.village_id,
                    LandRecord.survey_number == parcel.survey_number,
                )
                .order_by(LandRecord.created_at.desc())
                .limit(1)
            )
            .scalar_one_or_none()
        )
        if record is None:
            continue

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
                parcel_id=parcel.id,
                record_id=record.id,
                match_type="EXACT",
                confidence=parcel.label_confidence or 0.8,
                area_delta_pct=delta,
            )
        )
        record.parcel_id = parcel.id
        record.area_delta_pct = delta
        record.map_sheet_ref = sheet.sheet_ref
        linked += 1

    session.commit()
    return linked
