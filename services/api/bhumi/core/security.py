"""Password hashing, JWT issue/verify, TOTP MFA."""

from __future__ import annotations

import secrets
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any

import jwt
import pyotp
from passlib.context import CryptContext

from bhumi.core.config import settings

pwd_context = CryptContext(schemes=["argon2"], deprecated="auto")

ACCESS = "access"
REFRESH = "refresh"


# ── Passwords ───────────────────────────────────────────────────────
def hash_password(plain: str) -> str:
    return pwd_context.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return pwd_context.verify(plain, hashed)
    except Exception:
        return False


def password_strength_errors(password: str) -> list[str]:
    """Government password policy: 10+ chars, mixed case, digit, symbol."""
    errors: list[str] = []
    if len(password) < 10:
        errors.append("Password must be at least 10 characters.")
    if not any(c.islower() for c in password):
        errors.append("Password must contain a lowercase letter.")
    if not any(c.isupper() for c in password):
        errors.append("Password must contain an uppercase letter.")
    if not any(c.isdigit() for c in password):
        errors.append("Password must contain a digit.")
    if not any(not c.isalnum() for c in password):
        errors.append("Password must contain a symbol.")
    return errors


# ── Tokens ──────────────────────────────────────────────────────────
@dataclass(slots=True)
class TokenPair:
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int = 0


def _encode(payload: dict[str, Any], expires_delta: timedelta, token_type: str) -> str:
    now = datetime.now(UTC)
    claims = {
        **payload,
        "iat": now,
        "nbf": now,
        "exp": now + expires_delta,
        "jti": str(uuid.uuid4()),
        "typ": token_type,
        "iss": "bhumi",
    }
    return jwt.encode(claims, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def create_token_pair(
    *,
    user_id: str,
    username: str,
    roles: list[str],
    jurisdictions: list[dict[str, Any]] | None = None,
) -> TokenPair:
    base = {
        "sub": str(user_id),
        "username": username,
        "roles": roles,
        "jur": jurisdictions or [],
    }
    access_ttl = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    refresh_ttl = timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    return TokenPair(
        access_token=_encode(base, access_ttl, ACCESS),
        refresh_token=_encode({"sub": str(user_id)}, refresh_ttl, REFRESH),
        expires_in=int(access_ttl.total_seconds()),
    )


def decode_token(token: str, *, expected_type: str = ACCESS) -> dict[str, Any]:
    """Raises jwt exceptions on failure — callers translate to HTTP 401."""
    claims = jwt.decode(
        token,
        settings.SECRET_KEY,
        algorithms=[settings.ALGORITHM],
        issuer="bhumi",
        options={"require": ["exp", "sub", "typ"]},
    )
    if claims.get("typ") != expected_type:
        raise jwt.InvalidTokenError(f"Expected a {expected_type} token.")
    return claims


# ── MFA ─────────────────────────────────────────────────────────────
def generate_mfa_secret() -> str:
    return pyotp.random_base32()


def mfa_provisioning_uri(secret: str, username: str) -> str:
    return pyotp.TOTP(secret).provisioning_uri(name=username, issuer_name="BHUMI")


def verify_mfa_code(secret: str, code: str) -> bool:
    if not secret or not code:
        return False
    return pyotp.TOTP(secret).verify(code, valid_window=1)


# ── API keys ────────────────────────────────────────────────────────
def generate_api_key() -> tuple[str, str]:
    """Returns (plaintext_key, hash). The plaintext is shown to the user once."""
    key = f"bhumi_{secrets.token_urlsafe(32)}"
    return key, hash_password(key)
