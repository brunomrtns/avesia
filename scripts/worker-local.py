#!/usr/bin/env python3
"""
Avesia — Local Whisper transcription worker.

A standalone Python script that consumes transcription tasks directly from the
Celery Redis queue (no Celery worker process required), transcribes audio with
faster-whisper on a local GPU, and submits the transcript back to the Avesia
API.

Usage:
    python scripts/worker-local.py

Configuration is via environment variables (see README-worker-local.md).
A `.env` file at the project root is loaded automatically if present.
"""

from __future__ import annotations

import base64
import json
import logging
import os
import signal
import socket
import sys
import tempfile
import threading
import time
from pathlib import Path
from typing import Any

import httpx
import redis as redis_lib
from dotenv import load_dotenv
from minio import Minio

# --------------------------------------------------------------------------- #
#  Configuration
# --------------------------------------------------------------------------- #

# Load .env from the project root (two levels up from scripts/)
_PROJECT_ROOT = Path(__file__).resolve().parent.parent
load_dotenv(_PROJECT_ROOT / ".env")

REDIS_URL = os.environ.get("REDIS_URL", "redis://10.0.0.1:6379/0")
TRANSCRIPTION_QUEUE = os.environ.get("TRANSCRIPTION_QUEUE", "transcription")

MINIO_ENDPOINT = os.environ.get("MINIO_ENDPOINT", "10.0.0.1")
MINIO_PORT = int(os.environ.get("MINIO_PORT", "9100"))
MINIO_ROOT_USER = os.environ.get("MINIO_ROOT_USER", "avesia")
MINIO_ROOT_PASSWORD = os.environ.get("MINIO_ROOT_PASSWORD", "")
MINIO_BUCKET = os.environ.get("MINIO_BUCKET", "avesia")

API_BASE_URL = os.environ.get("API_BASE_URL", "http://10.0.0.1:3100")
API_TOKEN = os.environ.get("API_TOKEN", "")
API_KEY = os.environ.get("API_KEY", "")

WHISPER_MODEL = os.environ.get("WHISPER_MODEL", "base")
WHISPER_DEVICE = os.environ.get("WHISPER_DEVICE", "cuda")
WHISPER_COMPUTE_TYPE = os.environ.get("WHISPER_COMPUTE_TYPE", "auto")
WHISPER_LANGUAGE = os.environ.get("WHISPER_LANGUAGE", "pt")
WHISPER_BEAM_SIZE = int(os.environ.get("WHISPER_BEAM_SIZE", "5"))

WORKER_ID = os.environ.get("WORKER_ID", f"local-worker-{socket.gethostname()}")
HEARTBEAT_INTERVAL = int(os.environ.get("HEARTBEAT_INTERVAL", "25"))

LOG_LEVEL = os.environ.get("WORKER_LOG_LEVEL", "INFO").upper()

# --------------------------------------------------------------------------- #
#  Logging
# --------------------------------------------------------------------------- #

