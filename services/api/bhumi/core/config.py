"""Application settings, loaded from environment."""

from __future__ import annotations

from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore"
    )

    # ── App ─────────────────────────────────────────────────────────
    PROJECT_NAME: str = "BHUMI"
    PROJECT_TAGLINE: str = "Bharat's Unified Mapping & Intelligence System"
    ENVIRONMENT: str = "development"
    DEBUG: bool = True
    API_V1_PREFIX: str = "/api/v1"
    LOG_LEVEL: str = "INFO"

    # ── Security ────────────────────────────────────────────────────
    SECRET_KEY: str = "change-me"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    MFA_REQUIRED_ROLES: str = "SUPERVISOR,DISTRICT_OFFICER,STATE_ADMIN,SYSTEM_ADMIN"
    CORS_ORIGINS: str = "http://localhost:3000,http://127.0.0.1:3000"

    # ── Database ────────────────────────────────────────────────────
    DATABASE_URL: str = "postgresql+asyncpg://bhumi:bhumi@postgres:5432/bhumi"
    SYNC_DATABASE_URL: str = "postgresql+psycopg://bhumi:bhumi@postgres:5432/bhumi"
    DB_POOL_SIZE: int = 10
    DB_MAX_OVERFLOW: int = 20
    DB_ECHO: bool = False

    # ── Redis / Celery ──────────────────────────────────────────────
    REDIS_URL: str = "redis://redis:6379/0"
    CELERY_BROKER_URL: str = "redis://redis:6379/1"
    CELERY_RESULT_BACKEND: str = "redis://redis:6379/2"

    # ── Object storage ──────────────────────────────────────────────
    S3_ENDPOINT_URL: str = "http://minio:9000"
    S3_PUBLIC_ENDPOINT_URL: str = "http://localhost:9000"
    S3_ACCESS_KEY: str = "bhumiadmin"
    S3_SECRET_KEY: str = "bhumiadmin"
    S3_BUCKET_DOCUMENTS: str = "bhumi-documents"
    S3_BUCKET_MODELS: str = "bhumi-models"
    S3_REGION: str = "ap-south-1"
    PRESIGN_EXPIRY_SECONDS: int = 3600

    # ── Pipeline ────────────────────────────────────────────────────
    AUTO_APPROVE_THRESHOLD: float = 0.92
    PRIORITY_REVIEW_THRESHOLD: float = 0.75
    QA_SAMPLE_RATE: float = 0.05
    REVIEW_LOCK_TTL_SECONDS: int = 900
    MAX_UPLOAD_MB: int = 100
    TARGET_DPI: int = 300
    MIN_PAGE_QUALITY: int = 35

    # ── OCR / ML ────────────────────────────────────────────────────
    OCR_ENGINES: str = "paddle,tesseract"
    TESSERACT_LANGS: str = "eng+hin+mar"
    ENABLE_HANDWRITING_MODEL: bool = True
    ENABLE_LLM_FALLBACK: bool = False
    LLM_BASE_URL: str = ""
    LLM_MODEL: str = ""
    MODEL_DIR: str = "/models"

    # ── Integrations ────────────────────────────────────────────────
    DILRMP_BASE_URL: str = "http://mock-dilrmp:8010"
    DILRMP_API_KEY: str = "demo-key"
    DIGILOCKER_BASE_URL: str = "http://mock-dilrmp:8010/digilocker"
    ENABLE_OUTBOUND_SYNC: bool = True

    # ── Notifications ───────────────────────────────────────────────
    SMTP_HOST: str = "mailhog"
    SMTP_PORT: int = 1025
    SMTP_FROM: str = "no-reply@bhumi.gov.in"
    SMS_PROVIDER: str = "console"
    SMS_API_KEY: str = ""

    # ── Observability ───────────────────────────────────────────────
    OTEL_EXPORTER_OTLP_ENDPOINT: str = ""
    SENTRY_DSN: str = ""

    # ── Derived ─────────────────────────────────────────────────────
    @property
    def cors_origins(self) -> list[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]

    @property
    def mfa_required_roles(self) -> set[str]:
        return {r.strip().upper() for r in self.MFA_REQUIRED_ROLES.split(",") if r.strip()}

    @property
    def ocr_engines(self) -> list[str]:
        return [e.strip() for e in self.OCR_ENGINES.split(",") if e.strip()]

    @property
    def is_production(self) -> bool:
        return self.ENVIRONMENT.lower() in {"production", "prod"}


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
