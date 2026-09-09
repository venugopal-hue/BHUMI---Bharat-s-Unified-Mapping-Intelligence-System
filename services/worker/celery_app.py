"""Celery application and schedule."""

from __future__ import annotations

import os

from celery import Celery
from celery.schedules import crontab

BROKER = os.getenv("CELERY_BROKER_URL", "redis://redis:6379/1")
BACKEND = os.getenv("CELERY_RESULT_BACKEND", "redis://redis:6379/2")

celery_app = Celery("bhumi", broker=BROKER, backend=BACKEND)

celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="Asia/Kolkata",
    enable_utc=True,
    task_track_started=True,
    task_acks_late=True,                 # a crashed worker must not lose a page
    worker_prefetch_multiplier=1,        # long OCR tasks should not queue behind each other
    task_reject_on_worker_lost=True,
    result_expires=86_400,
    task_time_limit=1800,
    task_soft_time_limit=1500,
    broker_connection_retry_on_startup=True,
    task_routes={
        "worker.tasks.pipeline.*": {"queue": "pipeline"},
        "worker.tasks.mapping.*": {"queue": "pipeline"},
        "worker.tasks.publish.*": {"queue": "publish"},
        "worker.tasks.learning.*": {"queue": "learning"},
    },
    imports=(
        "worker.tasks.pipeline",
        "worker.tasks.publish",
        "worker.tasks.learning",
        "worker.tasks.mapping",
    ),
)

celery_app.conf.beat_schedule = {
    "drain-integration-outbox": {
        "task": "worker.tasks.publish.drain_outbox",
        "schedule": 30.0,
    },
    "release-expired-review-locks": {
        "task": "worker.tasks.pipeline.release_expired_locks",
        "schedule": 60.0,
    },
    "sweep-stuck-documents": {
        "task": "worker.tasks.pipeline.sweep_stuck_documents",
        "schedule": 300.0,
    },
    "build-training-dataset-nightly": {
        "task": "worker.tasks.learning.build_dataset",
        "schedule": crontab(hour=2, minute=0),
    },
    "connector-health-check": {
        "task": "worker.tasks.publish.check_connector_health",
        "schedule": 120.0,
    },
}
