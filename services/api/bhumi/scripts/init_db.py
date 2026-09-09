"""Create the schema and load the shipped validation rules.

Idempotent — safe to run on every container start. Alembic is configured for
production migrations; this keeps the demo bring-up to a single command.
"""

from __future__ import annotations

import asyncio

import structlog
from sqlalchemy import select, text

from bhumi.db.base import Base
from bhumi.db.models import ValidationRule  # noqa: F401 — registers all models
from bhumi.db.session import SessionLocal, engine

log = structlog.get_logger()

EXTENSIONS = [
    "postgis",
    "pg_trgm",
    "unaccent",
    "fuzzystrmatch",
    "btree_gin",
    "pgcrypto",
]


async def create_schema() -> None:
    # Extensions must be created outside a transaction block (autocommit)
    async with engine.connect() as conn:
        await conn.execution_options(isolation_level="AUTOCOMMIT")
        for extension in EXTENSIONS:
            try:
                await conn.execute(text(f'CREATE EXTENSION IF NOT EXISTS "{extension}"'))
                log.info("extension_ok", extension=extension)
            except Exception as exc:
                log.warning("extension_skipped", extension=extension, error=str(exc))

    # Create tables in a separate connection/transaction
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    log.info("schema_ready", tables=len(Base.metadata.tables))


async def load_rules() -> None:
    """Seed the rule library from rules.yaml on first run."""
    from bhumi.modules.validation.router import load_rules_from_file

    async with SessionLocal() as session:
        existing = {
            key
            for (key,) in (await session.execute(select(ValidationRule.rule_key))).all()
        }
        added = 0
        for rule in load_rules_from_file():
            if rule.key in existing:
                continue
            session.add(
                ValidationRule(
                    rule_key=rule.key,
                    name=rule.name,
                    category=rule.category,
                    severity=rule.severity.value,
                    description_en=rule.description_en,
                    expression=rule.expression,
                    params=rule.params,
                    requires_fields=rule.requires,
                    applies_to_document_types=rule.applies_to_document_types,
                    applies_to_states=rule.applies_to_states,
                    message_en=rule.message_en,
                    message_hi=rule.message_hi,
                    fix_hint=rule.fix_hint,
                    is_enabled=rule.enabled,
                    execution_order=rule.execution_order,
                )
            )
            added += 1
        await session.commit()
        log.info("validation_rules_loaded", added=added, already_present=len(existing))


async def main() -> None:
    await create_schema()
    await load_rules()
    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
