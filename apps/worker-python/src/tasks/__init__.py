"""Tasks package — Celery task definitions."""

# Import all task modules to register them with Celery
from . import rag_tasks  # noqa: F401
from . import analysis_tasks  # noqa: F401
from . import summary_tasks  # noqa: F401
from . import notes_tasks  # noqa: F401
from . import transcription_tasks  # noqa: F401
from .celery_app import app, QUEUE_NAMES  # noqa: F401
