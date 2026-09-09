"""The processing pipeline: Intake → Vision → Extraction → Validation → routing.

Each stage updates the document's status before it starts, so a stuck document
shows exactly where it stalled rather than sitting in a generic "processing"
state that tells an operator nothing.
"""

from __future__ import annotations

import io
import time
import uuid
from datetime import UTC, datetime, timedelta

import numpy as np
import structlog
from celery import shared_task
from sqlalchemy import create_engine, select, text
from sqlalchemy.orm import Session

from worker.celery_app import celery_app  # noqa: F401 — registers the app

log = structlog.get_logger()


def _session() -> Session:
    from bhumi.core.config import settings

    engine = create_engine(settings.SYNC_DATABASE_URL, pool_pre_ping=True)
    return Session(engine)


def _load_pages(storage_key: str, mime_type: str) -> list[np.ndarray]:
    """Render a PDF or decode an image into page-level numpy arrays."""
    import cv2

    from bhumi.core.storage import get_bytes

    raw = get_bytes(storage_key)

    if mime_type == "application/pdf":
        from pdf2image import convert_from_bytes

        pages = convert_from_bytes(raw, dpi=300, fmt="png")
        return [cv2.cvtColor(np.array(p), cv2.COLOR_RGB2BGR) for p in pages]

    buffer = np.frombuffer(raw, dtype=np.uint8)
    image = cv2.imdecode(buffer, cv2.IMREAD_COLOR)
    if image is None:
        raise ValueError("The uploaded file could not be decoded as an image.")

    # Multi-page TIFF is common for scanned registers.
    if mime_type == "image/tiff":
        ok, frames = cv2.imreadmulti(io.BytesIO(raw).getvalue(), flags=cv2.IMREAD_COLOR)
        if ok and len(frames) > 1:
            return list(frames)
    return [image]


def _encode(image: np.ndarray, quality: int = 88) -> bytes:
    import cv2

    ok, buffer = cv2.imencode(".jpg", image, [int(cv2.IMWRITE_JPEG_QUALITY), quality])
    if not ok:
        raise ValueError("Failed to encode the processed page.")
    return buffer.tobytes()


