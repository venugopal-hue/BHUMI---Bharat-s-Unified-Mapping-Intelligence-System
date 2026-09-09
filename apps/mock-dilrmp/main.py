"""Mock government integration target.

Stands in for DILRMP, state LRMS systems and DigiLocker during development and
the demo. It behaves like a real government API — idempotency keys, 409s on
replay, occasional latency and transient 503s — so BHUMI's retry, outbox and
circuit-breaker paths are genuinely exercised rather than assumed.
"""

from __future__ import annotations

import asyncio
import random
import uuid
from datetime import UTC, datetime
from typing import Any

from fastapi import FastAPI, Header, HTTPException, Query, Request
from pydantic import BaseModel

app = FastAPI(
    title="Mock DILRMP / LRMS",
    description=(
        "A stand-in for national and state land-record systems. Not a real "
        "government service — used to exercise BHUMI's integration layer."
    ),
    version="1.0.0",
    docs_url="/docs",
)

# In-memory stores; a restart is a clean slate, which is what a demo wants.
RECORDS: dict[str, dict[str, Any]] = {}
IDEMPOTENCY: dict[str, str] = {}
DIGILOCKER: dict[str, dict[str, Any]] = {}
CALL_LOG: list[dict[str, Any]] = []

FAILURE_RATE = 0.0   # raise to rehearse the retry path
LATENCY_RANGE = (0.05, 0.25)


class RecordIn(BaseModel):
    model_config = {"extra": "allow"}


async def _simulate_network() -> None:
    await asyncio.sleep(random.uniform(*LATENCY_RANGE))
    if FAILURE_RATE and random.random() < FAILURE_RATE:
        raise HTTPException(status_code=503, detail="Upstream registry temporarily unavailable.")


@app.middleware("http")
async def log_calls(request: Request, call_next):
    response = await call_next(request)
    if request.url.path.startswith("/api") or request.url.path.startswith("/digilocker"):
        CALL_LOG.append(
            {
                "at": datetime.now(UTC).isoformat(),
                "method": request.method,
                "path": request.url.path,
                "status": response.status_code,
            }
        )
        del CALL_LOG[:-500]
    return response


@app.get("/health", tags=["Ops"])
async def health():
    return {
        "status": "ok",
        "service": "mock-dilrmp",
        "records_held": len(RECORDS),
        "note": "Mock service for development and demonstration only.",
    }


# ── DILRMP ──────────────────────────────────────────────────────────
@app.post("/api/records", status_code=201, tags=["DILRMP"])
async def create_record(
    payload: RecordIn,
    idempotency_key: str | None = Header(None, alias="Idempotency-Key"),
    x_api_key: str | None = Header(None, alias="X-API-Key"),
):
    """Accepts a verified record. Replaying the same Idempotency-Key returns 409
    with the original identifier — the same contract real registries use."""
    await _simulate_network()

    if not x_api_key:
        raise HTTPException(status_code=401, detail="X-API-Key header is required.")

    if idempotency_key and idempotency_key in IDEMPOTENCY:
        existing_id = IDEMPOTENCY[idempotency_key]
        raise HTTPException(
            status_code=409,
            detail={
                "message": "This record was already accepted under the same idempotency key.",
                "external_id": existing_id,
                "duplicate": True,
            },
        )

    body = payload.model_dump()
    survey = body.get("surveyNumber") or body.get("khasra") or body.get("gatNumber")
    if not survey:
        raise HTTPException(status_code=422, detail="A parcel identifier is required.")

    external_id = f"DILRMP-{datetime.now(UTC):%Y}-{uuid.uuid4().hex[:10].upper()}"
    RECORDS[external_id] = {
        "external_id": external_id,
        "received_at": datetime.now(UTC).isoformat(),
        "status": "ACCEPTED",
        **body,
    }
    if idempotency_key:
        IDEMPOTENCY[idempotency_key] = external_id

    return {
        "external_id": external_id,
        "status": "ACCEPTED",
        "message": "Record accepted into the national registry.",
        "received_at": RECORDS[external_id]["received_at"],
    }


