"""Celery application configuration."""

from celery import Celery

from ..config import get_settings

settings = get_settings()

app = Celery(
    "avesia-worker",
    broker=settings.redis_url,
    backend=settings.redis_url,
)

app.conf.update(
    # Serialization
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    # Timezone
    timezone="America/Sao_Paulo",
    enable_utc=True,
    # Task routing
    task_routes={
        "rag-indexing": {"queue": "rag-indexing"},
        "transcription": {"queue": "transcription"},
        "analysis": {"queue": "analysis"},
        "summarization": {"queue": "summarization"},
        "notes-generation": {"queue": "notes-generation"},
    },
    # Default queue
    task_default_queue="default",
    # Concurrency
    worker_concurrency=4,
    # Prefetch: one task at a time for AI-heavy queues
    worker_prefetch_multiplier=1,
    # Retry
    task_acks_late=True,
    task_reject_on_worker_lost=True,
)

# Queue names (matching the TS worker)
QUEUE_NAMES = [
    "transcription",
    "analysis",
    "summarization",
    "notes-generation",
    "rag-indexing",
]
