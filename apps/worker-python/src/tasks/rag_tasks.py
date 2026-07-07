"""RAG indexing task — runs the full document pipeline."""

from celery import shared_task

from ..config import get_settings
from ..database import get_session
from ..logger import get_logger
from ..pipeline.document_pipeline import DocumentPipeline, PipelineInput
from ..storage import download_file

_log = get_logger("rag-task")


@shared_task(name="rag-indexing", bind=True, queue="rag-indexing")
def rag_index_task(self, *, knowledge_document_id: str, organization_id: str, storage_key: str, file_type: str, file_name: str):
    """Process a knowledge base document through the full pipeline."""
    _log.info("rag-indexing started", document_id=knowledge_document_id, file_name=file_name)

    settings = get_settings()

    # Import here to avoid circular imports
    from ..ai_provider import AIProviderClient

    session = get_session()
    ai_client = AIProviderClient()

    try:
        pipeline = DocumentPipeline(
            session=session,
            ai_client=ai_client,
            fetch_file=download_file,
            max_extraction_chunks=settings.kb_max_extraction_chunks,
            entity_mode=settings.kb_entity_mode,
            summary_mode=settings.kb_summary_mode,
            classify_mode=settings.kb_classify_mode,
            max_entities=settings.kb_max_entities,
            max_relations=settings.kb_max_relations,
            min_entity_frequency=settings.kb_min_entity_frequency,
        )

        pipeline.run(PipelineInput(
            knowledge_document_id=knowledge_document_id,
            organization_id=organization_id,
            storage_key=storage_key,
            file_type=file_type,
            file_name=file_name,
        ))

        _log.info("rag-indexing completed", document_id=knowledge_document_id, file_name=file_name)
        return {"status": "completed", "document_id": knowledge_document_id}

    except Exception as err:
        _log.error("rag-indexing failed", document_id=knowledge_document_id, error=str(err))
        raise
    finally:
        session.close()
        ai_client.close()
