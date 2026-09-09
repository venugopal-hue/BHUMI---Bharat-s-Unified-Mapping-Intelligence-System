"""Hash-chained audit trail.

    payload_hash = sha256(canonical_json(payload))
    chain_hash   = sha256(prev_chain_hash || payload_hash || timestamp)

Any edit or deletion anywhere in the history breaks the chain, and
``verify_chain`` reports exactly where. This is the trust story: we do not ask
anyone to believe the records were never altered, we let them check.
"""

from __future__ import annotations

import hashlib
import json
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from bhumi.db.models.governance import AuditLog

GENESIS_HASH = "0" * 64


def _canonical(payload: Any) -> str:
    return json.dumps(payload, sort_keys=True, separators=(",", ":"), default=str)


def hash_payload(payload: Any) -> str:
    return hashlib.sha256(_canonical(payload).encode("utf-8")).hexdigest()


def compute_chain_hash(prev_hash: str, payload_hash: str, timestamp: str) -> str:
    return hashlib.sha256(f"{prev_hash}{payload_hash}{timestamp}".encode()).hexdigest()


async def _latest_chain_hash(session: AsyncSession) -> str:
    row = await session.execute(select(AuditLog.chain_hash).order_by(desc(AuditLog.id)).limit(1))
    return row.scalar_one_or_none() or GENESIS_HASH


async def record_audit(
    session: AsyncSession,
    *,
    entity_type: str,
    action: str,
    entity_id: str | None = None,
    payload: dict[str, Any] | None = None,
    actor_id: str | None = None,
    actor_username: str | None = None,
    actor_roles: list[str] | None = None,
    actor_ip: str | None = None,
    request_id: str | None = None,
) -> AuditLog:
    """Append one entry. Call inside the same transaction as the change itself."""
    payload = payload or {}
    ts = datetime.now(UTC).isoformat()
    prev = await _latest_chain_hash(session)
    p_hash = hash_payload(payload)

    entry = AuditLog(
        actor_id=actor_id,
        actor_username=actor_username,
        actor_roles=actor_roles or [],
        actor_ip=actor_ip,
        entity_type=entity_type,
        entity_id=str(entity_id) if entity_id else None,
        action=action,
        payload=payload,
        payload_hash=p_hash,
        prev_hash=prev,
        chain_hash=compute_chain_hash(prev, p_hash, ts),
        request_id=request_id,
    )
    session.add(entry)
    await session.flush()
    return entry


async def verify_chain(
    session: AsyncSession, *, start_id: int = 0, limit: int = 100_000
) -> dict[str, Any]:
    """Walk the chain and report the first break, if any."""
    result = await session.execute(
        select(AuditLog).where(AuditLog.id > start_id).order_by(AuditLog.id).limit(limit)
    )
    entries = result.scalars().all()

    if not entries:
        return {"intact": True, "checked": 0, "message": "No audit entries in range."}

    expected_prev = entries[0].prev_hash or GENESIS_HASH
    for entry in entries:
        if (entry.prev_hash or GENESIS_HASH) != expected_prev:
            return {
                "intact": False,
                "checked": entries.index(entry) + 1,
                "broken_at_id": entry.id,
                "reason": "prev_hash does not match the preceding entry's chain_hash",
                "expected": expected_prev,
                "found": entry.prev_hash,
            }
        if hash_payload(entry.payload or {}) != entry.payload_hash:
            return {
                "intact": False,
                "checked": entries.index(entry) + 1,
                "broken_at_id": entry.id,
                "reason": "payload has been modified since it was recorded",
            }
        expected_prev = entry.chain_hash

    return {
        "intact": True,
        "checked": len(entries),
        "first_id": entries[0].id,
        "last_id": entries[-1].id,
        "head_hash": entries[-1].chain_hash,
        "message": f"Chain verified across {len(entries)} entries. No tampering detected.",
    }
