"""User management — list, status, role, invite, change-request."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from bhumi.core.audit import record_audit
from bhumi.core.deps import CurrentUser, PageDep, RequirePermissions, SessionDep
from bhumi.core.enums import AuditAction
from bhumi.core.rbac import ROLE_PERMISSIONS, Perm, RoleKey
from bhumi.core.security import hash_password
from bhumi.db.models.identity import Role, User, UserJurisdiction, UserRole
from bhumi.modules.auth.schemas import JurisdictionOut, UserOut

router = APIRouter()


# ── Schemas ──────────────────────────────────────────────────────────

class AdminUserOut(BaseModel):
    id: str
    username: str
    full_name: str
    email: str | None = None
    designation: str | None = None
    domain: str = "government"
    roles: list[str] = []
    permissions: list[str] = []
    jurisdictions: list[JurisdictionOut] = []
    status: str = "active"
    created_at: datetime | None = None
    approved_at: datetime | None = None
    approved_by: str | None = None


class UpdateStatusRequest(BaseModel):
    status: str = Field(..., pattern="^(pending|active|suspended|rejected)$")


class UpdateRoleRequest(BaseModel):
    designation: str = Field(..., min_length=1, max_length=64)


class InviteRequest(BaseModel):
    full_name: str = Field(..., min_length=1, max_length=160)
    email: str = Field(..., max_length=160)
    role: str = Field(..., min_length=1, max_length=64)
    state: str | None = None
    district: str | None = None


class ChangeRequestBody(BaseModel):
    field: str = Field(..., min_length=1, max_length=80)
    reason: str = Field(..., min_length=1, max_length=1000)


# ── Helpers ──────────────────────────────────────────────────────────

def _user_to_out(user: User, status: str = "active", approved_by: str | None = None) -> AdminUserOut:
    perms: set[str] = set()
    for key in user.role_keys:
        try:
            perms |= ROLE_PERMISSIONS.get(RoleKey(key), set())
        except ValueError:
            continue

    domain = "platform"
    platform_keys = {"owner", "platform_admin", "developer", "designer", "analyst", "support"}
    if not any(r in platform_keys for r in user.role_keys):
        domain = "government"

    return AdminUserOut(
        id=str(user.id),
        username=user.username,
        full_name=user.full_name,
        email=user.email,
        designation=user.designation,
        domain=domain,
        roles=user.role_keys,
        permissions=sorted(perms),
        jurisdictions=[
            JurisdictionOut(level=j.level, ref_id=str(j.ref_id) if j.ref_id else None, label=j.label)
            for j in user.jurisdictions
        ],
        status="suspended" if not user.is_active else status,
        created_at=user.created_at,
        approved_by=approved_by,
    )


async def _load_user(session, user_id: str) -> User:
    result = await session.execute(
        select(User)
        .options(selectinload(User.roles), selectinload(User.jurisdictions))
        .where(User.id == uuid.UUID(user_id))
    )
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found.")
    return user


# ── Endpoints ────────────────────────────────────────────────────────

@router.get(
    "/users",
    summary="List all users (admin)",
    dependencies=[Depends(RequirePermissions(Perm.USER_READ))],
)
async def list_users(session: SessionDep, pages: PageDep):
    result = await session.execute(
        select(User)
        .options(selectinload(User.roles), selectinload(User.jurisdictions))
        .order_by(User.created_at.desc())
        .offset(pages.offset)
        .limit(pages.limit)
    )
    users = result.scalars().all()
    return [_user_to_out(u) for u in users]


@router.patch(
    "/users/{user_id}/status",
    summary="Approve, suspend or reject a user",
    dependencies=[Depends(RequirePermissions(Perm.USER_MANAGE))],
)
async def update_user_status(
    user_id: str,
    payload: UpdateStatusRequest,
    principal: CurrentUser,
    session: SessionDep,
):
    user = await _load_user(session, user_id)

    if payload.status == "active":
        user.is_active = True
        user.must_change_password = True  # force password reset on first login after approval
    elif payload.status in ("suspended", "rejected"):
        user.is_active = False

    await record_audit(
        session,
        entity_type="user",
        entity_id=user_id,
        action=AuditAction.UPDATE.value,
        actor_id=principal.user_id,
        actor_username=principal.username,
        payload={"status": payload.status},
    )
    return _user_to_out(user, status=payload.status, approved_by=principal.username)


@router.patch(
    "/users/{user_id}/role",
    summary="Change a user's role / designation",
    dependencies=[Depends(RequirePermissions(Perm.USER_MANAGE))],
)
async def update_user_role(
    user_id: str,
    payload: UpdateRoleRequest,
    principal: CurrentUser,
    session: SessionDep,
):
    user = await _load_user(session, user_id)

    # Find the role row
    role_row = (
        await session.execute(select(Role).where(Role.key == payload.designation))
    ).scalar_one_or_none()
    if role_row is None:
        raise HTTPException(status_code=422, detail=f"Unknown role key: {payload.designation}")

    # Remove all existing roles and assign the new one
    for ur in list(user.roles):
        await session.delete(ur)
    session.add(UserRole(user_id=user.id, role_id=role_row.id, granted_by=uuid.UUID(principal.user_id)))

    user.designation = payload.designation
    await session.flush()
    await session.refresh(user, ["roles"])

    await record_audit(
        session,
        entity_type="user",
        entity_id=user_id,
        action=AuditAction.PERMISSION_CHANGE.value,
        actor_id=principal.user_id,
        actor_username=principal.username,
        payload={"designation": payload.designation},
    )
    return _user_to_out(user)


@router.post(
    "/users/invite",
    summary="Invite a new officer",
    dependencies=[Depends(RequirePermissions(Perm.USER_MANAGE))],
)
async def invite_user(payload: InviteRequest, principal: CurrentUser, session: SessionDep):
    # Check duplicate email
    existing = (
        await session.execute(select(User).where(User.email == payload.email))
    ).scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=409, detail="A user with this email already exists.")

    # Generate a username from email (before the @)
    username = payload.email.split("@")[0].lower().replace(".", "_")[:64]
    # Ensure unique
    count = 0
    base = username
    while (await session.execute(select(User).where(User.username == username))).scalar_one_or_none():
        count += 1
        username = f"{base}_{count}"

    import secrets
    temp_password = secrets.token_urlsafe(16)

    new_user = User(
        username=username,
        full_name=payload.full_name,
        email=payload.email,
        designation=payload.role,
        password_hash=hash_password(temp_password),
        is_active=False,          # needs admin approval
        must_change_password=True,
    )
    session.add(new_user)
    await session.flush()

    # Assign role
    role_row = (
        await session.execute(select(Role).where(Role.key == payload.role))
    ).scalar_one_or_none()
    if role_row:
        session.add(UserRole(user_id=new_user.id, role_id=role_row.id, granted_by=uuid.UUID(principal.user_id)))

    # Add jurisdiction if state/district provided
    if payload.state or payload.district:
        label = f"{payload.district}, {payload.state}" if payload.district else payload.state
        session.add(UserJurisdiction(user_id=new_user.id, level="district", label=label))

    await record_audit(
        session,
        entity_type="user",
        entity_id=str(new_user.id),
        action=AuditAction.CREATE.value,
        actor_id=principal.user_id,
        actor_username=principal.username,
        payload={"invited_email": payload.email, "role": payload.role},
    )

    return {"id": str(new_user.id), "status": "invited", "username": username}


@router.post(
    "/users/change-request",
    summary="Submit a profile-change request to an administrator",
)
async def change_request(payload: ChangeRequestBody, principal: CurrentUser, session: SessionDep):
    """Records the change request in the audit log. Admins can review via the audit trail."""
    await record_audit(
        session,
        entity_type="user",
        entity_id=principal.user_id,
        action=AuditAction.UPDATE.value,
        actor_id=principal.user_id,
        actor_username=principal.username,
        payload={"type": "change_request", "field": payload.field, "reason": payload.reason},
    )
    return {"id": str(uuid.uuid4()), "status": "submitted"}
