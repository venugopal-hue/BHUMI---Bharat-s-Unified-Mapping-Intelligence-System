"""Role-based + attribute-based access control.

Two layers:
  RBAC  — what a role may *do*   (permissions)
  ABAC  — what data it may do it *to* (jurisdiction scoping)

Every list query passes through ``jurisdiction_filter`` so a Tehsildar in
Rahata cannot construct a request that returns Nashik data — the filter is
applied in the service layer, not in the UI.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Iterable

from bhumi.core.enums import JurisdictionLevel, RoleKey


# ── Permission catalogue ────────────────────────────────────────────
class Perm:
    DOCUMENT_UPLOAD = "document:upload"
    DOCUMENT_READ = "document:read"
    DOCUMENT_DELETE = "document:delete"
    DOCUMENT_REPROCESS = "document:reprocess"

    RECORD_READ = "record:read"
    RECORD_EDIT = "record:edit"
    RECORD_EXPORT = "record:export"

    REVIEW_CLAIM = "review:claim"
    REVIEW_APPROVE = "review:approve"
    REVIEW_BULK_APPROVE = "review:bulk_approve"
    REVIEW_ESCALATE = "review:escalate"

    GIS_READ = "gis:read"
    GIS_EDIT = "gis:edit"
    GIS_GEOREFERENCE = "gis:georeference"

    INSIGHTS_READ = "insights:read"
    INSIGHTS_OPERATIONS = "insights:operations"

    RULES_READ = "rules:read"
    RULES_EDIT = "rules:edit"

    INTEGRATION_READ = "integration:read"
    INTEGRATION_MANAGE = "integration:manage"

    USER_READ = "user:read"
    USER_MANAGE = "user:manage"

    AUDIT_READ = "audit:read"
    AUDIT_VERIFY = "audit:verify"

    MODEL_READ = "model:read"
    MODEL_PROMOTE = "model:promote"

    PUBLIC_SEARCH = "public:search"


ROLE_PERMISSIONS: dict[RoleKey, set[str]] = {
    RoleKey.PUBLIC: {
        Perm.PUBLIC_SEARCH,
    },
    RoleKey.OPERATOR: {
        Perm.DOCUMENT_UPLOAD,
        Perm.DOCUMENT_READ,
        Perm.RECORD_READ,
        Perm.INSIGHTS_READ,
    },
    RoleKey.VERIFIER: {
        Perm.DOCUMENT_UPLOAD,
        Perm.DOCUMENT_READ,
        Perm.RECORD_READ,
        Perm.RECORD_EDIT,
        Perm.REVIEW_CLAIM,
        Perm.REVIEW_APPROVE,
        Perm.GIS_READ,
        Perm.INSIGHTS_READ,
    },
    RoleKey.GIS_OFFICER: {
        Perm.DOCUMENT_READ,
        Perm.RECORD_READ,
        Perm.GIS_READ,
        Perm.GIS_EDIT,
        Perm.GIS_GEOREFERENCE,
        Perm.INSIGHTS_READ,
    },
    RoleKey.SUPERVISOR: {
        Perm.DOCUMENT_UPLOAD,
        Perm.DOCUMENT_READ,
        Perm.DOCUMENT_REPROCESS,
        Perm.RECORD_READ,
        Perm.RECORD_EDIT,
        Perm.RECORD_EXPORT,
        Perm.REVIEW_CLAIM,
        Perm.REVIEW_APPROVE,
        Perm.REVIEW_BULK_APPROVE,
        Perm.REVIEW_ESCALATE,
        Perm.GIS_READ,
        Perm.INSIGHTS_READ,
        Perm.INSIGHTS_OPERATIONS,
        Perm.RULES_READ,
        Perm.AUDIT_READ,
    },
    RoleKey.DISTRICT_OFFICER: {
        Perm.DOCUMENT_UPLOAD,
        Perm.DOCUMENT_READ,
        Perm.DOCUMENT_REPROCESS,
        Perm.RECORD_READ,
        Perm.RECORD_EDIT,
        Perm.RECORD_EXPORT,
        Perm.REVIEW_CLAIM,
        Perm.REVIEW_APPROVE,
        Perm.REVIEW_BULK_APPROVE,
        Perm.REVIEW_ESCALATE,
        Perm.GIS_READ,
        Perm.GIS_EDIT,
        Perm.INSIGHTS_READ,
        Perm.INSIGHTS_OPERATIONS,
        Perm.RULES_READ,
        Perm.INTEGRATION_READ,
        Perm.USER_READ,
        Perm.AUDIT_READ,
        Perm.AUDIT_VERIFY,
        Perm.MODEL_READ,
    },
    RoleKey.AUDITOR: {
        Perm.DOCUMENT_READ,
        Perm.RECORD_READ,
        Perm.INSIGHTS_READ,
        Perm.AUDIT_READ,
        Perm.AUDIT_VERIFY,
        Perm.RULES_READ,
    },
    RoleKey.API_CLIENT: {
        Perm.RECORD_READ,
        Perm.GIS_READ,
        Perm.PUBLIC_SEARCH,
    },
}

# State admin gets everything a district officer has, plus governance.
ROLE_PERMISSIONS[RoleKey.STATE_ADMIN] = ROLE_PERMISSIONS[RoleKey.DISTRICT_OFFICER] | {
    Perm.RULES_EDIT,
    Perm.INTEGRATION_MANAGE,
    Perm.USER_MANAGE,
    Perm.MODEL_PROMOTE,
    Perm.GIS_GEOREFERENCE,
}

# System admin: every permission defined above.
ROLE_PERMISSIONS[RoleKey.SYSTEM_ADMIN] = {
    v for k, v in vars(Perm).items() if not k.startswith("_") and isinstance(v, str)
} | {Perm.DOCUMENT_DELETE}


LEVEL_RANK: dict[JurisdictionLevel, int] = {
    JurisdictionLevel.NATIONAL: 0,
    JurisdictionLevel.STATE: 1,
    JurisdictionLevel.DISTRICT: 2,
    JurisdictionLevel.TEHSIL: 3,
    JurisdictionLevel.VILLAGE: 4,
}


@dataclass(slots=True)
class Jurisdiction:
    level: JurisdictionLevel
    ref_id: str | None = None   # null at NATIONAL level

    @classmethod
    def from_claim(cls, raw: dict[str, Any]) -> "Jurisdiction":
        return cls(level=JurisdictionLevel(raw["level"]), ref_id=raw.get("ref_id"))

    def to_claim(self) -> dict[str, Any]:
        return {"level": self.level.value, "ref_id": self.ref_id}


@dataclass(slots=True)
class Principal:
    """The authenticated caller — carried on every request."""

    user_id: str
    username: str
    roles: list[RoleKey] = field(default_factory=list)
    jurisdictions: list[Jurisdiction] = field(default_factory=list)

    # ── RBAC ────────────────────────────────────────────────────────
    @property
    def permissions(self) -> set[str]:
        perms: set[str] = set()
        for role in self.roles:
            perms |= ROLE_PERMISSIONS.get(role, set())
        return perms

    def can(self, *permissions: str) -> bool:
        return all(p in self.permissions for p in permissions)

    def can_any(self, *permissions: str) -> bool:
        return any(p in self.permissions for p in permissions)

    def has_role(self, *roles: RoleKey) -> bool:
        return any(r in self.roles for r in roles)

    # ── ABAC ────────────────────────────────────────────────────────
    @property
    def is_national(self) -> bool:
        return any(j.level is JurisdictionLevel.NATIONAL for j in self.jurisdictions)

    def scope_ids(self, level: JurisdictionLevel) -> list[str]:
        """Ids the caller is scoped to at a given level, empty if unrestricted there."""
        if self.is_national:
            return []
        return [j.ref_id for j in self.jurisdictions if j.level is level and j.ref_id]

    def broadest_level(self) -> JurisdictionLevel:
        if not self.jurisdictions:
            return JurisdictionLevel.VILLAGE
        return min(self.jurisdictions, key=lambda j: LEVEL_RANK[j.level]).level

    def may_access(self, *, state_id=None, district_id=None, tehsil_id=None, village_id=None) -> bool:
        """True when the row falls inside at least one of the caller's jurisdictions."""
        if self.is_national:
            return True
        row = {
            JurisdictionLevel.STATE: str(state_id) if state_id else None,
            JurisdictionLevel.DISTRICT: str(district_id) if district_id else None,
            JurisdictionLevel.TEHSIL: str(tehsil_id) if tehsil_id else None,
            JurisdictionLevel.VILLAGE: str(village_id) if village_id else None,
        }
        for j in self.jurisdictions:
            if j.ref_id and row.get(j.level) == str(j.ref_id):
                return True
        return False


