"""In-app notifications."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select

from bhumi.core.deps import CurrentUser, PageDep, RequirePermissions, SessionDep
from bhumi.core.rbac import Perm
from bhumi.db.models.governance import Notification

router = APIRouter()


@router.get(
    "/notifications",
    summary="List notifications for the current user",
)
async def list_notifications(
    principal: CurrentUser,
    session: SessionDep,
    pages: PageDep,
):
    result = await session.execute(
        select(Notification)
        .where(Notification.user_id == uuid.UUID(principal.user_id))
        .order_by(Notification.created_at.desc())
        .offset(pages.offset)
        .limit(pages.limit)
    )
    rows = result.scalars().all()
    return [
        {
            "id": str(n.id),
            "title": n.title,
            "body": n.body,
            "link": n.link,
            "severity": n.severity,
            "read_at": n.read_at,
            "created_at": n.created_at,
        }
        for n in rows
    ]


@router.post(
    "/notifications/{notification_id}/read",
    summary="Mark a notification as read",
)
async def mark_read(notification_id: str, principal: CurrentUser, session: SessionDep):
    n = (
        await session.execute(
            select(Notification)
            .where(
                Notification.id == uuid.UUID(notification_id),
                Notification.user_id == uuid.UUID(principal.user_id),
            )
        )
    ).scalar_one_or_none()
    if n is None:
        raise HTTPException(status_code=404, detail="Notification not found.")
    if n.read_at is None:
        n.read_at = datetime.now(UTC)
    return {"id": str(n.id), "read": True}


@router.post(
    "/notifications/mark-all-read",
    summary="Mark all notifications as read",
)
async def mark_all_read(principal: CurrentUser, session: SessionDep):
    result = await session.execute(
        select(Notification)
        .where(
            Notification.user_id == uuid.UUID(principal.user_id),
            Notification.read_at.is_(None),
        )
    )
    now = datetime.now(UTC)
    count = 0
    for n in result.scalars().all():
        n.read_at = now
        count += 1
    return {"count": count}
