"""Create or reset the bootstrap SYSTEM_ADMIN account.

Idempotent — running it again resets the password and clears any lockout.
"""

from __future__ import annotations

import asyncio
import os

import structlog
from sqlalchemy import select

from bhumi.core.enums import RoleKey
from bhumi.core.security import hash_password
from bhumi.db.models.identity import Role, User, UserRole
from bhumi.db.session import SessionLocal, engine

log = structlog.get_logger()

USERNAME = os.getenv("BOOTSTRAP_ADMIN_USERNAME", "admin")
EMAIL = os.getenv("BOOTSTRAP_ADMIN_EMAIL", "admin@bhumi.gov.in")
PASSWORD = os.getenv("BOOTSTRAP_ADMIN_PASSWORD", "Admin@12345")


async def create_admin() -> None:
    async with SessionLocal() as session:
        role = (
            await session.execute(select(Role).where(Role.key == RoleKey.SYSTEM_ADMIN.value))
        ).scalar_one_or_none()
        if role is None:
            role = Role(
                key=RoleKey.SYSTEM_ADMIN.value,
                name_en="System Administrator",
                is_system=True,
                permissions=[],
            )
            session.add(role)
            await session.flush()

        user = (
            await session.execute(select(User).where(User.username == USERNAME))
        ).scalar_one_or_none()
        if user is None:
            user = User(username=USERNAME, full_name="BHUMI Administrator", email=EMAIL)
            session.add(user)

        user.password_hash = hash_password(PASSWORD)
        user.is_active = True
        user.must_change_password = False
        user.failed_login_count = 0
        user.locked_until = None
        user.mfa_enabled = False
        await session.flush()

        linked = (
            await session.execute(
                select(UserRole).where(
                    UserRole.user_id == user.id, UserRole.role_id == role.id
                )
            )
        ).scalar_one_or_none()
        if linked is None:
            session.add(UserRole(user_id=user.id, role_id=role.id))

        await session.commit()
        log.info("admin_ready", username=USERNAME, role=role.key)


async def main() -> None:
    await create_admin()
    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
