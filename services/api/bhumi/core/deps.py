"""FastAPI dependencies: current principal, permission guards, pagination."""

from __future__ import annotations

from typing import Annotated

import jwt
from fastapi import Depends, HTTPException, Query, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from bhumi.core.rbac import Jurisdiction, Principal, roles_from_names
from bhumi.core.security import decode_token
from bhumi.db.session import get_session

bearer = HTTPBearer(auto_error=False)

SessionDep = Annotated[AsyncSession, Depends(get_session)]


def _unauthorized(detail: str = "Not authenticated.") -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=detail,
        headers={"WWW-Authenticate": "Bearer"},
    )


async def get_principal(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)],
) -> Principal:
    if credentials is None:
        raise _unauthorized()
    try:
        claims = decode_token(credentials.credentials)
    except jwt.ExpiredSignatureError:
        raise _unauthorized("Your session has expired. Please sign in again.") from None
    except jwt.PyJWTError:
        raise _unauthorized("Invalid authentication token.") from None

    return Principal(
        user_id=claims["sub"],
        username=claims.get("username", ""),
        roles=roles_from_names(claims.get("roles", [])),
        jurisdictions=[Jurisdiction.from_claim(j) for j in claims.get("jur", [])],
    )


async def get_optional_principal(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)],
) -> Principal | None:
    if credentials is None:
        return None
    try:
        return await get_principal(credentials)
    except HTTPException:
        return None


CurrentUser = Annotated[Principal, Depends(get_principal)]
OptionalUser = Annotated[Principal | None, Depends(get_optional_principal)]


class RequirePermissions:
    """Route guard: ``dependencies=[Depends(RequirePermissions(Perm.REVIEW_APPROVE))]``"""

    def __init__(self, *permissions: str) -> None:
        self.permissions = permissions

    async def __call__(self, principal: CurrentUser) -> Principal:
        missing = [p for p in self.permissions if p not in principal.permissions]
        if missing:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={
                    "error": "insufficient_permissions",
                    "missing": missing,
                    "message": "Your role does not allow this action.",
                },
            )
        return principal


class Pagination:
    def __init__(
        self,
        page: Annotated[int, Query(ge=1, le=10_000)] = 1,
        page_size: Annotated[int, Query(ge=1, le=200)] = 25,
    ) -> None:
        self.page = page
        self.page_size = page_size
        self.offset = (page - 1) * page_size
        self.limit = page_size


PageDep = Annotated[Pagination, Depends(Pagination)]


def client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def request_id(request: Request) -> str:
    return getattr(request.state, "request_id", "")
