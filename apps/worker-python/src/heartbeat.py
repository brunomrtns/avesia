"""Heartbeat manager — tracks worker liveness in the database."""

import threading
import time
from datetime import datetime

from sqlalchemy.orm import Session

from .config import get_settings
from .database import get_session
from .logger import get_logger
from .models import LocalWorker

_log = get_logger("heartbeat")


class HeartbeatManager:
    """Manages worker heartbeat for local/cloud fallback."""

    def __init__(self, session: Session | None = None):
        self._settings = get_settings()
        self._session = session
        self._interval = self._settings.local_worker_heartbeat_interval_ms / 1000
        self._thread: threading.Thread | None = None
        self._running = False

    def register(self) -> None:
        """Register the worker in the database."""
        session = self._session or get_session()
        try:
            worker_id = self._settings.resolved_worker_id
            import socket

            worker = session.query(LocalWorker).filter_by(worker_id=worker_id).first()
            now = datetime.utcnow()

            if worker:
                worker.status = "ONLINE"
                worker.last_heartbeat_at = now
                worker.hostname = socket.gethostname()
            else:
                from .utils import generate_id as cuid

                worker = LocalWorker(
                    id=cuid(),
                    worker_id=worker_id,
                    hostname=socket.gethostname(),
                    capabilities={"models": [], "type": "background-worker"},
                    last_heartbeat_at=now,
                    status="ONLINE",
                )
                session.add(worker)

            session.commit()
            _log.info("worker registered", worker_id=worker_id)
        except Exception as err:
            _log.error("failed to register worker", error=str(err))
            session.rollback()

    def start(self) -> None:
        """Start the heartbeat thread."""
        self._running = True
        self._thread = threading.Thread(target=self._loop, daemon=True)
        self._thread.start()

    def stop(self) -> None:
        """Stop the heartbeat and mark worker as offline."""
        self._running = False
        if self._thread:
            self._thread.join(timeout=5)

        # Mark as offline
        session = self._session or get_session()
        try:
            worker_id = self._settings.resolved_worker_id
            worker = session.query(LocalWorker).filter_by(worker_id=worker_id).first()
            if worker:
                worker.status = "OFFLINE"
                session.commit()
                _log.info("worker marked offline", worker_id=worker_id)
        except Exception:
            session.rollback()
        finally:
            if not self._session:
                session.close()

    def _loop(self) -> None:
        while self._running:
            time.sleep(self._interval)
            if not self._running:
                break
            try:
                session = self._session or get_session()
                worker_id = self._settings.resolved_worker_id
                worker = session.query(LocalWorker).filter_by(worker_id=worker_id).first()
                if worker:
                    worker.last_heartbeat_at = datetime.utcnow()
                    session.commit()
            except Exception as err:
                _log.error("heartbeat failed", error=str(err))
