#!/usr/bin/env python3
"""Avesia Worker — entry point.

Starts the Celery worker and health check server.
"""

import signal
import sys

from sqlalchemy import text

from src.config import get_settings
from src.database import get_engine
from src.logger import setup_logging, get_logger
from src.heartbeat import HeartbeatManager
from src.health import start_health_server


def main():
    settings = get_settings()
    setup_logging()
    log = get_logger("main")

    # Test database connection
    try:
        engine = get_engine()
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        log.info("database connected")
    except Exception as err:
        log.error("database connection failed", error=str(err))
        sys.exit(1)

    # Register heartbeat
    heartbeat = HeartbeatManager()
    heartbeat.register()
    heartbeat.start()

    # Start health check server
    health_thread = start_health_server(settings.port)

    # Graceful shutdown
    def shutdown(signum, frame):
        log.info("shutting down...")
        heartbeat.stop()
        sys.exit(0)

    signal.signal(signal.SIGINT, shutdown)
    signal.signal(signal.SIGTERM, shutdown)

    log.info(
        "worker initialized",
        worker_id=settings.resolved_worker_id,
        port=settings.port,
        provider=settings.ai_provider,
        vector_store=settings.vector_store,
    )

    # Start Celery worker
    # This is done via CLI: celery -A src.tasks.celery_app worker
    # But we can also start it programmatically:
    from src.tasks.celery_app import app, QUEUE_NAMES

    worker = app.Worker(
        queues=",".join(QUEUE_NAMES),
        loglevel=settings.log_level.lower(),
        concurrency=4,
    )

    log.info("starting celery worker", queues=QUEUE_NAMES)
    worker.start()


if __name__ == "__main__":
    main()
