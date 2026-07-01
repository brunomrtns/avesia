"""SQLAlchemy models — mapped from Prisma schema.

Only tables the worker touches are defined. Column names use snake_case
matching the PostgreSQL @map annotations in the Prisma schema.
"""

from datetime import datetime
from sqlalchemy import (
    BigInteger,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import ARRAY, JSONB
from sqlalchemy.orm import DeclarativeBase, relationship


class Base(DeclarativeBase):
    pass


class Organization(Base):
    __tablename__ = "organizations"

    id = Column(String, primary_key=True)
    name = Column(String, nullable=False)
    slug = Column(String, unique=True, nullable=False)
    status = Column(String, default="ACTIVE")
    settings = Column(JSONB, default=dict)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    deleted_at = Column(DateTime)


class ClinicalSession(Base):
    __tablename__ = "clinical_sessions"

    id = Column(String, primary_key=True)
    organization_id = Column(String, ForeignKey("organizations.id"), nullable=False)
    patient_id = Column(String, nullable=False)
    professional_id = Column(String, nullable=False)
    scheduled_at = Column(DateTime, nullable=False)
    started_at = Column(DateTime)
    ended_at = Column(DateTime)
    status = Column(String, default="SCHEDULED")
    type = Column(String, nullable=False)
    location = Column(String, nullable=False)
    summary = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    transcripts = relationship("Transcript", back_populates="session")
    ai_analyses = relationship("AIAnalysis", back_populates="session")
    notes = relationship("ClinicalNote", back_populates="session")


class SessionRecording(Base):
    __tablename__ = "session_recordings"

    id = Column(String, primary_key=True)
    organization_id = Column(String, nullable=False)
    session_id = Column(String, ForeignKey("clinical_sessions.id"), nullable=False)
    storage_key = Column(String, nullable=False)
    format = Column(String, nullable=False)
    duration_seconds = Column(Integer)
    size_bytes = Column(BigInteger)
    status = Column(String, default="UPLOADED")
    error_message = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    transcripts = relationship("Transcript", back_populates="recording")


class Transcript(Base):
    __tablename__ = "transcripts"

    id = Column(String, primary_key=True)
    organization_id = Column(String, nullable=False)
    recording_id = Column(String, ForeignKey("session_recordings.id"), nullable=False)
    session_id = Column(String, ForeignKey("clinical_sessions.id"), nullable=False)
    status = Column(String, default="PENDING")
    language = Column(String, default="pt-BR")
    provider = Column(String)
    token_count = Column(Integer)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    recording = relationship("SessionRecording", back_populates="transcripts")
    session = relationship("ClinicalSession", back_populates="transcripts")
    segments = relationship("TranscriptSegment", back_populates="transcript", order_by="TranscriptSegment.sequence")
    ai_analyses = relationship("AIAnalysis", back_populates="transcript")


class TranscriptSegment(Base):
    __tablename__ = "transcript_segments"

    id = Column(String, primary_key=True)
    transcript_id = Column(String, ForeignKey("transcripts.id"), nullable=False)
    organization_id = Column(String, nullable=False)
    sequence = Column(Integer, nullable=False)
    start_time = Column(Float, nullable=False)
    end_time = Column(Float, nullable=False)
    speaker = Column(String, nullable=False)
    text = Column(Text, nullable=False)
    confidence = Column(Float)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    transcript = relationship("Transcript", back_populates="segments")


class ClinicalNote(Base):
    __tablename__ = "clinical_notes"

    id = Column(String, primary_key=True)
    organization_id = Column(String, nullable=False)
    session_id = Column(String, ForeignKey("clinical_sessions.id"), nullable=False)
    patient_id = Column(String, nullable=False)
    author_id = Column(String, nullable=False)
    version = Column(Integer, default=1)
    previous_version_id = Column(String)
    content = Column(JSONB, nullable=False)
    status = Column(String, default="DRAFT")
    finalized_at = Column(DateTime)
    finalized_by_id = Column(String)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    session = relationship("ClinicalSession", back_populates="notes")


class AIAnalysis(Base):
    __tablename__ = "ai_analyses"

    id = Column(String, primary_key=True)
    organization_id = Column(String, nullable=False)
    session_id = Column(String, ForeignKey("clinical_sessions.id"), nullable=False)
    transcript_id = Column(String, ForeignKey("transcripts.id"))
    type = Column(String, nullable=False)
    provider = Column(String, nullable=False)
    model = Column(String, nullable=False)
    input = Column(JSONB, nullable=False)
    output = Column(JSONB, nullable=False)
    tokens_used = Column(JSONB, default=dict)
    status = Column(String, default="PENDING")
    error_message = Column(Text)
    duration_ms = Column(Integer)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    session = relationship("ClinicalSession", back_populates="ai_analyses")
    transcript = relationship("Transcript", back_populates="ai_analyses")


class LocalWorker(Base):
    __tablename__ = "local_workers"

    id = Column(String, primary_key=True)
    organization_id = Column(String)
    worker_id = Column(String, unique=True, nullable=False)
    hostname = Column(String, nullable=False)
    capabilities = Column(JSONB, default=dict)
    last_heartbeat_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    status = Column(String, default="OFFLINE")
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class AIContextDocument(Base):
    __tablename__ = "ai_context_documents"

    id = Column(String, primary_key=True)
    organization_id = Column(String, nullable=False)
    file_name = Column(String, nullable=False)
    status = Column(String, default="PENDING")
    progress = Column(Integer, default=0)
    error_message = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    chunks = relationship("AIContextChunk", back_populates="document", cascade="all, delete-orphan")


class AIContextChunk(Base):
    __tablename__ = "ai_context_chunks"

    id = Column(String, primary_key=True)
    document_id = Column(String, ForeignKey("ai_context_documents.id"), nullable=False)
    content = Column(Text, nullable=False)
    embedding = Column(ARRAY(Float), default=list)
    section = Column(String)
    heading_path = Column(ARRAY(String), default=list)
    page = Column(Integer)
    char_start = Column(Integer, default=0)
    char_end = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)

    document = relationship("AIContextDocument", back_populates="chunks")

    __table_args__ = (
        Index("idx_ai_context_chunks_document_id", "document_id"),
    )