@shared_task(name="worker.tasks.pipeline.process_document", bind=True, max_retries=2)
def process_document(self, document_id: str) -> dict:
    """Run the full pipeline for one document."""
    from bhumi.core.config import settings
    from bhumi.core.enums import DocumentStatus, PipelineStage
    from bhumi.core.storage import build_key, put_bytes
    from bhumi.db.models.documents import Document, DocumentPage, OcrSpan
    from ml.extraction.extract import extract_record
    from ml.vision.ocr import SCRIPT_TO_TESSERACT, recognize_page
    from ml.vision.preprocess import process_page

    started = time.perf_counter()
    session = _session()

    try:
        document = session.get(Document, uuid.UUID(document_id))
        if document is None:
            return {"error": "document_not_found", "document_id": document_id}

        document.status = DocumentStatus.PREPROCESSING.value
        document.current_stage = PipelineStage.INTAKE.value
        document.processing_started_at = datetime.now(UTC)
        session.commit()

        pages = _load_pages(document.storage_key, document.mime_type)
        document.page_count = len(pages)

        batch_context = _batch_context(session, document)
        page_results = []
        detected_languages: set[str] = set()
        quality_scores: list[int] = []

        for index, image in enumerate(pages, start=1):
            # ── Intake: cleanup ──────────────────────────────────────
            processed = process_page(image, source_dpi=200, target_dpi=settings.TARGET_DPI)
            quality = processed["quality"]
            quality_scores.append(quality.score)

            prefix = build_key("pages", document_id, f"{index:04d}")
            key_raw = put_bytes(f"{prefix}/raw.jpg", _encode(image), "image/jpeg")
            key_clean = put_bytes(f"{prefix}/clean.jpg", _encode(processed["clean"]), "image/jpeg")

            import cv2

            thumbnail = cv2.resize(processed["clean"], (0, 0), fx=0.22, fy=0.22)
            key_thumb = put_bytes(f"{prefix}/thumb.jpg", _encode(thumbnail, 75), "image/jpeg")

            page = DocumentPage(
                document_id=document.id,
                page_no=index,
                storage_key_raw=key_raw,
                storage_key_clean=key_clean,
                storage_key_thumb=key_thumb,
                width=processed["width"],
                height=processed["height"],
                dpi=processed["dpi"],
                skew_angle=processed["skew_angle"],
                rotation_applied=processed["rotation_applied"],
                quality_score=quality.score,
                quality_issues=quality.issues,
                blur_score=quality.blur,
                contrast_score=quality.contrast,
                ink_coverage=quality.ink_coverage,
                has_handwriting=processed["has_handwriting"],
            )
            session.add(page)
            session.flush()

            # A page this poor will produce noise, not data. Say so instead of
            # filling the review queue with unreadable records.
            if not quality.usable:
                log.warning(
                    "page_quality_too_low",
                    document_id=document_id,
                    page=index,
                    score=quality.score,
                    issues=quality.issues,
                )
                continue

            # ── Vision: OCR ──────────────────────────────────────────
            document.status = DocumentStatus.EXTRACTING.value
            document.current_stage = PipelineStage.VISION.value
            session.commit()

            langs = settings.TESSERACT_LANGS
            ocr = recognize_page(
                processed["clean"],
                engines=settings.ocr_engines,
                langs=langs,
                has_handwriting=processed["has_handwriting"],
            )
            page.detected_script = ocr["dominant_script"]
            if ocr.get("language"):
                detected_languages.add(ocr["language"])

            for span in ocr["spans"]:
                session.add(
                    OcrSpan(
                        page_id=page.id,
                        text=span["text"],
                        text_normalized=span["text_normalized"],
                        script=span["script"],
                        language=span["language"],
                        bbox=span["bbox"],
                        confidence=span["confidence"],
                        raw_confidence=span["raw_confidence"],
                        engine=span["engine"],
                        is_handwritten=span["is_handwritten"],
                        alternatives=span["alternatives"],
                        reading_order=span["reading_order"],
                    )
                )

            # ── Extraction ───────────────────────────────────────────
            document.current_stage = PipelineStage.EXTRACTION.value
            extraction = extract_record(
                ocr,
                page_no=index,
                document_type=document.document_type,
                batch_context=batch_context,
            )
            extraction["_page_id"] = page.id
            extraction["_page_quality"] = quality.score
            extraction["_engine_agreement"] = ocr["engine_agreement"]
            page_results.append(extraction)
            session.commit()

        if page_results:
            best = max(page_results, key=lambda r: r["document_type_confidence"])
            document.document_type = best["document_type"]
            document.document_type_confidence = best["document_type_confidence"]

        document.detected_languages = sorted(detected_languages)
        document.quality_score = (
            int(sum(quality_scores) / len(quality_scores)) if quality_scores else None
        )
        session.commit()

        if not page_results:
            document.status = DocumentStatus.RESCAN_NEEDED.value
            document.error_code = "PAGE_QUALITY_TOO_LOW"
            document.error_message = (
                "No page met the minimum quality threshold. Rescan at 300 DPI with even lighting."
            )
            document.processing_finished_at = datetime.now(UTC)
            session.commit()
            _bump_batch(session, document, failed=True)
            return {"document_id": document_id, "status": "rescan_needed", "records": 0}

        records = _persist_records(session, document, page_results, batch_context)

        document.status = DocumentStatus.PENDING_REVIEW.value
        document.current_stage = PipelineStage.REVIEW.value
        document.processing_finished_at = datetime.now(UTC)
        document.model_versions = {
            "vision": "vision-1.0.0",
            "extraction": "extraction-1.0.0",
        }
        session.commit()
        _bump_batch(session, document)

        elapsed = round(time.perf_counter() - started, 2)
        log.info(
            "document_processed",
            document_id=document_id,
            pages=len(pages),
            records=len(records),
            seconds=elapsed,
        )
        return {
            "document_id": document_id,
            "status": "processed",
            "pages": len(pages),
            "records": len(records),
            "seconds": elapsed,
        }

    except Exception as exc:
        session.rollback()
        log.exception("pipeline_failed", document_id=document_id)
        try:
            document = session.get(Document, uuid.UUID(document_id))
            if document:
                document.status = DocumentStatus.FAILED.value
                document.error_code = type(exc).__name__
                document.error_message = str(exc)[:2000]
                document.processing_finished_at = datetime.now(UTC)
                session.commit()
                _bump_batch(session, document, failed=True)
        except Exception:
            session.rollback()

        if self.request.retries < self.max_retries:
            raise self.retry(exc=exc, countdown=30 * (self.request.retries + 1)) from exc
        return {"document_id": document_id, "status": "failed", "error": str(exc)}

    finally:
        session.close()


