"""Summary task — generates session summaries."""

from celery import shared_task

from ..database import get_session
from ..logger import get_logger
from ..models import ClinicalSession, Transcript, TranscriptSegment
from ..prompts.templates import PROMPTS

_log = get_logger("summary-task")


@shared_task(name="summarization", bind=True, queue="summarization")
def summary_task(self, *, session_id: str, organization_id: str):
    """Generate a summary for a clinical session."""
    _log.info("summary started", session_id=session_id)

    from ..ai_provider import AIProviderClient

    session = get_session()
    ai_client = AIProviderClient()

    try:
        # Load session
        clinical_session = session.query(ClinicalSession).filter_by(id=session_id).first()
        if not clinical_session:
            raise ValueError(f"Session not found: {session_id}")

        # Load transcript
        transcript = session.query(Transcript).filter_by(
            session_id=session_id, status="COMPLETED"
        ).first()

        if not transcript:
            raise ValueError(f"No completed transcript for session: {session_id}")

        segments = session.query(TranscriptSegment).filter_by(
            transcript_id=transcript.id
        ).order_by(TranscriptSegment.sequence).all()

        lines = []
        for seg in segments:
            speaker = "Terapeuta" if seg.speaker == "THERAPIST" else "Paciente"
            lines.append(f"[{speaker}]: {seg.text}")
        transcript_content = "\n".join(lines)

        # Call AI
        result = ai_client.chat(
            [{"role": "user", "content": f"Transcrição:\n\"\"\"\n{transcript_content}\n\"\"\""}],
            system_prompt=PROMPTS["session_summary"],
            max_tokens=1024,
            temperature=0.3,
        )

        # Update session summary
        clinical_session.summary = result.content
        session.commit()

        _log.info("summary completed", session_id=session_id)
        return {"status": "completed", "session_id": session_id}

    except Exception as err:
        _log.error("summary failed", session_id=session_id, error=str(err))
        session.rollback()
        raise
    finally:
        session.close()
        ai_client.close()
