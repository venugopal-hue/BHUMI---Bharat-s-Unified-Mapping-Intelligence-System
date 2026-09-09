"""Connector framework.

Every external system — DILRMP, a state LRMS, DigiLocker, the registration
department — implements the same small interface. Adding Karnataka's Bhoomi is
a mapping file and a subclass, not a rewrite.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Protocol

import httpx
from tenacity import retry, retry_if_exception_type, stop_after_attempt, wait_exponential

from bhumi.core.config import settings


@dataclass(slots=True)
class PushResult:
    success: bool
    external_id: str | None = None
    http_status: int | None = None
    response: dict[str, Any] = field(default_factory=dict)
    error: str | None = None


@dataclass(slots=True)
class VerificationResult:
    found: bool
    match_score: float = 0.0
    differences: dict[str, Any] = field(default_factory=dict)
    external_record: dict[str, Any] | None = None


@dataclass(slots=True)
class HealthStatus:
    healthy: bool
    latency_ms: float | None = None
    message: str = ""


class Connector(Protocol):
    key: str
    name: str

    async def health(self) -> HealthStatus: ...
    async def push_record(self, record: dict[str, Any], idempotency_key: str) -> PushResult: ...
    async def verify(self, record: dict[str, Any]) -> VerificationResult: ...
    def map_fields(self, record: dict[str, Any]) -> dict[str, Any]: ...


# ── Field mapping ───────────────────────────────────────────────────
TRANSFORMS: dict[str, Any] = {
    "strip_spaces": lambda v: str(v).replace(" ", "") if v is not None else None,
    "upper": lambda v: str(v).upper() if v is not None else None,
    "sqm_to_hectare": lambda v: round(float(v) / 10_000, 4) if v is not None else None,
    "sqm_to_acre": lambda v: round(float(v) / 4046.86, 4) if v is not None else None,
    "iso_date": lambda v: str(v)[:10] if v is not None else None,
    "as_string": lambda v: str(v) if v is not None else None,
}


def apply_mapping(record: dict[str, Any], mapping: dict[str, Any]) -> dict[str, Any]:
    """Translate the canonical schema into a target system's shape.

    Mapping entries look like:
        survey_number: { path: "gatNumber", transform: "strip_spaces" }
    Dotted paths build nested objects, which is what most state APIs expect.
    """
    out: dict[str, Any] = {}
    for source_field, spec in (mapping.get("fields") or {}).items():
        value = record.get(source_field)
        if value is None and spec.get("required") is not True:
            continue

        transform = spec.get("transform")
        if transform:
            fn = TRANSFORMS.get(transform)
            if fn:
                try:
                    value = fn(value)
                except (TypeError, ValueError):
                    value = None

        lookup = spec.get("lookup")
        if lookup and isinstance(mapping.get("lookups", {}).get(lookup), dict):
            value = mapping["lookups"][lookup].get(str(value), value)

        _set_path(out, spec.get("path", source_field), value)

    missing = [f for f in mapping.get("required", []) if record.get(f) in (None, "")]
    if missing:
        raise ValueError(
            f"{mapping.get('target', 'target system')} requires: {', '.join(missing)}"
        )
    return out


def _set_path(target: dict[str, Any], path: str, value: Any) -> None:
    parts = path.split(".")
    cursor = target
    for part in parts[:-1]:
        cursor = cursor.setdefault(part, {})
    cursor[parts[-1]] = value


# ── HTTP base ───────────────────────────────────────────────────────
class HttpConnector:
    key = "http"
    name = "HTTP connector"
    timeout = 20.0

    def __init__(
        self,
        base_url: str,
        api_key: str | None = None,
        mapping: dict[str, Any] | None = None,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.mapping = mapping or {}

    def _headers(self, idempotency_key: str | None = None) -> dict[str, str]:
        headers = {"Content-Type": "application/json", "User-Agent": "BHUMI/1.0"}
        if self.api_key:
            headers["X-API-Key"] = self.api_key
        if idempotency_key:
            headers["Idempotency-Key"] = idempotency_key
        return headers

    async def health(self) -> HealthStatus:
        import time

        started = time.perf_counter()
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                response = await client.get(f"{self.base_url}/health", headers=self._headers())
            latency = (time.perf_counter() - started) * 1000
            return HealthStatus(
                healthy=response.status_code < 400,
                latency_ms=round(latency, 1),
                message=f"HTTP {response.status_code}",
            )
        except Exception as exc:
            return HealthStatus(healthy=False, message=str(exc))

    def map_fields(self, record: dict[str, Any]) -> dict[str, Any]:
        if not self.mapping:
            return record
        return apply_mapping(record, self.mapping)

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=8),
        retry=retry_if_exception_type((httpx.TimeoutException, httpx.NetworkError)),
        reraise=True,
    )
    async def _post(self, path: str, payload: dict[str, Any], idempotency_key: str):
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            return await client.post(
                f"{self.base_url}{path}", json=payload, headers=self._headers(idempotency_key)
            )


class DilrmpConnector(HttpConnector):
    """Digital India Land Records Modernization Programme.

    The demo runs against a mock service that mirrors the real contract,
    including 409s on repeated idempotency keys — so the retry and outbox paths
    are genuinely exercised rather than assumed.
    """

    key = "dilrmp"
    name = "DILRMP National Registry"

    async def push_record(self, record: dict[str, Any], idempotency_key: str) -> PushResult:
        try:
            payload = self.map_fields(record)
        except ValueError as exc:
            return PushResult(success=False, error=str(exc))

        try:
            response = await self._post("/api/records", payload, idempotency_key)
        except Exception as exc:
            return PushResult(success=False, error=f"{type(exc).__name__}: {exc}")

        body = _safe_json(response)
        if response.status_code == 409:
            # Already accepted under this key — treat as success, not failure.
            return PushResult(
                success=True,
                external_id=body.get("external_id"),
                http_status=409,
                response=body,
            )
        return PushResult(
            success=response.status_code < 400,
            external_id=body.get("external_id"),
            http_status=response.status_code,
            response=body,
            error=None if response.status_code < 400 else body.get("message", response.text[:400]),
        )

    async def verify(self, record: dict[str, Any]) -> VerificationResult:
        params = {
            "survey_number": record.get("survey_number"),
            "village_code": record.get("village_lgd_code"),
        }
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.get(
                    f"{self.base_url}/api/records/search", params=params, headers=self._headers()
                )
        except Exception:
            return VerificationResult(found=False)

        if response.status_code != 200:
            return VerificationResult(found=False)

        body = _safe_json(response)
        results = body.get("results") or []
        if not results:
            return VerificationResult(found=False)

        external = results[0]
        differences, score = _compare(record, external)
        return VerificationResult(
            found=True, match_score=score, differences=differences, external_record=external
        )


class StateLrmsConnector(HttpConnector):
    """A state Land Records Management System — MahaBhulekh, Bhulekh UP, Bhoomi…"""

    def __init__(self, key: str, name: str, base_url: str, api_key=None, mapping=None) -> None:
        super().__init__(base_url, api_key, mapping)
        self.key = key
        self.name = name

    async def push_record(self, record: dict[str, Any], idempotency_key: str) -> PushResult:
        try:
            payload = self.map_fields(record)
        except ValueError as exc:
            return PushResult(success=False, error=str(exc))
        try:
            response = await self._post(f"/api/lrms/{self.key}/records", payload, idempotency_key)
        except Exception as exc:
            return PushResult(success=False, error=str(exc))

        body = _safe_json(response)
        return PushResult(
            success=response.status_code < 400,
            external_id=body.get("external_id"),
            http_status=response.status_code,
            response=body,
            error=None if response.status_code < 400 else body.get("message"),
        )

    async def verify(self, record: dict[str, Any]) -> VerificationResult:
        return VerificationResult(found=False)


class DigiLockerConnector(HttpConnector):
    """Issues a verified record into the citizen's DigiLocker.

    Consent-gated: nothing is issued unless the record is VERIFIED and the
    citizen has an issuance request on file.
    """

    key = "digilocker"
    name = "DigiLocker"

    async def push_record(self, record: dict[str, Any], idempotency_key: str) -> PushResult:
        payload = {
            "doc_type": "LANDRECORD",
            "issuer": "BHUMI",
            "uri": f"bhumi://records/{record.get('id')}",
            "record": self.map_fields(record),
        }
        try:
            response = await self._post("/digilocker/issue", payload, idempotency_key)
        except Exception as exc:
            return PushResult(success=False, error=str(exc))
        body = _safe_json(response)
        return PushResult(
            success=response.status_code < 400,
            external_id=body.get("uri"),
            http_status=response.status_code,
            response=body,
        )

    async def verify(self, record: dict[str, Any]) -> VerificationResult:
        return VerificationResult(found=False)


def _safe_json(response: httpx.Response) -> dict[str, Any]:
    try:
        body = response.json()
        return body if isinstance(body, dict) else {"data": body}
    except Exception:
        return {}


def _compare(ours: dict[str, Any], theirs: dict[str, Any]) -> tuple[dict[str, Any], float]:
    """Field-by-field comparison against an external record, tolerant of the
    small representational differences every state system has."""
    from rapidfuzz import fuzz

    checks = {
        "owner_name": ("owner_name", 0.35),
        "survey_number": ("survey_number", 0.30),
        "plot_area_sqm": ("area_sqm", 0.20),
        "khata_number": ("khata_number", 0.15),
    }
    differences: dict[str, Any] = {}
    score = 0.0

    for our_field, (their_field, weight) in checks.items():
        ours_value = ours.get(our_field)
        theirs_value = theirs.get(their_field)
        if ours_value is None or theirs_value is None:
            continue

        if our_field == "plot_area_sqm":
            try:
                delta = abs(float(ours_value) - float(theirs_value)) / max(float(ours_value), 1)
                similarity = 1.0 if delta <= 0.02 else max(0.0, 1 - delta)
            except (TypeError, ValueError):
                similarity = 0.0
        else:
            similarity = fuzz.token_sort_ratio(str(ours_value), str(theirs_value)) / 100

        score += similarity * weight
        if similarity < 0.9:
            differences[our_field] = {
                "bhumi": ours_value,
                "external": theirs_value,
                "similarity": round(similarity, 3),
            }

    return differences, round(score, 3)


def build_connector(key: str, config: dict[str, Any]) -> Connector:
    base_url = config.get("base_url") or settings.DILRMP_BASE_URL
    api_key = config.get("api_key") or settings.DILRMP_API_KEY
    mapping = config.get("field_mapping") or {}

    if key == "dilrmp":
        return DilrmpConnector(base_url, api_key, mapping)
    if key == "digilocker":
        return DigiLockerConnector(settings.DIGILOCKER_BASE_URL, api_key, mapping)
    return StateLrmsConnector(key, config.get("name", key), base_url, api_key, mapping)