def _batch_context(session: Session, document) -> dict:
    """Jurisdiction the operator selected on the batch — authoritative, and used
    both to pre-fill fields and to convert local area units correctly."""
    from bhumi.db.models.documents import Batch
    from bhumi.db.models.jurisdiction import (
        AreaUnitConversion,
        District,
        State,
        Tehsil,
        Village,
    )

    context: dict = {}
    batch = session.get(Batch, document.batch_id) if document.batch_id else None
    if batch is None:
        return context

    if batch.village_id:
        village = session.get(Village, batch.village_id)
        if village:
            context["village"] = village.name_en
            context["village_lgd_code"] = village.lgd_code
            context["pin_code"] = village.pin_code
    if batch.tehsil_id:
        tehsil = session.get(Tehsil, batch.tehsil_id)
        if tehsil:
            context["tehsil"] = tehsil.name_en
    if batch.district_id:
        district = session.get(District, batch.district_id)
        if district:
            context["district"] = district.name_en
    if batch.state_id:
        state = session.get(State, batch.state_id)
        if state:
            context["state"] = state.name_en
            context["expected_state_language"] = state.default_language

    if batch.record_year:
        context["record_year"] = batch.record_year

    overrides = {}
    rows = (
        session.execute(
            select(AreaUnitConversion).where(
                (AreaUnitConversion.state_id == batch.state_id)
                | (AreaUnitConversion.state_id.is_(None))
            )
        )
        .scalars()
        .all()
    )
    for row in rows:
        # A state-specific value overrides the national default.
        if row.unit.lower() not in overrides or row.state_id is not None:
            overrides[row.unit.lower()] = float(row.sq_metres)
    context["unit_overrides"] = overrides

    return context


def _persist_records(session: Session, document, page_results: list[dict], context: dict) -> list:
    """Write the extracted records, validate them, and route each one."""
    from bhumi.core.config import settings
    from bhumi.core.enums import QueueType, VerificationStatus
    from bhumi.db.models.records import CoOwner, LandRecord, RecordField
    from bhumi.db.models.review import ReviewQueueItem
    from bhumi.db.models.validation import ValidationResult

    created = []

    for result in page_results:
        normalized = result["normalized"]

        record = LandRecord(
            document_id=document.id,
            page_id=result["_page_id"],
            batch_id=document.batch_id,
            state_id=document.state_id,
            district_id=document.district_id,
            tehsil_id=document.tehsil_id,
            village_id=document.village_id,
            survey_number=normalized.get("survey_number"),
            khasra_number=normalized.get("khasra_number"),
            khata_number=normalized.get("khata_number"),
            plot_number=normalized.get("plot_number"),
            owner_name=normalized.get("owner_name"),
            owner_name_roman=normalized.get("owner_name_roman"),
            father_or_husband_name=normalized.get("father_or_husband_name"),
            owner_share=normalized.get("owner_share"),
            plot_area_original=normalized.get("plot_area"),
            area_unit_original=normalized.get("area_unit"),
            plot_area_sqm=normalized.get("plot_area_sqm"),
            land_classification=normalized.get("land_classification"),
            mutation_number=normalized.get("mutation_number"),
            registration_number=normalized.get("registration_number"),
            record_year=normalized.get("record_year"),
            document_type=result["document_type"],
            source_language=result.get("language"),
            confidence_overall=result["confidence_overall"],
            confidence_min_mandatory=result["confidence_min_mandatory"],
            extracted_at=datetime.now(UTC),
            model_version="vision-1.0.0+extraction-1.0.0",
        )
        session.add(record)
        session.flush()

        for field_data in result["fields"]:
            session.add(RecordField(record_id=record.id, **field_data))

        for owner in result["co_owners"]:
            session.add(
                CoOwner(
                    record_id=record.id,
                    name=owner["name"],
                    relation=owner.get("relation"),
                    share=owner.get("share"),
                    share_text=owner.get("share_text"),
                    confidence=owner.get("confidence", 0.0),
                    bbox=owner.get("bbox"),
                    sequence=owner.get("sequence", 0),
                )
            )

        # ── Validation ───────────────────────────────────────────────
        summary = _validate(session, record, result, context)
        record.validation_status = summary["status"]
        record.blocking_failures = summary["blocking"]

        # ── Routing ──────────────────────────────────────────────────
        confidence = record.confidence_overall
        if summary["blocking"] > 0:
            queue_type, priority = QueueType.EXCEPTION.value, 90
            status = VerificationStatus.PENDING_REVIEW.value
            reason = f"{summary['blocking']} blocking validation failure(s)."
        elif confidence >= settings.AUTO_APPROVE_THRESHOLD:
            queue_type, priority = QueueType.QA_SAMPLE.value, 10
            status = VerificationStatus.AUTO_APPROVED.value
            reason = "Auto-approved above the confidence threshold."
        elif confidence < settings.PRIORITY_REVIEW_THRESHOLD:
            queue_type, priority = QueueType.PRIORITY.value, 80
            status = VerificationStatus.PENDING_REVIEW.value
            reason = f"Overall confidence {confidence:.0%} is below the priority threshold."
        else:
            queue_type, priority = QueueType.STANDARD.value, 50
            status = VerificationStatus.PENDING_REVIEW.value
            reason = f"{len(result['low_confidence_fields'])} field(s) below the confidence bar."

        record.verification_status = status

        # Auto-approved records are sampled, not queued wholesale — a 5% QA
        # sample keeps the straight-through path honest without recreating the
        # manual bottleneck it exists to remove.
        import random

        needs_queue = status != VerificationStatus.AUTO_APPROVED.value or (
            random.random() < settings.QA_SAMPLE_RATE
        )
        if needs_queue:
            session.add(
                ReviewQueueItem(
                    record_id=record.id,
                    document_id=document.id,
                    batch_id=document.batch_id,
                    state_id=document.state_id,
                    district_id=document.district_id,
                    tehsil_id=document.tehsil_id,
                    village_id=document.village_id,
                    queue_type=queue_type,
                    priority=priority,
                    reason=reason,
                    low_confidence_fields=result["low_confidence_fields"],
                    confidence_overall=confidence,
                    sla_due_at=datetime.now(UTC) + timedelta(hours=48 if priority < 80 else 12),
                    requires_second_approval=(
                        float(record.plot_area_sqm or 0) > 40_000  # > 4 hectares
                    ),
                )
            )

        created.append(record)

    session.commit()
    return created


