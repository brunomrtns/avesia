"""Document pipeline orchestrator.

Runs the full document intelligence pipeline:
  extract → normalize → chunk → embed → extract-entities → build-graph →
  index-vectors → summarize → classify → finalize

Each stage updates document status/progress in the database AND publishes
a real-time event to Redis pub/sub so the API's WebSocket layer can forward
it to connected clients.
"""

import json
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Callable

from sqlalchemy.orm import Session

from ..config import get_settings
from ..logger import get_logger
from ..models import AIContextChunk, AIContextDocument, KnowledgeDocument
from ..redis_client import get_redis
from .chunker import TextChunk, chunk_text
from .classifier import Classifier, ClassificationResult, DocumentCategory
from .community_detector import CommunityDetector
from .embedder import Embedder
from .entity_extractor import EntityExtractor, ExtractionResult
from .graph_builder import GraphBuilder
from .summarizer import Summarizer, SummarizerResult
from .text_extractor import extract_markdown
from .text_normalizer import normalize_text

PIPELINE_STAGES = [
    "extract",
    "normalize",
    "chunk",
    "embed",
    "extract-entities",
    "build-graph",
    "index-vectors",
    "summarize",
    "classify",
    "finalize",
]
STAGE_TOTAL = len(PIPELINE_STAGES)


@dataclass
class PipelineInput:
    knowledge_document_id: str
    organization_id: str
    storage_key: str
    file_type: str
    file_name: str


@dataclass
class PipelineContext:
    input: PipelineInput
    raw_text: str = ""
    normalized_text: str = ""
    chunks: list[TextChunk] = field(default_factory=list)
    chunk_count: int = 0
    entities: list = field(default_factory=list)
    relations: list = field(default_factory=list)
    topics: list[str] = field(default_factory=list)
    summary: str = ""
    category: DocumentCategory | None = None
    keywords: list[str] = field(default_factory=list)
    themes: list[str] = field(default_factory=list)
    knowledge_base_id: str = ""
    context_document_id: str | None = None


