"""Authentication: login, MFA, refresh rotation, profile."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

import jwt
from fastapi import APIRouter, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from bhumi.core.audit import record_audit
from bhumi.core.config import settings
from bhumi.core.deps import CurrentUser, SessionDep, client_ip
from bhumi.core.enums import AuditAction
from bhumi.core.rbac import ROLE_PERMISSIONS, RoleKey
from bhumi.core.security import (
    REFRESH,
    create_token_pair,
    decode_token,
    generate_mfa_secret,
    hash_password,
    mfa_provisioning_uri,
    password_strength_errors,
    verify_mfa_code,
    verify_password,
)
from bhumi.db.models.identity import RefreshToken, User
from bhumi.modules.auth.schemas import (
    ChangePasswordRequest,
    JurisdictionOut,
    LoginRequest,
    LoginSessionOut,
    MfaSetupResponse,
    MfaVerifyRequest,
    RefreshRequest,
    TokenResponse,
    UpdateProfileRequest,
    RegisterRequest,
    UserOut,
)

router = APIRouter()

MAX_FAILED_LOGINS = 5
LOCKOUT_MINUTES = 15


async def _load_user(session, username: str) -> User | None:
    result = await session.execute(
        select(User)
        .options(selectinload(User.roles), selectinload(User.jurisdictions))
        .where(User.username == username.lower().strip())
    )
    return result.scalar_one_or_none()


def _principal_claims(user: User) -> dict:
    return {
        "roles": user.role_keys,
        "jurisdictions": [
            {"level": j.level, "ref_id": str(j.ref_id) if j.ref_id else None}
            for j in user.jurisdictions
        ],
    }


@router.post("/register", status_code=201, summary="Self-registration (pending approval)")
async def register(payload: RegisterRequest, session: SessionDep):
    """Creates a pending user account. Admin must approve before first login."""
    from bhumi.db.models.identity import UserJurisdiction

    # Duplicate checks
    if (await session.execute(select(User).where(User.username == payload.username.lower().strip()))).scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Username already taken.")
    if (await session.execute(select(User).where(User.email == payload.email.lower().strip()))).scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Email already registered.")

    errors = password_strength_errors(payload.password)
    if errors:
        raise HTTPException(status_code=422, detail="; ".join(errors))

    user = User(
        username=payload.username.lower().strip(),
        full_name=payload.full_name.strip(),
        email=payload.email.lower().strip(),
        designation=payload.designation,
        password_hash=hash_password(payload.password),
        is_active=False,
        must_change_password=False,
    )
    session.add(user)
    await session.flush()

    if payload.state or payload.district:
        label = ", ".join(filter(None, [payload.district, payload.state]))
        session.add(UserJurisdiction(user_id=user.id, level="district", label=label))

    await record_audit(
        session,
        entity_type="user",
        entity_id=str(user.id),
        action=AuditAction.CREATE.value,
        actor_id=str(user.id),
        actor_username=user.username,
        payload={"source": "self_registration"},
    )
    return {"id": str(user.id), "status": "pending", "message": "Registration submitted. Await admin approval."}


@router.post("/login", response_model=TokenResponse, summary="Sign in")
async def login(payload: LoginRequest, request: Request, session: SessionDep):
    ip = client_ip(request)
    user = await _load_user(session, payload.username)

    generic = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Incorrect username or password.",
    )

    if user is None:
        # Constant-ish work either way so a missing user is not distinguishable.
        verify_password(payload.password, "$argon2id$v=19$m=65536,t=3,p=4$invalid")
        raise generic

    if user.locked_until and user.locked_until > datetime.now(UTC):
        raise HTTPException(
            status_code=status.HTTP_423_LOCKED,
            detail=f"Account locked until {user.locked_until:%H:%M} due to failed sign-in attempts.",
        )

    if not user.is_active:
        raise HTTPException(status_code=403, detail="This account has been deactivated.")

    if not verify_password(payload.password, user.password_hash):
        user.failed_login_count += 1
        if user.failed_login_count >= MAX_FAILED_LOGINS:
            user.locked_until = datetime.now(UTC) + timedelta(minutes=LOCKOUT_MINUTES)
            user.failed_login_count = 0
        await record_audit(
            session,
            entity_type="user",
            entity_id=str(user.id),
            action=AuditAction.LOGIN_FAILED.value,
            actor_username=user.username,
            actor_ip=ip,
            payload={"reason": "bad_password"},
        )
        raise generic

    # MFA is mandatory for supervisory roles and above.
    needs_mfa = user.mfa_enabled or bool(
        settings.mfa_required_roles & {r.upper() for r in user.role_keys}
    )
    if needs_mfa and user.mfa_enabled:
        if not payload.mfa_code:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail={
                    "error": "mfa_required",
                    "message": "Enter the 6-digit code from your authenticator app.",
                },
            )
        if not verify_mfa_code(user.mfa_secret or "", payload.mfa_code):
            raise HTTPException(status_code=401, detail="Invalid authentication code.")

    claims = _principal_claims(user)
    tokens = create_token_pair(
        user_id=str(user.id),
        username=user.username,
        roles=claims["roles"],
        jurisdictions=claims["jurisdictions"],
    )

    decoded = decode_token(tokens.refresh_token, expected_type=REFRESH)
    session.add(
        RefreshToken(
            user_id=user.id,
            jti=decoded["jti"],
            family_id=uuid.uuid4(),
            expires_at=datetime.fromtimestamp(decoded["exp"], UTC),
            user_agent=request.headers.get("user-agent", "")[:255],
            ip_address=ip,
        )
    )

    user.failed_login_count = 0
    user.locked_until = None
    user.last_login_at = datetime.now(UTC)
    user.last_login_ip = ip

    await record_audit(
        session,
        entity_type="user",
        entity_id=str(user.id),
        action=AuditAction.LOGIN.value,
        actor_id=str(user.id),
        actor_username=user.username,
        actor_roles=user.role_keys,
        actor_ip=ip,
        payload={"mfa": bool(user.mfa_enabled)},
    )

    return TokenResponse(
        access_token=tokens.access_token,
        refresh_token=tokens.refresh_token,
        expires_in=tokens.expires_in,
        must_change_password=user.must_change_password,
    )


@router.post("/refresh", response_model=TokenResponse, summary="Rotate the session")
async def refresh(payload: RefreshRequest, request: Request, session: SessionDep):
    try:
        claims = decode_token(payload.refresh_token, expected_type=REFRESH)
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid refresh token.") from None

    stored = (
        await session.execute(select(RefreshToken).where(RefreshToken.jti == claims["jti"]))
    ).scalar_one_or_none()

    if stored is None:
        raise HTTPException(status_code=401, detail="Refresh token not recognised.")

    if stored.revoked_at is not None:
        # Reuse of a rotated token means the token was stolen: kill the family.
        family = (
            await session.execute(
                select(RefreshToken).where(RefreshToken.family_id == stored.family_id)
            )
        ).scalars()
        now = datetime.now(UTC)
        for token in family:
            token.revoked_at = token.revoked_at or now
        raise HTTPException(
            status_code=401,
            detail="This session has been revoked for security reasons. Please sign in again.",
        )

    result = await session.execute(
        select(User)
        .options(selectinload(User.roles), selectinload(User.jurisdictions))
        .where(User.id == stored.user_id)
    )
    user = result.scalar_one_or_none()
    if user is None or not user.is_active:
        raise HTTPException(status_code=401, detail="Account is no longer active.")

    stored.revoked_at = datetime.now(UTC)

    c = _principal_claims(user)
    tokens = create_token_pair(
        user_id=str(user.id),
        username=user.username,
        roles=c["roles"],
        jurisdictions=c["jurisdictions"],
    )
    decoded = decode_token(tokens.refresh_token, expected_type=REFRESH)
    session.add(
        RefreshToken(
            user_id=user.id,
            jti=decoded["jti"],
            family_id=stored.family_id,
            expires_at=datetime.fromtimestamp(decoded["exp"], UTC),
            ip_address=client_ip(request),
        )
    )

    return TokenResponse(
        access_token=tokens.access_token,
        refresh_token=tokens.refresh_token,
        expires_in=tokens.expires_in,
    )


@router.post("/logout", status_code=204, summary="Sign out")
async def logout(payload: RefreshRequest, principal: CurrentUser, session: SessionDep):
    try:
        claims = decode_token(payload.refresh_token, expected_type=REFRESH)
    except jwt.PyJWTError:
        return

    stored = (
        await session.execute(select(RefreshToken).where(RefreshToken.jti == claims["jti"]))
    ).scalar_one_or_none()
    if stored and stored.revoked_at is None:
        stored.revoked_at = datetime.now(UTC)

    await record_audit(
        session,
        entity_type="user",
        entity_id=principal.user_id,
        action=AuditAction.LOGOUT.value,
        actor_id=principal.user_id,
        actor_username=principal.username,
    )


@router.get("/me", response_model=UserOut, summary="Current user profile")
async def me(principal: CurrentUser, session: SessionDep):
    result = await session.execute(
        select(User)
        .options(selectinload(User.roles), selectinload(User.jurisdictions))
        .where(User.id == uuid.UUID(principal.user_id))
    )
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found.")

    perms: set[str] = set()
    for key in user.role_keys:
        try:
            perms |= ROLE_PERMISSIONS.get(RoleKey(key), set())
        except ValueError:
            continue

    return UserOut(
        id=str(user.id),
        username=user.username,
        full_name=user.full_name,
        full_name_local=user.full_name_local,
        designation=user.designation,
        email=user.email,
        phone=user.phone,
        preferred_locale=user.preferred_locale,
        mfa_enabled=user.mfa_enabled,
        is_active=user.is_active,
        last_login_at=user.last_login_at,
        roles=user.role_keys,
        permissions=sorted(perms),
        jurisdictions=[
            JurisdictionOut(
                level=j.level, ref_id=str(j.ref_id) if j.ref_id else None, label=j.label
            )
            for j in user.jurisdictions
        ],
    )


@router.post("/change-password", status_code=204, summary="Change password")
async def change_password(
    payload: ChangePasswordRequest, principal: CurrentUser, session: SessionDep
):
    user = (
        await session.execute(select(User).where(User.id == uuid.UUID(principal.user_id)))
    ).scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found.")

    if not verify_password(payload.current_password, user.password_hash):
        raise HTTPException(status_code=400, detail="Current password is incorrect.")

    errors = password_strength_errors(payload.new_password)
    if errors:
        raise HTTPException(status_code=422, detail={"error": "weak_password", "issues": errors})

    user.password_hash = hash_password(payload.new_password)
    user.must_change_password = False

    await record_audit(
        session,
        entity_type="user",
        entity_id=str(user.id),
        action=AuditAction.UPDATE.value,
        actor_id=principal.user_id,
        actor_username=principal.username,
        payload={"change": "password"},
    )


@router.post("/mfa/setup", response_model=MfaSetupResponse, summary="Begin MFA enrolment")
async def mfa_setup(principal: CurrentUser, session: SessionDep):
    user = (
        await session.execute(select(User).where(User.id == uuid.UUID(principal.user_id)))
    ).scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found.")

    secret = generate_mfa_secret()
    user.mfa_secret = secret          # activated only once a code is confirmed
    return MfaSetupResponse(
        secret=secret,
        provisioning_uri=mfa_provisioning_uri(secret, user.username),
    )


@router.post("/mfa/verify", status_code=204, summary="Confirm and enable MFA")
async def mfa_verify(payload: MfaVerifyRequest, principal: CurrentUser, session: SessionDep):
    user = (
        await session.execute(select(User).where(User.id == uuid.UUID(principal.user_id)))
    ).scalar_one_or_none()
    if user is None or not user.mfa_secret:
        raise HTTPException(status_code=400, detail="Start MFA setup first.")

    if not verify_mfa_code(user.mfa_secret, payload.code):
        raise HTTPException(status_code=400, detail="That code is not valid. Try the next one.")

    user.mfa_enabled = True
    await record_audit(
        session,
        entity_type="user",
        entity_id=str(user.id),
        action=AuditAction.PERMISSION_CHANGE.value,
        actor_id=principal.user_id,
        actor_username=principal.username,
        payload={"mfa_enabled": True},
    )


@router.patch("/me", response_model=UserOut, summary="Update own profile")
async def update_me(payload: UpdateProfileRequest, principal: CurrentUser, session: SessionDep):
    result = await session.execute(
        select(User)
        .options(selectinload(User.roles), selectinload(User.jurisdictions))
        .where(User.id == uuid.UUID(principal.user_id))
    )
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found.")

    if payload.full_name is not None:
        user.full_name = payload.full_name
    if payload.email is not None:
        user.email = payload.email
    if payload.phone is not None:
        user.phone = payload.phone
    if payload.preferred_locale is not None:
        user.preferred_locale = payload.preferred_locale

    await record_audit(
        session,
        entity_type="user",
        entity_id=str(user.id),
        action=AuditAction.UPDATE.value,
        actor_id=principal.user_id,
        actor_username=principal.username,
        payload={"fields": [k for k, v in payload.model_dump().items() if v is not None]},
    )

    perms: set[str] = set()
    for key in user.role_keys:
        try:
            perms |= ROLE_PERMISSIONS.get(RoleKey(key), set())
        except ValueError:
            continue

    return UserOut(
        id=str(user.id),
        username=user.username,
        full_name=user.full_name,
        full_name_local=user.full_name_local,
        designation=user.designation,
        email=user.email,
        phone=user.phone,
        preferred_locale=user.preferred_locale,
        mfa_enabled=user.mfa_enabled,
        is_active=user.is_active,
        last_login_at=user.last_login_at,
        roles=user.role_keys,
        permissions=sorted(perms),
        jurisdictions=[
            JurisdictionOut(level=j.level, ref_id=str(j.ref_id) if j.ref_id else None, label=j.label)
            for j in user.jurisdictions
        ],
    )


@router.get("/sessions", summary="Login history for the current user")
async def list_sessions(principal: CurrentUser, session: SessionDep):
    """Returns the 50 most recent refresh tokens (= login events) for this user."""
    result = await session.execute(
        select(RefreshToken)
        .where(RefreshToken.user_id == uuid.UUID(principal.user_id))
        .order_by(RefreshToken.created_at.desc())
        .limit(50)
    )
    tokens_list = result.scalars().all()
    rows = []
    for t in tokens_list:
        is_active = t.revoked_at is None and t.expires_at > datetime.now(UTC)
        logout_at = t.revoked_at if t.revoked_at else (None if is_active else t.expires_at)
        duration_s = None
        if logout_at and t.created_at:
            duration_s = max(0, int((logout_at - t.created_at.replace(tzinfo=UTC)).total_seconds()))
        ua = t.user_agent or ""
        device_type = "mobile" if any(x in ua.lower() for x in ("android", "iphone", "ipad", "mobile")) else "desktop"
        rows.append({
            "id": str(t.id),
            "login_at": t.created_at,
            "logout_at": logout_at,
            "duration_s": duration_s,
            "ip": t.ip_address,
            "device": ua[:120] if ua else "Unknown",
            "device_type": device_type,
            "status": "ACTIVE" if is_active else "CLOSED",
        })
    return rows


@router.delete("/sessions", status_code=204, summary="Revoke all sessions except the current one")
async def revoke_other_sessions(principal: CurrentUser, session: SessionDep):
    """Revokes all active refresh tokens for this user.
    The client's current access token remains valid until its natural expiry."""
    result = await session.execute(
        select(RefreshToken)
        .where(
            RefreshToken.user_id == uuid.UUID(principal.user_id),
            RefreshToken.revoked_at.is_(None),
        )
    )
    now = datetime.now(UTC)
    for t in result.scalars().all():
        t.revoked_at = now
    await record_audit(
        session,
        entity_type="user",
        entity_id=principal.user_id,
        action=AuditAction.LOGOUT.value,
        actor_id=principal.user_id,
        actor_username=principal.username,
        payload={"reason": "bulk_revoke"},
    )