def _validate(session: Session, record, result: dict, context: dict) -> dict:
    """Run the rule engine and store the outcomes."""
    from bhumi.db.models.validation import ValidationResult
    from bhumi.modules.validation.engine import ValidationEngine
    from bhumi.modules.validation.router import load_rules_from_file
    from bhumi.db.models.validation import ValidationRule

    rules = []
    rows = (
        session.execute(select(ValidationRule).where(ValidationRule.is_enabled.is_(True)))
        .scalars()
        .all()
    )
    if rows:
        from bhumi.core.enums import Severity
        from bhumi.modules.validation.engine import Rule

        rules = [
            Rule(
                key=r.rule_key,
                name=r.name,
                category=r.category,
                severity=Severity(r.severity),
                expression=r.expression,
                requires=r.requires_fields or [],
                applies_to_document_types=r.applies_to_document_types or [],
                params=r.params or {},
                message_en=r.message_en or "",
                fix_hint=r.fix_hint or "",
                execution_order=r.execution_order,
            )
            for r in rows
        ]
    else:
        rules = load_rules_from_file()

    normalized = result["normalized"]
    shares = [o["share"] for o in result["co_owners"] if o.get("share")]

    evaluation_context = {
        **normalized,
        **context,
        "document_type": result["document_type"],
        "min_mandatory_confidence": result["confidence_min_mandatory"],
        "owner_name_confidence": next(
            (f["confidence"] for f in result["fields"] if f["field_name"] == "owner_name"),
            None,
        ),
        "page_quality_score": result.get("_page_quality"),
        "engine_agreement": result.get("_engine_agreement"),
        "co_owner_share_sum": round(sum(shares), 6) if shares else None,
        "has_parcel_link": False,
        "exact_duplicate_count": _count_duplicates(session, record),
        "content_duplicate_count": 0,
        "village_exists_in_master": bool(context.get("village_lgd_code")),
        "tehsil_in_district": bool(context.get("tehsil") and context.get("district")),
        "district_in_state": bool(context.get("district") and context.get("state")),
        "has_seal_or_signature": False,
        "damaged_area_pct": 0,
    }

    engine = ValidationEngine(rules)
    outcomes = engine.evaluate(evaluation_context)

    for outcome in outcomes:
        if outcome.status.value == "PASS":
            continue  # store only what needs attention
        session.add(
            ValidationResult(
                record_id=record.id,
                rule_key=outcome.rule_key,
                status=outcome.status.value,
                severity=outcome.severity.value,
                message=outcome.message,
                fix_hint=outcome.fix_hint,
                observed=outcome.observed,
                affected_fields=outcome.affected_fields,
            )
        )

    return ValidationEngine.summarize(outcomes)