class DocumentPipeline:
    """Orchestrates the full document processing pipeline."""

    def __init__(
        self,
        session: Session,
        ai_client,
        *,
        fetch_file: Callable[[str], bytes],
        max_extraction_chunks: int = 10,
        entity_mode: str = "ner",
        summary_mode: str = "textrank",
        classify_mode: str = "tfidf",
        max_entities: int = 60,
        max_relations: int = 30,
        min_entity_frequency: int = 2,
        use_ner: bool = False,
    ):
        self._session = session
        self._ai = ai_client
        self._fetch_file = fetch_file
        self._max_extraction_chunks = max_extraction_chunks
        self._entity_mode = entity_mode
        self._summary_mode = summary_mode
        self._classify_mode = classify_mode
        self._max_entities = max_entities
        self._max_relations = max_relations
        self._min_entity_frequency = min_entity_frequency

        self._embedder = Embedder(ai_client)
        # Pass ai_client to entity extractor for LLM-based typed relations
        self._entity_extractor = EntityExtractor(ai_client=ai_client, use_ner=use_ner)
        self._graph_builder = GraphBuilder()
        self._community_detector = CommunityDetector()
        self._summarizer = Summarizer()
        self._classifier = Classifier()
        self._log = get_logger("pipeline")

    def run(self, pipeline_input: PipelineInput) -> None:
        ctx = PipelineContext(input=pipeline_input)
        settings = get_settings()

        # Load document record
        doc = self._session.query(KnowledgeDocument).filter_by(
            id=pipeline_input.knowledge_document_id
        ).first()
        if not doc:
            raise ValueError(f"KnowledgeDocument not found: {pipeline_input.knowledge_document_id}")

        ctx.knowledge_base_id = doc.knowledge_base_id

        for i, stage in enumerate(PIPELINE_STAGES):
            try:
                self._update_progress(doc, stage, i, "running", ctx)
                self._run_stage(stage, ctx, doc)
                self._update_progress(doc, stage, i, "completed", ctx)
                self._log.info(
                    "stage completed",
                    document_id=pipeline_input.knowledge_document_id,
                    stage=stage,
                )
            except Exception as err:
                self._log.error(
                    "stage failed",
                    document_id=pipeline_input.knowledge_document_id,
                    stage=stage,
                    error=str(err),
                )
                self._update_progress(doc, stage, i, "failed", ctx, str(err))
                doc.status = "FAILED"
                doc.error_message = f"Stage '{stage}' failed: {err}"
                self._session.commit()
                raise

    def _run_stage(self, stage: str, ctx: PipelineContext, doc: KnowledgeDocument) -> None:
        if stage == "extract":
            self._stage_extract(ctx)
        elif stage == "normalize":
            self._stage_normalize(ctx)
        elif stage == "chunk":
            self._stage_chunk(ctx)
        elif stage == "embed":
            self._stage_embed(ctx)
        elif stage == "extract-entities":
            self._stage_extract_entities(ctx)
        elif stage == "build-graph":
            self._stage_build_graph(ctx)
        elif stage == "index-vectors":
            self._stage_index_vectors(ctx, doc)
        elif stage == "summarize":
            self._stage_summarize(ctx)
        elif stage == "classify":
            self._stage_classify(ctx)
        elif stage == "finalize":
            self._stage_finalize(ctx, doc)

    def _stage_extract(self, ctx: PipelineContext) -> None:
        file_bytes = self._fetch_file(ctx.input.storage_key)
        result = extract_markdown(file_bytes, ctx.input.file_type)
        ctx.raw_text = result.markdown

        # Save the Markdown version to MinIO for traceability
        try:
            from ..storage import upload_file
            md_key = f"md/{ctx.input.knowledge_document_id}.md"
            upload_file(md_key, result.markdown.encode("utf-8"), content_type="text/markdown")
            # Store the key on the document for later retrieval
            doc = self._session.query(KnowledgeDocument).filter_by(
                id=ctx.input.knowledge_document_id
            ).first()
            if doc:
                doc.markdown_storage_key = md_key
                self._session.commit()
        except Exception:
            # MinIO upload is best-effort — pipeline can continue
            pass

    def _stage_normalize(self, ctx: PipelineContext) -> None:
        ctx.normalized_text = normalize_text(ctx.raw_text, strip_page_artifacts=True)

    def _stage_chunk(self, ctx: PipelineContext) -> None:
        ctx.chunks = chunk_text(ctx.normalized_text)
        ctx.chunk_count = len(ctx.chunks)

        # Save structured chunks as JSON to MinIO for traceability
        # Each chunk: {index, content, section, heading_path, char_start, char_end}
        try:
            import json as _json
            from ..storage import upload_file

            chunks_json = _json.dumps([
                {
                    "index": i,
                    "content": c.content,
                    "section": c.section,
                    "heading_path": c.heading_path,
                    "char_start": c.char_start,
                    "char_end": c.char_end,
                }
                for i, c in enumerate(ctx.chunks)
            ], ensure_ascii=False, indent=2)

            chunks_key = f"chunks/{ctx.input.knowledge_document_id}.json"
            upload_file(chunks_key, chunks_json.encode("utf-8"), content_type="application/json")

            doc = self._session.query(KnowledgeDocument).filter_by(
                id=ctx.input.knowledge_document_id
            ).first()
            if doc:
                doc.chunks_storage_key = chunks_key
                self._session.commit()
        except Exception:
            # best-effort — pipeline can continue without it
            pass

    def _stage_embed(self, ctx: PipelineContext) -> None:
        self._embedder.embed_chunks(ctx.chunks)

    def _stage_extract_entities(self, ctx: PipelineContext) -> None:
        result = self._entity_extractor.extract(
            ctx.chunks,
            max_entities=self._max_entities,
            max_relations=self._max_relations,
            min_frequency=self._min_entity_frequency,
            entity_mode=self._entity_mode,
        )
        ctx.entities = result.entities
        ctx.relations = result.relations

    def _stage_build_graph(self, ctx: PipelineContext) -> None:
        if not ctx.knowledge_base_id:
            return

        # Derive topics from themes + cleaned heading sections
        topics: set[str] = set()
        for theme in ctx.themes:
            topics.add(theme)
        for chunk in ctx.chunks:
            if chunk.section and len(chunk.section) > 3:
                topics.add(chunk.section)
        ctx.topics = list(topics)[:15]

        # Expire all cached objects to ensure fresh DB state after long
        # processing stages (spaCy NER + LLM can take minutes)
        self._session.expire_all()

        self._graph_builder.build(
            self._session,
            ctx.knowledge_base_id,
            ctx.input.knowledge_document_id,
            ctx.entities,
            ctx.relations,
            ctx.topics,
        )

        # Evolve community structure
        self._community_detector.detect_and_persist(self._session, ctx.knowledge_base_id)

    def _stage_index_vectors(self, ctx: PipelineContext, doc: KnowledgeDocument) -> None:
        # Expire all cached objects — the session may be stale after long
        # processing stages (spaCy NER can take minutes)
        self._session.expire_all()

        # Reload doc from DB to get a fresh object
        doc = self._session.query(KnowledgeDocument).filter_by(
            id=ctx.input.knowledge_document_id
        ).first()
        if not doc:
            raise ValueError(f"KnowledgeDocument not found: {ctx.input.knowledge_document_id}")

        # Create AIContextDocument if not exists
        if not doc.context_document_id:
            from ..utils import generate_id as cuid

            context_doc = AIContextDocument(
                id=cuid(),
                organization_id=ctx.input.organization_id,
                file_name=ctx.input.file_name,
                status="PROCESSING",
                progress=0,
            )
            self._session.add(context_doc)
            self._session.flush()
            doc.context_document_id = context_doc.id
            ctx.context_document_id = context_doc.id
        else:
            ctx.context_document_id = doc.context_document_id

        # Delete old chunks using raw SQL for reliability
        from sqlalchemy import text as sql_text
        self._session.execute(
            sql_text("DELETE FROM ai_context_chunks WHERE document_id = :doc_id"),
            {"doc_id": ctx.context_document_id},
        )
        self._session.flush()

        # Insert new chunks in batches to avoid memory issues
        from ..utils import generate_id as cuid

        batch_size = 50
        for i in range(0, len(ctx.chunks), batch_size):
            batch = ctx.chunks[i:i + batch_size]
            for chunk in batch:
                db_chunk = AIContextChunk(
                    id=cuid(),
                    document_id=ctx.context_document_id,
                    content=chunk.content,
                    embedding=chunk.embedding,
                    section=chunk.section,
                    heading_path=chunk.heading_path,
                    page=chunk.page,
                    char_start=chunk.char_start,
                    char_end=chunk.char_end,
                )
                self._session.add(db_chunk)
            self._session.flush()

        # Update context document status
        context_doc = self._session.query(AIContextDocument).filter_by(
            id=ctx.context_document_id
        ).first()
        if context_doc:
            context_doc.status = "COMPLETED"
            context_doc.progress = 100

        self._session.commit()

    def _stage_summarize(self, ctx: PipelineContext) -> None:
        result = self._summarizer.summarize(ctx.normalized_text)
        ctx.summary = result.summary

    def _stage_classify(self, ctx: PipelineContext) -> None:
        result = self._classifier.classify(ctx.normalized_text)
        ctx.category = result.category
        ctx.keywords = result.keywords
        ctx.themes = result.themes

    def _stage_finalize(self, ctx: PipelineContext, doc: KnowledgeDocument) -> None:
        import json

        # Expire all cached objects to ensure fresh DB state
        self._session.expire_all()

        # Reload doc from DB
        doc = self._session.query(KnowledgeDocument).filter_by(
            id=ctx.input.knowledge_document_id
        ).first()
        if not doc:
            raise ValueError(f"KnowledgeDocument not found: {ctx.input.knowledge_document_id}")

        doc.summary = ctx.summary
        doc.keywords = ctx.keywords
        doc.themes = ctx.themes
        doc.entities = [
            {"name": e.name, "type": e.type, "description": e.description}
            for e in ctx.entities
        ]
        doc.categories = {
            "primary": ctx.category.primary if ctx.category else "Outro",
            "secondary": ctx.category.secondary if ctx.category else [],
            "confidence": ctx.category.confidence if ctx.category else 0,
        }
        doc.chunk_count = ctx.chunk_count
        doc.status = "COMPLETED"
        doc.progress = 100
        doc.error_message = None
        self._session.commit()

    def _update_progress(
        self, doc: KnowledgeDocument, stage: str, stage_index: int, status: str,
        ctx: PipelineContext, message: str = "",
    ) -> None:
        # Expire all cached objects to ensure fresh DB state
        self._session.expire_all()

        # Reload doc from DB to avoid stale object after long stages
        doc = self._session.query(KnowledgeDocument).filter_by(
            id=ctx.input.knowledge_document_id
        ).first()
        if not doc:
            return

        progress = int((stage_index / STAGE_TOTAL) * 100)
        if status == "completed":
            progress = int(((stage_index + 1) / STAGE_TOTAL) * 100)
        elif status == "running":
            doc.status = "PROCESSING"

        doc.progress = progress
        self._session.commit()

        # Publish progress event to Redis pub/sub → WebSocket → UI
        self._publish_progress(doc, ctx, stage, stage_index, status, progress, message)

    def _publish_progress(
        self, doc: KnowledgeDocument, ctx: PipelineContext, stage: str,
        stage_index: int, status: str, progress: int, message: str,
    ) -> None:
        """Publish a progress event to Redis pub/sub for real-time UI updates."""
        try:
            event = {
                "documentId": doc.id,
                "knowledgeBaseId": ctx.knowledge_base_id,
                "organizationId": ctx.input.organization_id,
                "stage": stage,
                "stageIndex": stage_index,
                "stageTotal": STAGE_TOTAL,
                "progress": progress,
                "status": status,
                "message": message,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }
            channel = f"avesia:kb:{ctx.knowledge_base_id}:progress"
            redis = get_redis()
            redis.publish(channel, json.dumps(event))
        except Exception:
            # Redis pub/sub is best-effort — don't fail the pipeline if it's down
            pass