class KnowledgeBase(Base):
    __tablename__ = "knowledge_bases"

    id = Column(String, primary_key=True)
    organization_id = Column(String, nullable=False)
    professional_id = Column(String)
    type = Column(String, nullable=False)
    name = Column(String, nullable=False)
    description = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    deleted_at = Column(DateTime)

    documents = relationship("KnowledgeDocument", back_populates="knowledge_base")
    topics = relationship("KnowledgeTopic", back_populates="knowledge_base")
    concepts = relationship("KnowledgeConcept", back_populates="knowledge_base")
    relations = relationship("KnowledgeRelation", back_populates="knowledge_base")


class KnowledgeDocument(Base):
    __tablename__ = "knowledge_documents"

    id = Column(String, primary_key=True)
    knowledge_base_id = Column(String, ForeignKey("knowledge_bases.id"), nullable=False)
    context_document_id = Column(String, ForeignKey("ai_context_documents.id"), unique=True)
    original_file_name = Column(String, nullable=False)
    file_type = Column(String, nullable=False)
    file_size = Column(Integer)
    storage_key = Column(String)
    markdown_storage_key = Column(String)
    chunks_storage_key = Column(String)
    status = Column(String, default="PENDING")
    progress = Column(Integer, default=0)
    summary = Column(Text)
    keywords = Column(ARRAY(String), default=list)
    themes = Column(ARRAY(String), default=list)
    entities = Column(JSONB)
    categories = Column(JSONB)
    chunk_count = Column(Integer)
    error_message = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    knowledge_base = relationship("KnowledgeBase", back_populates="documents")
    context_document = relationship("AIContextDocument")
    document_topics = relationship("KnowledgeDocumentTopic", back_populates="document")

    __table_args__ = (
        Index("idx_knowledge_documents_kb_id", "knowledge_base_id"),
        Index("idx_knowledge_documents_kb_status", "knowledge_base_id", "status"),
    )


