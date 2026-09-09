from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class RuleIn(BaseModel):
    rule_key: str = Field(..., max_length=64)
    name: str = Field(..., max_length=200)
    category: str = "general"
    severity: str = Field("ERROR", pattern="^(BLOCKING|ERROR|WARNING|REVIEW|INFO)$")
    description_en: str | None = None
    description_hi: str | None = None
    expression: str
    params: dict[str, Any] = {}
    requires_fields: list[str] = []
    applies_to_document_types: list[str] = []
    applies_to_states: list[str] = []
    message_en: str | None = None
    message_hi: str | None = None
    fix_hint: str | None = None
    is_enabled: bool = True
    execution_order: int = 100


class RuleOut(BaseModel):
    id: str
    rule_key: str
    name: str
    category: str
    severity: str
    description_en: str | None = None
    expression: str
    params: dict[str, Any] = {}
    requires_fields: list[str] = []
    applies_to_document_types: list[str] = []
    message_en: str | None = None
    message_hi: str | None = None
    fix_hint: str | None = None
    is_enabled: bool = True
    execution_order: int = 100
    version: int = 1
    source: str = "database"
    created_at: datetime | None = None

    @classmethod
    def from_model(cls, r: Any) -> "RuleOut":
        return cls(
            id=str(r.id),
            rule_key=r.rule_key,
            name=r.name,
            category=r.category,
            severity=r.severity,
            description_en=r.description_en,
            expression=r.expression,
            params=r.params or {},
            requires_fields=r.requires_fields or [],
            applies_to_document_types=r.applies_to_document_types or [],
            message_en=r.message_en,
            message_hi=r.message_hi,
            fix_hint=r.fix_hint,
            is_enabled=r.is_enabled,
            execution_order=r.execution_order,
            version=r.version,
            created_at=r.created_at,
        )


class RuleTestRequest(BaseModel):
    expression: str
    severity: str = "ERROR"
    requires_fields: list[str] = []
    params: dict[str, Any] = {}
    message_en: str | None = None
    context: dict[str, Any] | None = None
    record_id: uuid.UUID | None = None


class DuplicateResolveRequest(BaseModel):
    resolution: str = Field(..., pattern="^(MERGED|KEPT_BOTH|REJECTED)$")
    keep_record_id: uuid.UUID | None = None
    note: str | None = Field(None, max_length=1000)
