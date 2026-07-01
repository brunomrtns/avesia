"""Notes generation task — drafts clinical notes in SOAP format."""

from celery import shared_task

from ..database import get_session
from ..logger import get_logger
from ..models import ClinicalNote, ClinicalSession, Transcript, TranscriptSegment
from ..prompts.templates import PROMPTS

_log = get_logger("notes-task")


@shared_task(name="notes-generation", bind=True, queue="notes-generation")
def notes_task(self, *, session_id: str, organization_id: str, note_type: str = "SOAP"):
    """Generate a clinical note draft for a session."""
    _log.info("notes started", session_id=session_id, note_type=note_type)

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

        # Call AI for SOAP note
        result = ai_client.chat_json(
            [{"role": "user", "content": f"Transcrição:\n\"\"\"\n{transcript_content}\n\"\"\""}],
            system_prompt=PROMPTS["clinical_note_draft"],
            max_tokens=1024,
            temperature=0.2,
        )

        # Create ClinicalNote record
        from ..utils import generate_id as cuid

        note = ClinicalNote(
            id=cuid(),
            organization_id=organization_id,
            session_id=session_id,
            patient_id=clinical_session.patient_id,
            author_id=clinical_session.professional_id,  # Will be updated by API
            version=1,
            content=result,
            status="DRAFT",
        )
        session.add(note)
        session.commit()

        _log.info("notes completed", session_id=session_id, note_id=note.id)
        return {"status": "completed", "note_id": note.id}

    except Exception as err:
        _log.error("notes failed", session_id=session_id, error=str(err))
        session.rollback()
        raise
    finally:
        session.close()
        ai_client.close()
