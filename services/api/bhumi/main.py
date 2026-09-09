"""BHUMI API — application entrypoint."""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

import structlog
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from bhumi.core.config import settings
from bhumi.core.middleware import (
    RateLimitMiddleware,
    RequestContextMiddleware,
    SecurityHeadersMiddleware,
)
from bhumi.modules.auth.router import router as auth_router
from bhumi.modules.insights.router import router as insights_router
from bhumi.modules.intake.router import router as intake_router
from bhumi.modules.integrations.router import router as integrations_router
from bhumi.modules.mapping.router import router as mapping_router
from bhumi.modules.extraction.router import router as records_router
from bhumi.modules.review.router import router as review_router
from bhumi.modules.validation.router import router as validation_router
from bhumi.modules.vault.router import router as vault_router
from bhumi.modules.learning.router import router as learning_router

logging.basicConfig(level=getattr(logging, settings.LOG_LEVEL, logging.INFO))
structlog.configure(
    processors=[
        structlog.contextvars.merge_contextvars,
        structlog.processors.add_log_level,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.JSONRenderer()
        if settings.is_production
        else structlog.dev.ConsoleRenderer(),
    ]
)
log = structlog.get_logger()


@asynccontextmanager
async def lifespan(app: FastAPI):
    log.info(
        "bhumi_starting",
        environment=settings.ENVIRONMENT,
        auto_approve_threshold=settings.AUTO_APPROVE_THRESHOLD,
    )
    try:
        from bhumi.core.storage import ensure_buckets

        ensure_buckets()
    except Exception as exc:  # object storage may lag behind the API on cold start
        log.warning("storage_bootstrap_deferred", error=str(exc))
    yield
    log.info("bhumi_stopping")


DESCRIPTION = """
**BHUMI — Bharat's Unified Mapping & Intelligence System**

AI-driven platform for digitizing, validating and managing land records.

The pipeline: **Intake → Vision → Extraction → Validation → Review → Integrations → Vault**,
with **Insights**, **Mapping** and **Learning** running alongside.

Every extracted field carries a calibrated confidence score. Fields the models are
unsure about are routed to a human verifier; the rest flow straight through.
"""

app = FastAPI(
    title="BHUMI API",
    description=DESCRIPTION,
    version="1.0.0",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
    lifespan=lifespan,
    contact={"name": "BHUMI Platform Team"},
    license_info={"name": "Government of India"},
)

app.add_middleware(RequestContextMiddleware)
app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(RateLimitMiddleware, requests_per_minute=600)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Request-ID", "X-Total-Count"],
)

P = settings.API_V1_PREFIX
app.include_router(auth_router, prefix=f"{P}/auth", tags=["Auth"])
app.include_router(intake_router, prefix=P, tags=["Intake"])
app.include_router(records_router, prefix=f"{P}/records", tags=["Extraction · Records"])
app.include_router(validation_router, prefix=P, tags=["Validation"])
app.include_router(review_router, prefix=f"{P}/review", tags=["Review"])
app.include_router(mapping_router, prefix=f"{P}/gis", tags=["Mapping · GIS"])
app.include_router(insights_router, prefix=f"{P}/analytics", tags=["Insights"])
app.include_router(integrations_router, prefix=P, tags=["Integrations"])
app.include_router(vault_router, prefix=P, tags=["Vault · Audit"])
app.include_router(learning_router, prefix=f"{P}/models", tags=["Learning"])


@app.exception_handler(ValueError)
async def value_error_handler(request: Request, exc: ValueError):
    return JSONResponse(
        status_code=400,
        content={"error": "bad_request", "message": str(exc)},
    )


@app.get("/health", tags=["Ops"], summary="Liveness probe")
async def health():
    return {"status": "ok", "service": "bhumi-api", "version": app.version}


@app.get("/ready", tags=["Ops"], summary="Readiness probe")
async def ready():
    from sqlalchemy import text

    from bhumi.db.session import SessionLocal

    checks: dict[str, str] = {}
    try:
        async with SessionLocal() as s:
            await s.execute(text("SELECT 1"))
        checks["database"] = "ok"
    except Exception as exc:
        checks["database"] = f"error: {exc}"

    try:
        import redis.asyncio as aioredis

        r = aioredis.from_url(settings.REDIS_URL)
        await r.ping()
        checks["redis"] = "ok"
    except Exception as exc:
        checks["redis"] = f"error: {exc}"

    healthy = all(v == "ok" for v in checks.values())
    return JSONResponse(
        status_code=200 if healthy else 503,
        content={"ready": healthy, "checks": checks},
    )


@app.get("/", tags=["Ops"], include_in_schema=False)
async def root():
    return {
        "name": settings.PROJECT_NAME,
        "tagline": settings.PROJECT_TAGLINE,
        "problem_statement": "SIH 26018 — Intelligent Land Record Digitization and Validation System",
        "modules": [
            "Intake", "Vision", "Extraction", "Validation", "Review",
            "Mapping", "Insights", "Integrations", "Vault", "Learning",
        ],
        "docs": "/api/docs",
    }
