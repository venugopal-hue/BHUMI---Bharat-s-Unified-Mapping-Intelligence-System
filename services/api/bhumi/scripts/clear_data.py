"""Wipe all seeded / demo data — keeps schema intact, removes all rows."""

from __future__ import annotations

import asyncio

import structlog
from sqlalchemy import text

from bhumi.db.session import SessionLocal, engine

log = structlog.get_logger()

TABLES_IN_ORDER = [
    # Governance / notifications first (FK to users)
    "notifications",
    "audit_log",
    # Documents pipeline
    "validation_results",
    "extraction_fields",
    "page_records",
    "document_pages",
    "land_records",
    "co_owners",
    "review_tasks",
    "document_batches",
    "documents",
    # Mapping / GIS
    "parcel_geometries",
    # Integrations
    "integration_sync_log",
    "integrations",
    # Learning
    "model_versions",
    # Auth / identity (last — FK targets)
    "refresh_tokens",
    "user_jurisdictions",
    "user_roles",
    "users",
    "roles",
    # Jurisdiction reference data
    "jurisdictions",
    # Validation rules
    "validation_rules",
]


async def clear() -> None:
    async with SessionLocal() as session:
        for table in TABLES_IN_ORDER:
            try:
                await session.execute(text(f'TRUNCATE TABLE "{table}" RESTART IDENTITY CASCADE'))
                log.info("cleared", table=table)
            except Exception as exc:
                log.warning("skip", table=table, reason=str(exc))
        await session.commit()
    log.info("done — all data wiped, schema intact")
    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(clear())
