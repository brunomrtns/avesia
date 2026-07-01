"""Transcription task — placeholder for speech-to-text integration."""

from celery import shared_task

from ..logger import get_logger

_log = get_logger("transcription-task")


@shared_task(name="transcription", bind=True, queue="transcription")
def transcription_task(self, *, recording_id: str, session_id: str, organization_id: str):
    """Transcribe audio recording — placeholder."""
    _log.info("transcription started", recording_id=recording_id, session_id=session_id)

    # TODO: Integrate with speech-to-text provider (Whisper, etc.)
    # For now, just mark as completed with empty transcript

    _log.info("transcription completed (placeholder)", recording_id=recording_id)
    return {"status": "completed", "recording_id": recording_id, "note": "placeholder"}
