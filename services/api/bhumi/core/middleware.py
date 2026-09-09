"""Request id, security headers, access logging, simple rate limiting."""

from __future__ import annotations

import time
import uuid

import structlog
from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse, Response

from bhumi.core.config import settings

log = structlog.get_logger()


class RequestContextMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        rid = request.headers.get("x-request-id") or str(uuid.uuid4())
        request.state.request_id = rid
        started = time.perf_counter()

        try:
            response: Response = await call_next(request)
        except Exception:
            log.exception("request_failed", request_id=rid, path=request.url.path)
            raise

        elapsed_ms = (time.perf_counter() - started) * 1000
        response.headers["X-Request-ID"] = rid
        response.headers["X-Response-Time-ms"] = f"{elapsed_ms:.1f}"

        if not request.url.path.startswith(("/health", "/metrics", "/ready")):
            log.info(
                "request",
                request_id=rid,
                method=request.method,
                path=request.url.path,
                status=response.status_code,
                ms=round(elapsed_ms, 1),
            )
        return response


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Headers expected by a government security audit."""

    async def dispatch(self, request: Request, call_next):
        response: Response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "geolocation=(self), camera=(self), microphone=()"
        response.headers["Cross-Origin-Opener-Policy"] = "same-origin"
        if settings.is_production:
            response.headers["Strict-Transport-Security"] = (
                "max-age=31536000; includeSubDomains; preload"
            )
        return response


class RateLimitMiddleware(BaseHTTPMiddleware):
    """Sliding-window limiter backed by Redis; degrades to pass-through if Redis
    is unavailable, because throttling must never take the platform down."""

    def __init__(self, app, *, requests_per_minute: int = 300) -> None:
        super().__init__(app)
        self.limit = requests_per_minute
        self._redis = None

    async def _get_redis(self):
        if self._redis is None:
            try:
                import redis.asyncio as aioredis

                self._redis = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
            except Exception:
                self._redis = False
        return self._redis or None

    async def dispatch(self, request: Request, call_next):
        if request.url.path.startswith(("/health", "/ready", "/metrics", "/api/docs")):
            return await call_next(request)

        redis = await self._get_redis()
        if redis is None:
            return await call_next(request)

        ident = request.headers.get("authorization") or (
            request.client.host if request.client else "anon"
        )
        window = int(time.time() // 60)
        key = f"rl:{hash(ident) & 0xFFFFFFFF}:{window}"

        try:
            count = await redis.incr(key)
            if count == 1:
                await redis.expire(key, 90)
            if count > self.limit:
                return JSONResponse(
                    status_code=429,
                    content={
                        "error": "rate_limited",
                        "message": "Too many requests. Please slow down.",
                        "retry_after_seconds": 60 - int(time.time() % 60),
                    },
                    headers={"Retry-After": "60"},
                )
        except Exception:
            return await call_next(request)

        response = await call_next(request)
        response.headers["X-RateLimit-Limit"] = str(self.limit)
        response.headers["X-RateLimit-Remaining"] = str(max(0, self.limit - count))
        return response
