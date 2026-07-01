"""Analysis task — clinical analysis of session transcripts."""

from celery import shared_task

from ..database import get_session
from ..logger import get_logger
from ..models import AIAnalysis, ClinicalSession, Transcript, TranscriptSegment
from ..prompts.templates import get_prompt_for_analysis_type

_log = get_logger("analysis-task")


@shared_task(name="analysis", bind=True, queue="analysis")
def analysis_task(self, *, transcript_id: str, session_id: str, organization_id: str, analysis_type: str):
    """Run clinical analysis on a transcript."""
    _log.info("analysis started", session_id=session_id, analysis_type=analysis_type)

    from ..ai_provider import AIProviderClient

    session = get_session()
    ai_client = AIProviderClient()

    try:
        # Load transcript with segments
        transcript = session.query(Transcript).filter_by(id=transcript_id).first()
        if not transcript:
            raise ValueError(f"Transcript not found: {transcript_id}")

        segments = session.query(TranscriptSegment).filter_by(
            transcript_id=transcript_id
        ).order_by(TranscriptSegment.sequence).all()

        # Build transcript content with speaker labels
        lines = []
        for seg in segments:
            speaker = "Terapeuta" if seg.speaker == "THERAPIST" else "Paciente"
            lines.append(f"[{speaker}]: {seg.text}")
        transcript_content = "\n".join(lines)

        # Get prompt for analysis type
        system_prompt = get_prompt_for_analysis_type(analysis_type)

        # Call AI
        result = ai_client.chat(
            [{"role": "user", "content": f"Transcrição:\n\"\"\"\n{transcript_content}\n\"\"\""}],
            system_prompt=system_prompt,
            max_tokens=2048,
            temperature=0.3,
        )

        # Create AIAnalysis record
        from ..utils import generate_id as cuid

        analysis = AIAnalysis(
            id=cuid(),
            organization_id=organization_id,
            session_id=session_id,
            transcript_id=transcript_id,
            type=analysis_type,
            provider=result.provider,
            model=result.model,
            input={"transcript_id": transcript_id, "analysis_type": analysis_type},
            output={"content": result.content},
            tokens_used={"total": result.tokens_used},
            status="COMPLETED",
            duration_ms=result.latency_ms,
        )
        session.add(analysis)
        session.commit()

        _log.info("analysis completed", session_id=session_id, analysis_type=analysis_type)
        return {"status": "completed", "analysis_id": analysis.id}

    except Exception as err:
        _log.error("analysis failed", session_id=session_id, error=str(err))
        session.rollback()
        raise
    finally:
        session.close()
        ai_client.close()