logging.basicConfig(
    level=getattr(logging, LOG_LEVEL, logging.INFO),
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
log = logging.getLogger("worker-local")


# --------------------------------------------------------------------------- #
#  State
# --------------------------------------------------------------------------- #

_running = True
_whisper_model = None
_redis: redis_lib.Redis | None = None
_minio: Minio | None = None
_http: httpx.Client | None = None


def stop(*_args: Any) -> None:
    global _running
    if _running:
        log.info("Shutdown requested — stopping worker…")
        _running = False


signal.signal(signal.SIGINT, stop)
signal.signal(signal.SIGTERM, stop)


# --------------------------------------------------------------------------- #
#  Clients (lazy singletons)
# --------------------------------------------------------------------------- #

def get_redis() -> redis_lib.Redis:
    global _redis
    if _redis is None:
        _redis = redis_lib.from_url(REDIS_URL, decode_responses=True)
    return _redis


def get_minio() -> Minio:
    global _minio
    if _minio is None:
        _minio = Minio(
            f"{MINIO_ENDPOINT}:{MINIO_PORT}",
            access_key=MINIO_ROOT_USER,
            secret_key=MINIO_ROOT_PASSWORD,
            secure=False,
        )
    return _minio


def get_http() -> httpx.Client:
    global _http
    if _http is None:
        _http = httpx.Client(base_url=API_BASE_URL, timeout=120.0)
    return _http


def get_whisper():
    """Lazy-load the faster-whisper model (heavy — only load once)."""
    global _whisper_model
    if _whisper_model is None:
        log.info(
            "Loading Whisper model: model=%s device=%s compute=%s",
            WHISPER_MODEL, WHISPER_DEVICE, WHISPER_COMPUTE_TYPE,
        )
        from faster_whisper import WhisperModel

        compute_type = WHISPER_COMPUTE_TYPE
        if compute_type == "auto":
            compute_type = "float16" if WHISPER_DEVICE == "cuda" else "int8"

        _whisper_model = WhisperModel(
            WHISPER_MODEL,
            device=WHISPER_DEVICE,
            compute_type=compute_type,
        )
        log.info("Whisper model loaded.")
    return _whisper_model


# --------------------------------------------------------------------------- #
#  Auth helpers
# --------------------------------------------------------------------------- #

def auth_headers() -> dict[str, str]:
    headers: dict[str, str] = {"Content-Type": "application/json"}
    if API_TOKEN:
        headers["Authorization"] = f"Bearer {API_TOKEN}"
    elif API_KEY:
        headers["X-API-Key"] = API_KEY
    return headers


# --------------------------------------------------------------------------- #
#  Celery message parsing (protocol v2)
# --------------------------------------------------------------------------- #

def parse_celery_message(raw: str) -> dict[str, Any]:
    """
    Parse a Celery protocol v2 message from a Redis list entry.

    The message is JSON with a base64-encoded `body` field. The decoded body
    is a JSON array: ``[args, kwargs, embed]`` where ``kwargs`` holds the task
    keyword arguments.
    """
    msg = json.loads(raw)
    body_b64 = msg.get("body", "")
    body_json = base64.b64decode(body_b64).decode("utf-8")
    body = json.loads(body_json)
    # body = [args, kwargs, embed]
    args = body[0] if len(body) > 0 else []
    kwargs = body[1] if len(body) > 1 else {}
    headers = msg.get("headers", {})
    task_id = headers.get("id") or msg.get("properties", {}).get("correlation_id")
    task_name = headers.get("task")
    return {
        "task_id": task_id,
        "task_name": task_name,
        "args": args,
        "kwargs": kwargs,
        "headers": headers,
    }


def extract_task_params(parsed: dict[str, Any]) -> dict[str, str]:
    """
    Extract recording/session/storage identifiers from the task kwargs.

    Supports both camelCase (recordingId, sessionId, storageKey) and
    snake_case (recording_id, session_id, organization_id, storage_key)
    naming conventions for robustness.
    """
    kw = parsed["kwargs"]
    # Also check headers.args/headers.kwargs (Celery protocol v2 embeds them)
    headers = parsed.get("headers", {})
    merged = {**kw}
    if isinstance(headers.get("kwargs"), dict):
        merged.update(headers["kwargs"])
    if isinstance(headers.get("args"), list) and headers["args"]:
        args_list = headers["args"]
        # Positional args: [recording_id, session_id, organization_id]
        names = ["recording_id", "session_id", "organization_id"]
        for i, name in enumerate(names):
            if i < len(args_list) and name not in merged:
                merged[name] = args_list[i]

    def pick(*keys: str) -> str | None:
        for k in keys:
            if k in merged and merged[k] is not None:
                return str(merged[k])
        return None

    recording_id = pick("recordingId", "recording_id")
    session_id = pick("sessionId", "session_id")
    organization_id = pick("organizationId", "organization_id")
    storage_key = pick("storageKey", "storage_key")

    return {
        "recording_id": recording_id or "",
        "session_id": session_id or "",
        "organization_id": organization_id or "",
        "storage_key": storage_key or "",
    }


# --------------------------------------------------------------------------- #
#  MinIO helpers
# --------------------------------------------------------------------------- #

def download_audio(storage_key: str) -> bytes:
    client = get_minio()
    log.info("Downloading audio from MinIO: bucket=%s key=%s", MINIO_BUCKET, storage_key)
    response = client.get_object(MINIO_BUCKET, storage_key)
    try:
        return response.read()
    finally:
        response.close()
        response.release_conn()


def delete_audio(storage_key: str) -> None:
    client = get_minio()
    try:
        client.remove_object(MINIO_BUCKET, storage_key)
        log.info("Deleted audio from MinIO: %s", storage_key)
    except Exception as err:
        log.warning("Failed to delete audio from MinIO (%s): %s", storage_key, err)


# --------------------------------------------------------------------------- #
#  Whisper transcription
# --------------------------------------------------------------------------- #

def transcribe_audio(audio_path: str) -> dict[str, Any]:
    """
    Run faster-whisper transcription on the given audio file.

    Returns a dict with ``segments`` (list) and ``text`` (full text).
    """
    model = get_whisper()
    log.info("Transcribing: %s (language=%s, beam_size=%s)", audio_path, WHISPER_LANGUAGE, WHISPER_BEAM_SIZE)
    segments_iter, info = model.transcribe(
        audio_path,
        language=WHISPER_LANGUAGE,
        beam_size=WHISPER_BEAM_SIZE,
        vad_filter=True,
    )

    segments = []
    full_text_parts = []
    for i, seg in enumerate(segments_iter, start=1):
        segments.append({
            "sequence": i,
            "startTime": round(seg.start, 3),
            "endTime": round(seg.end, 3),
            "speaker": "UNKNOWN",
            "text": seg.text.strip(),
            "confidence": round(float(getattr(seg, "avg_logprob", 0.0)), 4) or None,
        })
        full_text_parts.append(seg.text.strip())

    log.info(
        "Transcription complete: %d segments, duration=%.1fs, language=%s",
        len(segments), getattr(info, "duration", 0.0), getattr(info, "language", WHISPER_LANGUAGE),
    )
    return {
        "segments": segments,
        "text": " ".join(full_text_parts),
        "language": getattr(info, "language", WHISPER_LANGUAGE),
        "duration": getattr(info, "duration", 0.0),
    }


# --------------------------------------------------------------------------- #
#  API calls
# --------------------------------------------------------------------------- #

def submit_transcript(session_id: str, recording_id: str, result: dict[str, Any]) -> None:
    http = get_http()
    payload = {
        "recordingId": recording_id,
        "segments": result["segments"],
        "provider": "whisper-local",
        "tokenCount": None,
        "language": result.get("language", WHISPER_LANGUAGE),
    }
    url = f"/sessions/{session_id}/transcript"
    log.info("Submitting transcript to API: %s (recording=%s)", url, recording_id)
    resp = http.post(url, json=payload, headers=auth_headers())
    if resp.status_code >= 400:
        raise RuntimeError(f"API rejected transcript ({resp.status_code}): {resp.text}")
    log.info("Transcript submitted.")


def update_recording_status(recording_id: str, status: str, error: str | None = None) -> None:
    http = get_http()
    payload: dict[str, Any] = {"status": status}
    if error:
        payload["errorMessage"] = error
    try:
        resp = http.post(
            f"/recordings/{recording_id}/status",
            json=payload,
            headers=auth_headers(),
        )
        if resp.status_code >= 400:
            log.warning("Failed to update recording status (%s): %s", resp.status_code, resp.text)
    except Exception as err:
        log.warning("Failed to update recording status: %s", err)


def send_heartbeat() -> None:
    http = get_http()
    payload = {
        "workerId": WORKER_ID,
        "hostname": socket.gethostname(),
        "capabilities": {
            "models": [WHISPER_MODEL],
            "type": "transcription",
            "device": WHISPER_DEVICE,
        },
    }
    try:
        resp = http.post("/worker/heartbeat", json=payload, headers=auth_headers())
        if resp.status_code >= 400:
            log.debug("Heartbeat not accepted (%s): %s", resp.status_code, resp.text)
    except Exception as err:
        log.debug("Heartbeat failed: %s", err)


# --------------------------------------------------------------------------- #
#  Task processing
# --------------------------------------------------------------------------- #

def process_task(raw_message: str) -> None:
    try:
        parsed = parse_celery_message(raw_message)
    except Exception as err:
        log.error("Failed to parse Celery message: %s", err)
        return

    params = extract_task_params(parsed)
    recording_id = params["recording_id"]
    session_id = params["session_id"]
    storage_key = params["storage_key"]
    task_id = parsed.get("task_id", "?")

    if not recording_id or not session_id:
        log.error("Task %s missing recordingId/sessionId: %s", task_id, params)
        return

    log.info(
        "Task %s: recording=%s session=%s storageKey=%s org=%s",
        task_id, recording_id, session_id, storage_key or "(none)", params["organization_id"],
    )

    # If no storage key was provided, derive it from the recording id pattern.
    if not storage_key:
        storage_key = f"recordings/{recording_id}.wav"

    # Mark recording as PROCESSING
    update_recording_status(recording_id, "PROCESSING")

    audio_bytes = b""
    tmp_path = ""
    try:
        audio_bytes = download_audio(storage_key)

        # Write to a temp file (faster-whisper needs a file path or numpy array)
        suffix = os.path.splitext(storage_key)[1] or ".wav"
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
            tmp.write(audio_bytes)
            tmp_path = tmp.name

        result = transcribe_audio(tmp_path)
        submit_transcript(session_id, recording_id, result)
        # Transcript submission handles MinIO deletion on the API side, but
        # also delete locally as a safety net.
        delete_audio(storage_key)
        update_recording_status(recording_id, "COMPLETED")
        log.info("Task %s completed successfully.", task_id)

    except Exception as err:
        log.exception("Task %s failed: %s", task_id, err)
        update_recording_status(recording_id, "FAILED", str(err))
    finally:
        if tmp_path and os.path.exists(tmp_path):
            try:
                os.unlink(tmp_path)
            except OSError:
                pass


# --------------------------------------------------------------------------- #
#  Heartbeat loop
# --------------------------------------------------------------------------- #

def heartbeat_loop() -> None:
    while _running:
        try:
            send_heartbeat()
        except Exception as err:
            log.debug("Heartbeat error: %s", err)
        # Sleep in small increments so we can exit promptly
        for _ in range(HEARTBEAT_INTERVAL):
            if not _running:
                return
            time.sleep(1)


# --------------------------------------------------------------------------- #
#  Main loop
# --------------------------------------------------------------------------- #

def main() -> int:
    log.info(
        "Avesia local worker starting — workerId=%s redis=%s queue=%s api=%s",
        WORKER_ID, REDIS_URL, TRANSCRIPTION_QUEUE, API_BASE_URL,
    )
    log.info(
        "Whisper config — model=%s device=%s language=%s",
        WHISPER_MODEL, WHISPER_DEVICE, WHISPER_LANGUAGE,
    )

    # Verify Redis connectivity
    try:
        get_redis().ping()
        log.info("Redis connection OK.")
    except Exception as err:
        log.error("Cannot connect to Redis (%s): %s", REDIS_URL, err)
        return 1

    # Start heartbeat thread
    hb_thread = threading.Thread(target=heartbeat_loop, daemon=True, name="heartbeat")
    hb_thread.start()

    # Pre-load the whisper model so the first task is fast.
    try:
        get_whisper()
    except Exception as err:
        log.warning("Could not pre-load Whisper model (will retry on first task): %s", err)

    log.info("Waiting for transcription tasks on queue '%s'… (Ctrl+C to stop)", TRANSCRIPTION_QUEUE)

    r = get_redis()
    while _running:
        try:
            # BLPOP blocks until a message is available (timeout so we can
            # check the _running flag periodically).
            result = r.blpop(TRANSCRIPTION_QUEUE, timeout=5)
        except Exception as err:
            log.error("Redis BLPOP error: %s — retrying in 5s", err)
            time.sleep(5)
            continue

        if result is None:
            # Timeout, no message — loop and check _running
            continue

        # result is a tuple (queue_name, message)
        _queue, raw_message = result
        process_task(raw_message)

    log.info("Worker stopped.")
    # Cleanup
    try:
        if _http:
            _http.close()
    except Exception:
        pass
    return 0


if __name__ == "__main__":
    sys.exit(main())