@app.get("/api/records/search", tags=["DILRMP"])
async def search_records(
    survey_number: str | None = Query(None),
    village_code: str | None = Query(None),
    owner_name: str | None = Query(None),
):
    await _simulate_network()

    def matches(record: dict[str, Any]) -> bool:
        if survey_number:
            candidates = {
                str(record.get(k, "")).strip()
                for k in ("surveyNumber", "khasra", "gatNumber", "survey_number")
            }
            if survey_number.strip() not in candidates:
                return False
        if village_code:
            codes = {
                str(record.get(k, ""))
                for k in ("villageCode", "villageLGDCode", "gaonCode")
            }
            if str(village_code) not in codes:
                return False
        if owner_name:
            owner = record.get("owner") or {}
            blob = " ".join(
                str(v) for v in [*owner.values(), record.get("khatedar", "")] if v
            ).lower()
            if owner_name.lower() not in blob:
                return False
        return True

    results = [r for r in RECORDS.values() if matches(r)]
    return {"count": len(results), "results": results[:25]}


@app.get("/api/records/{external_id}", tags=["DILRMP"])
async def get_record(external_id: str):
    await _simulate_network()
    record = RECORDS.get(external_id)
    if record is None:
        raise HTTPException(status_code=404, detail="No record with that identifier.")
    return record


# ── State LRMS ──────────────────────────────────────────────────────
@app.post("/api/lrms/{state_key}/records", status_code=201, tags=["State LRMS"])
async def push_to_lrms(
    state_key: str,
    payload: RecordIn,
    idempotency_key: str | None = Header(None, alias="Idempotency-Key"),
):
    """Each state's LRMS has its own field names — the point of BHUMI's mapping
    files is that this endpoint receives whatever shape the state expects."""
    await _simulate_network()

    if idempotency_key and idempotency_key in IDEMPOTENCY:
        return {
            "external_id": IDEMPOTENCY[idempotency_key],
            "status": "ALREADY_ACCEPTED",
            "state": state_key,
        }

    external_id = f"{state_key.upper()}-{uuid.uuid4().hex[:8].upper()}"
    RECORDS[external_id] = {
        "external_id": external_id,
        "state": state_key,
        "received_at": datetime.now(UTC).isoformat(),
        **payload.model_dump(),
    }
    if idempotency_key:
        IDEMPOTENCY[idempotency_key] = external_id

    return {"external_id": external_id, "status": "ACCEPTED", "state": state_key}


# ── DigiLocker ──────────────────────────────────────────────────────
@app.post("/digilocker/issue", status_code=201, tags=["DigiLocker"])
async def issue_document(payload: RecordIn):
    await _simulate_network()
    body = payload.model_dump()
    doc_uri = f"in.gov.bhumi-LANDRECORD-{uuid.uuid4().hex[:12].upper()}"
    DIGILOCKER[doc_uri] = {
        "uri": doc_uri,
        "doc_type": body.get("doc_type", "LANDRECORD"),
        "issuer": body.get("issuer", "BHUMI"),
        "issued_at": datetime.now(UTC).isoformat(),
        "record": body.get("record", {}),
    }
    return {
        "uri": doc_uri,
        "status": "ISSUED",
        "message": "Document issued to the citizen's locker.",
    }


@app.get("/digilocker/documents/{uri}", tags=["DigiLocker"])
async def get_issued(uri: str):
    document = DIGILOCKER.get(uri)
    if document is None:
        raise HTTPException(status_code=404, detail="No document with that URI.")
    return document


# ── Registration department (cross-check) ───────────────────────────
@app.get("/api/registry/verify", tags=["Registration"])
async def verify_registration(registration_number: str = Query(...)):
    """Deterministic pseudo-lookup so the demo behaves the same on every run:
    roughly four in five registration numbers verify."""
    await _simulate_network()
    found = (sum(ord(c) for c in registration_number) % 5) != 0
    return {
        "registration_number": registration_number,
        "found": found,
        "status": "REGISTERED" if found else "NOT_FOUND",
        "checked_at": datetime.now(UTC).isoformat(),
    }


# ── Introspection (for the demo) ────────────────────────────────────
@app.get("/api/_debug/calls", tags=["Ops"])
async def recent_calls(limit: int = 50):
    return {"count": len(CALL_LOG), "calls": CALL_LOG[-limit:]}


@app.post("/api/_debug/reset", tags=["Ops"])
async def reset():
    RECORDS.clear()
    IDEMPOTENCY.clear()
    DIGILOCKER.clear()
    CALL_LOG.clear()
    return {"status": "reset"}


@app.post("/api/_debug/failure-rate", tags=["Ops"])
async def set_failure_rate(rate: float = Query(0.0, ge=0, le=1)):
    """Turn up to rehearse the retry and dead-letter paths on stage."""
    global FAILURE_RATE
    FAILURE_RATE = rate
    return {"failure_rate": FAILURE_RATE}