def jurisdiction_filter(principal: Principal, model: Any) -> list[Any]:
    """SQLAlchemy criteria restricting a query to the caller's jurisdictions.

    Returns [] for national-scope callers (no restriction) and a single OR
    clause otherwise. Applied by every list endpoint that touches records.
    """
    from sqlalchemy import or_

    if principal.is_national:
        return []

    clauses = []
    mapping = [
        (JurisdictionLevel.STATE, "state_id"),
        (JurisdictionLevel.DISTRICT, "district_id"),
        (JurisdictionLevel.TEHSIL, "tehsil_id"),
        (JurisdictionLevel.VILLAGE, "village_id"),
    ]
    for level, column in mapping:
        ids = principal.scope_ids(level)
        if ids and hasattr(model, column):
            clauses.append(getattr(model, column).in_(ids))

    if not clauses:
        # Scoped user with no matching column on this model: deny by default.
        from sqlalchemy import false

        return [false()]
    return [or_(*clauses)]


def require_permissions(principal: Principal, *permissions: str) -> None:
    from fastapi import HTTPException, status

    missing = [p for p in permissions if p not in principal.permissions]
    if missing:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "error": "insufficient_permissions",
                "missing": missing,
                "message": "Your role does not allow this action.",
            },
        )


def roles_from_names(names: Iterable[str]) -> list[RoleKey]:
    out: list[RoleKey] = []
    for n in names:
        try:
            out.append(RoleKey(n))
        except ValueError:
            continue
    return out