class KnowledgeTopic(Base):
    __tablename__ = "knowledge_topics"

    id = Column(String, primary_key=True)
    knowledge_base_id = Column(String, ForeignKey("knowledge_bases.id"), nullable=False)
    parent_id = Column(String, ForeignKey("knowledge_topics.id"))
    name = Column(String, nullable=False)
    description = Column(Text)
    path = Column(String, nullable=False)
    sort_order = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    knowledge_base = relationship("KnowledgeBase", back_populates="topics")
    parent = relationship("KnowledgeTopic", remote_side="KnowledgeTopic.id", back_populates="children")
    children = relationship("KnowledgeTopic", back_populates="parent")
    concepts = relationship("KnowledgeConcept", back_populates="topic")
    documents = relationship("KnowledgeDocumentTopic", back_populates="topic")

    __table_args__ = (
        Index("idx_knowledge_topics_kb_id", "knowledge_base_id"),
        Index("idx_knowledge_topics_parent_id", "parent_id"),
    )


class KnowledgeConcept(Base):
    __tablename__ = "knowledge_concepts"

    id = Column(String, primary_key=True)
    knowledge_base_id = Column(String, ForeignKey("knowledge_bases.id"), nullable=False)
    name = Column(String, nullable=False)
    description = Column(Text)
    type = Column(String, nullable=False)
    source_count = Column(Integer, default=0)
    community = Column(Integer)
    topic_id = Column(String, ForeignKey("knowledge_topics.id"))
    source_document_id = Column(String)
    source_chunk_index = Column(Integer)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    knowledge_base = relationship("KnowledgeBase", back_populates="concepts")
    topic = relationship("KnowledgeTopic", back_populates="concepts")

    __table_args__ = (
        Index("idx_knowledge_concepts_kb_id", "knowledge_base_id"),
        Index("idx_knowledge_concepts_kb_type", "knowledge_base_id", "type"),
        Index("idx_knowledge_concepts_source_doc", "source_document_id"),
    )


class KnowledgeRelation(Base):
    __tablename__ = "knowledge_relations"

    id = Column(String, primary_key=True)
    knowledge_base_id = Column(String, ForeignKey("knowledge_bases.id"), nullable=False)
    # Prisma schema has NO @map for these — they stay camelCase in DB
    sourceType = Column("sourceType", String, nullable=False)
    source_id = Column(String, nullable=False)
    targetType = Column("targetType", String, nullable=False)
    target_id = Column(String, nullable=False)
    relationType = Column("relationType", String, nullable=False)
    strength = Column(Float, default=1.0)
    source_document_id = Column(String)
    created_at = Column(DateTime, default=datetime.utcnow)

    knowledge_base = relationship("KnowledgeBase", back_populates="relations")

    __table_args__ = (
        Index("idx_knowledge_relations_kb_id", "knowledge_base_id"),
        Index("idx_knowledge_relations_kb_source", "knowledge_base_id", "sourceType", "source_id"),
        Index("idx_knowledge_relations_kb_target", "knowledge_base_id", "targetType", "target_id"),
    )


class KnowledgeDocumentTopic(Base):
    __tablename__ = "knowledge_document_topics"

    document_id = Column(String, ForeignKey("knowledge_documents.id"), primary_key=True)
    topic_id = Column(String, ForeignKey("knowledge_topics.id"), primary_key=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    document = relationship("KnowledgeDocument", back_populates="document_topics")
    topic = relationship("KnowledgeTopic", back_populates="documents")
