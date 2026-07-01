"""Health check server — FastAPI app for worker health endpoints."""

import threading

from fastapi import FastAPI
import uvicorn

from .config import get_settings
from .logger import get_logger

_log = get_logger("health")

app = FastAPI(title="Avesia Worker Health", docs_url=None, redoc_url=None)


@app.get("/health")
async def health():
    settings = get_settings()
    from .ai_provider import AIProviderClient

    ai_client = AIProviderClient()
    try:
        ai_health = ai_client.health_check()
    finally:
        ai_client.close()

    return {
        "status": "ok",
        "worker_id": settings.resolved_worker_id,
        "provider": settings.ai_provider,
        "vector_store": settings.vector_store,
        "queues": "transcription, analysis, summarization, notes-generation, rag-indexing",
        "ai_health": ai_health,
    }


@app.get("/health/ai")
async def ai_health():
    from .ai_provider import AIProviderClient

    ai_client = AIProviderClient()
    try:
        return ai_client.health_check()
    finally:
        ai_client.close()


def start_health_server(port: int) -> threading.Thread:
    """Start the health check server in a background thread."""
    def _run():
        uvicorn.run(app, host="0.0.0.0", port=port, log_level="warning")

    thread = threading.Thread(target=_run, daemon=True)
    thread.start()
    _log.info("health server started", port=port)
    return thread
