"""Users, roles, jurisdiction scoping and API clients."""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from bhumi.db.base import Base, TimestampMixin, UUIDMixin


class Role(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "roles"

    key: Mapped[str] = mapped_column(String(48), unique=True, index=True)
    name_en: Mapped[str] = mapped_column(String(128))
    name_hi: Mapped[str | None] = mapped_column(String(128))
    description: Mapped[str | None] = mapped_column(Text)
    permissions: Mapped[list[str]] = mapped_column(JSONB, default=list)
    is_system: Mapped[bool] = mapped_column(Boolean, default=True)


class UserRole(Base, TimestampMixin):
    __tablename__ = "user_roles"

    user_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    role_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("roles.id", ondelete="CASCADE"), primary_key=True
    )
    granted_by: Mapped[uuid.UUID | None] = mapped_column(PGUUID(as_uuid=True))

    role: Mapped[Role] = relationship(lazy="joined")


class UserJurisdiction(Base, UUIDMixin, TimestampMixin):
    """ABAC scope. A user may hold several — e.g. a Tehsildar covering two tehsils."""

    __tablename__ = "user_jurisdictions"
    __table_args__ = (
        UniqueConstraint("user_id", "level", "ref_id", name="uq_user_jurisdiction"),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    level: Mapped[str] = mapped_column(String(16))          # JurisdictionLevel
    ref_id: Mapped[uuid.UUID | None] = mapped_column(PGUUID(as_uuid=True))
    label: Mapped[str | None] = mapped_column(String(160))  # denormalized for display


class User(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "users"

    username: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    employee_code: Mapped[str | None] = mapped_column(String(48), index=True)
    full_name: Mapped[str] = mapped_column(String(160))
    full_name_local: Mapped[str | None] = mapped_column(String(160))
    designation: Mapped[str | None] = mapped_column(String(128))
    email: Mapped[str | None] = mapped_column(String(160), index=True)
    phone: Mapped[str | None] = mapped_column(String(24))
    password_hash: Mapped[str] = mapped_column(String(255))

    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    must_change_password: Mapped[bool] = mapped_column(Boolean, default=False)
    failed_login_count: Mapped[int] = mapped_column(Integer, default=0)
    locked_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_login_ip: Mapped[str | None] = mapped_column(String(64))

    mfa_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    mfa_secret: Mapped[str | None] = mapped_column(String(64))

    preferred_locale: Mapped[str] = mapped_column(String(8), default="en")
    ui_preferences: Mapped[dict] = mapped_column(JSONB, default=dict)

    roles: Mapped[list[UserRole]] = relationship(
        lazy="selectin", cascade="all, delete-orphan"
    )
    jurisdictions: Mapped[list[UserJurisdiction]] = relationship(
        lazy="selectin", cascade="all, delete-orphan"
    )

    @property
    def role_keys(self) -> list[str]:
        return [ur.role.key for ur in self.roles if ur.role]


class RefreshToken(Base, UUIDMixin, TimestampMixin):
    """Stored so refresh-token reuse can be detected and the family revoked."""

    __tablename__ = "refresh_tokens"

    user_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    jti: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    family_id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    user_agent: Mapped[str | None] = mapped_column(String(255))
    ip_address: Mapped[str | None] = mapped_column(String(64))


class ApiClient(Base, UUIDMixin, TimestampMixin):
    """External government applications integrating over the public API."""

    __tablename__ = "api_clients"

    name: Mapped[str] = mapped_column(String(160))
    organisation: Mapped[str | None] = mapped_column(String(160))
    contact_email: Mapped[str | None] = mapped_column(String(160))
    api_key_hash: Mapped[str] = mapped_column(String(255))
    key_prefix: Mapped[str] = mapped_column(String(16), index=True)
    scopes: Mapped[list[str]] = mapped_column(JSONB, default=list)
    rate_limit_per_minute: Mapped[int] = mapped_column(Integer, default=60)
    allowed_ips: Mapped[list[str]] = mapped_column(JSONB, default=list)
    is_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    last_used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