def _count_duplicates(session: Session, record) -> int:
    from bhumi.core.enums import VerificationStatus
    from bhumi.db.models.records import LandRecord
    from sqlalchemy import func

    if not record.survey_number or not record.village_id:
        return 0
    return (
        session.execute(
            select(func.count())
            .select_from(LandRecord)
            .where(
                LandRecord.village_id == record.village_id,
                LandRecord.survey_number == record.survey_number,
                LandRecord.record_year == record.record_year,
                LandRecord.id != record.id,
                LandRecord.verification_status.in_(
                    [VerificationStatus.VERIFIED.value, VerificationStatus.AUTO_APPROVED.value]
                ),
            )
        ).scalar()
        or 0
    )


def _bump_batch(session: Session, document, failed: bool = False) -> None:
    from bhumi.db.models.documents import Batch

    if not document.batch_id:
        return
    batch = session.get(Batch, document.batch_id)
    if batch is None:
        return

    batch.processed_documents += 1
    if failed:
        batch.failed_documents += 1
    batch.total_pages += document.page_count or 0

    if batch.processed_documents >= batch.total_documents:
        batch.status = "COMPLETED"
        batch.completed_at = datetime.now(UTC)
    session.commit()


# ── Housekeeping ────────────────────────────────────────────────────
@shared_task(name="worker.tasks.pipeline.release_expired_locks")
def release_expired_locks() -> dict:
    """A verifier who closes their browser must not hold a record hostage."""
    from bhumi.core.enums import QueueStatus, VerificationStatus

    session = _session()
    try:
        released = session.execute(
            text(
                """
                UPDATE review_queue
                   SET locked_by = NULL, locked_until = NULL, status = :open
                 WHERE locked_until IS NOT NULL
                   AND locked_until < NOW()
                   AND status = :claimed
             RETURNING record_id
                """
            ),
            {"open": QueueStatus.OPEN.value, "claimed": QueueStatus.CLAIMED.value},
        ).fetchall()

        if released:
            session.execute(
                text(
                    """
                    UPDATE land_records
                       SET verification_status = :pending
                     WHERE id = ANY(:ids) AND verification_status = :in_review
                    """
                ),
                {
                    "pending": VerificationStatus.PENDING_REVIEW.value,
                    "in_review": VerificationStatus.IN_REVIEW.value,
                    "ids": [r[0] for r in released],
                },
            )
        session.commit()
        return {"released": len(released)}
    finally:
        session.close()


@shared_task(name="worker.tasks.pipeline.sweep_stuck_documents")
def sweep_stuck_documents(stale_minutes: int = 30) -> dict:
    """Re-enqueue anything that was queued but never picked up — an enqueue can
    fail while the upload itself succeeded, and the document must not be lost."""
    from bhumi.core.enums import DocumentStatus
    from bhumi.db.models.documents import Document

    session = _session()
    try:
        cutoff = datetime.now(UTC) - timedelta(minutes=stale_minutes)
        stuck = (
            session.execute(
                select(Document).where(
                    Document.status.in_(
                        [
                            DocumentStatus.QUEUED.value,
                            DocumentStatus.PREPROCESSING.value,
                            DocumentStatus.EXTRACTING.value,
                        ]
                    ),
                    Document.updated_at < cutoff,
                    Document.retry_count < 3,
                )
            )
            .scalars()
            .all()
        )

        for document in stuck:
            document.retry_count += 1
            document.status = DocumentStatus.QUEUED.value
            process_document.apply_async(args=[str(document.id)], queue="pipeline")

        session.commit()
        if stuck:
            log.info("stuck_documents_requeued", count=len(stuck))
        return {"requeued": len(stuck)}
    finally:
        session.close()
