from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class LoginRequest(BaseModel):
    username: str = Field(..., min_length=2, max_length=64)
    password: str = Field(..., min_length=1, max_length=256)
    mfa_code: str | None = Field(None, max_length=8)


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int
    must_change_password: bool = False


class MfaChallengeResponse(BaseModel):
    mfa_required: bool = True
    message: str = "Enter the 6-digit code from your authenticator app."


class RefreshRequest(BaseModel):
    refresh_token: str


class JurisdictionOut(BaseModel):
    level: str
    ref_id: str | None = None
    label: str | None = None


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    username: str
    full_name: str
    full_name_local: str | None = None
    designation: str | None = None
    email: str | None = None
    phone: str | None = None
    preferred_locale: str = "en"
    mfa_enabled: bool = False
    is_active: bool = True
    last_login_at: datetime | None = None
    roles: list[str] = []
    permissions: list[str] = []
    jurisdictions: list[JurisdictionOut] = []


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str = Field(..., min_length=10, max_length=256)


class MfaSetupResponse(BaseModel):
    secret: str
    provisioning_uri: str
    message: str = "Scan this in your authenticator app, then confirm with a code."


class MfaVerifyRequest(BaseModel):
    code: str = Field(..., min_length=6, max_length=8)


class UpdateProfileRequest(BaseModel):
    full_name: str | None = Field(None, min_length=1, max_length=160)
    email: str | None = Field(None, max_length=160)
    phone: str | None = Field(None, max_length=24)
    preferred_locale: str | None = Field(None, max_length=8)


class LoginSessionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    login_at: datetime
    logout_at: datetime | None = None
    duration_s: int | None = None
    ip: str | None = None
    device: str | None = None
    device_type: str = "desktop"
    status: str
