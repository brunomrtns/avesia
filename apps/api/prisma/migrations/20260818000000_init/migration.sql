-- Enable pgvector extension (required for embedding columns)
CREATE EXTENSION IF NOT EXISTS vector;

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "organizations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "settings" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "last_login_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "specialties" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "specialties_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "professionals" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "specialty_id" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "document_number" TEXT NOT NULL,
    "avatar_url" TEXT,
    "bio" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "professionals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "patients" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "date_of_birth" TIMESTAMP(3),
    "gender" TEXT,
    "address" JSONB,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "tags" TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "patients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "professional_patients" (
    "organization_id" TEXT NOT NULL,
    "professional_id" TEXT NOT NULL,
    "patient_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "professional_patients_pkey" PRIMARY KEY ("professional_id","patient_id")
);

-- CreateTable
CREATE TABLE "clinical_sessions" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "patient_id" TEXT NOT NULL,
    "professional_id" TEXT NOT NULL,
    "scheduled_at" TIMESTAMP(3) NOT NULL,
    "started_at" TIMESTAMP(3),
    "ended_at" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "type" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "summary" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clinical_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session_recordings" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "storage_key" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "duration_seconds" INTEGER,
    "size_bytes" BIGINT,
    "status" TEXT NOT NULL DEFAULT 'UPLOADED',
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "session_recordings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transcripts" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "recording_id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "language" TEXT NOT NULL DEFAULT 'pt-BR',
    "provider" TEXT,
    "token_count" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "transcripts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transcript_segments" (
    "id" TEXT NOT NULL,
    "transcript_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "start_time" DOUBLE PRECISION NOT NULL,
    "end_time" DOUBLE PRECISION NOT NULL,
    "speaker" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "transcript_segments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clinical_notes" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "patient_id" TEXT NOT NULL,
    "author_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "previous_version_id" TEXT,
    "content" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "finalized_at" TIMESTAMP(3),
    "finalized_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clinical_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_analyses" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "transcript_id" TEXT,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "input" JSONB NOT NULL,
    "output" JSONB NOT NULL,
    "tokens_used" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "error_message" TEXT,
    "duration_ms" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_analyses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session_copilot_settings" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "intensity" TEXT NOT NULL DEFAULT 'medium',
    "max_frequency_ms" INTEGER NOT NULL DEFAULT 30000,
    "autoGenerate" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "session_copilot_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session_copilot_analyses" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "segment_seq_start" INTEGER NOT NULL,
    "segment_seq_end" INTEGER NOT NULL,
    "assistance" JSONB NOT NULL,
    "memory_snapshot" JSONB NOT NULL,
    "concept_ids" TEXT[],
    "community" INTEGER,
    "tokens_used" INTEGER NOT NULL DEFAULT 0,
    "duration_ms" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "session_copilot_analyses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attachments" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "session_id" TEXT,
    "patient_id" TEXT,
    "uploaded_by_id" TEXT NOT NULL,
    "storage_key" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" BIGINT NOT NULL,
    "type" TEXT NOT NULL,
    "category" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consents" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "patient_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "granted" BOOLEAN NOT NULL DEFAULT false,
    "granted_at" TIMESTAMP(3),
    "granted_by_id" TEXT,
    "revoked_at" TIMESTAMP(3),
    "revoked_by_id" TEXT,
    "expires_at" TIMESTAMP(3),
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "consents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "user_id" TEXT,
    "action" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "resource_id" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "ip_address" TEXT NOT NULL,
    "user_agent" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "family" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "revoked_by_reuse" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissions" (
    "id" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "local_workers" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT,
    "worker_id" TEXT NOT NULL,
    "hostname" TEXT NOT NULL,
    "capabilities" JSONB NOT NULL DEFAULT '{}',
    "last_heartbeat_at" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OFFLINE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "local_workers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_context_documents" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_context_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_context_chunks" (
    "id" TEXT NOT NULL,
    "document_id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "embedding" DOUBLE PRECISION[],
    "embedding_vec" vector(768),
    "section" TEXT,
    "heading_path" TEXT[],
    "page" INTEGER,
    "char_start" INTEGER NOT NULL DEFAULT 0,
    "char_end" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_context_chunks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_bases" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "professional_id" TEXT,
    "type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "knowledge_bases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_documents" (
    "id" TEXT NOT NULL,
    "knowledge_base_id" TEXT NOT NULL,
    "context_document_id" TEXT,
    "original_file_name" TEXT NOT NULL,
    "file_type" TEXT NOT NULL,
    "file_size" INTEGER,
    "storage_key" TEXT,
    "markdown_storage_key" TEXT,
    "chunks_storage_key" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "summary" TEXT,
    "keywords" TEXT[],
    "themes" TEXT[],
    "entities" JSONB,
    "categories" JSONB,
    "chunk_count" INTEGER,
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "knowledge_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_topics" (
    "id" TEXT NOT NULL,
    "knowledge_base_id" TEXT NOT NULL,
    "parent_id" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "path" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "knowledge_topics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_concepts" (
    "id" TEXT NOT NULL,
    "knowledge_base_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" TEXT NOT NULL,
    "source_count" INTEGER NOT NULL DEFAULT 0,
    "community" INTEGER,
    "topic_id" TEXT,
    "source_document_id" TEXT,
    "source_chunk_index" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "knowledge_concepts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_relations" (
    "id" TEXT NOT NULL,
    "knowledge_base_id" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "source_id" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "target_id" TEXT NOT NULL,
    "relationType" TEXT NOT NULL,
    "strength" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "source_document_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "knowledge_relations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_document_topics" (
    "document_id" TEXT NOT NULL,
    "topic_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "knowledge_document_topics_pkey" PRIMARY KEY ("document_id","topic_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations"("slug");

-- CreateIndex
CREATE INDEX "users_organization_id_idx" ON "users"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_organization_id_email_key" ON "users"("organization_id", "email");

-- CreateIndex
CREATE UNIQUE INDEX "specialties_slug_key" ON "specialties"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "professionals_user_id_key" ON "professionals"("user_id");

-- CreateIndex
CREATE INDEX "professionals_organization_id_idx" ON "professionals"("organization_id");

-- CreateIndex
CREATE INDEX "patients_organization_id_idx" ON "patients"("organization_id");

-- CreateIndex
CREATE INDEX "patients_organization_id_status_idx" ON "patients"("organization_id", "status");

-- CreateIndex
CREATE INDEX "patients_organization_id_full_name_idx" ON "patients"("organization_id", "full_name");

-- CreateIndex
CREATE UNIQUE INDEX "patients_organization_id_email_key" ON "patients"("organization_id", "email");

-- CreateIndex
CREATE INDEX "professional_patients_organization_id_idx" ON "professional_patients"("organization_id");

-- CreateIndex
CREATE INDEX "professional_patients_patient_id_idx" ON "professional_patients"("patient_id");

-- CreateIndex
CREATE INDEX "clinical_sessions_organization_id_idx" ON "clinical_sessions"("organization_id");

-- CreateIndex
CREATE INDEX "clinical_sessions_organization_id_status_idx" ON "clinical_sessions"("organization_id", "status");

-- CreateIndex
CREATE INDEX "clinical_sessions_organization_id_scheduled_at_idx" ON "clinical_sessions"("organization_id", "scheduled_at");

-- CreateIndex
CREATE INDEX "clinical_sessions_patient_id_idx" ON "clinical_sessions"("patient_id");

-- CreateIndex
CREATE INDEX "clinical_sessions_professional_id_idx" ON "clinical_sessions"("professional_id");

-- CreateIndex
CREATE INDEX "session_recordings_organization_id_idx" ON "session_recordings"("organization_id");

-- CreateIndex
CREATE INDEX "session_recordings_session_id_idx" ON "session_recordings"("session_id");

-- CreateIndex
CREATE INDEX "transcripts_organization_id_idx" ON "transcripts"("organization_id");

-- CreateIndex
CREATE INDEX "transcripts_session_id_idx" ON "transcripts"("session_id");

-- CreateIndex
CREATE INDEX "transcripts_recording_id_idx" ON "transcripts"("recording_id");

-- CreateIndex
CREATE INDEX "transcript_segments_transcript_id_sequence_idx" ON "transcript_segments"("transcript_id", "sequence");

-- CreateIndex
CREATE INDEX "transcript_segments_organization_id_idx" ON "transcript_segments"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "transcript_segments_transcript_id_sequence_key" ON "transcript_segments"("transcript_id", "sequence");

-- CreateIndex
CREATE INDEX "clinical_notes_organization_id_idx" ON "clinical_notes"("organization_id");

-- CreateIndex
CREATE INDEX "clinical_notes_session_id_version_idx" ON "clinical_notes"("session_id", "version");

-- CreateIndex
CREATE INDEX "clinical_notes_patient_id_idx" ON "clinical_notes"("patient_id");

-- CreateIndex
CREATE UNIQUE INDEX "clinical_notes_session_id_version_key" ON "clinical_notes"("session_id", "version");

-- CreateIndex
CREATE INDEX "ai_analyses_organization_id_idx" ON "ai_analyses"("organization_id");

-- CreateIndex
CREATE INDEX "ai_analyses_session_id_idx" ON "ai_analyses"("session_id");

-- CreateIndex
CREATE INDEX "ai_analyses_session_id_type_idx" ON "ai_analyses"("session_id", "type");

-- CreateIndex
CREATE UNIQUE INDEX "session_copilot_settings_session_id_key" ON "session_copilot_settings"("session_id");

-- CreateIndex
CREATE INDEX "session_copilot_analyses_session_id_idx" ON "session_copilot_analyses"("session_id");

-- CreateIndex
CREATE INDEX "session_copilot_analyses_organization_id_idx" ON "session_copilot_analyses"("organization_id");

-- CreateIndex
CREATE INDEX "session_copilot_analyses_session_id_segment_seq_end_idx" ON "session_copilot_analyses"("session_id", "segment_seq_end");

-- CreateIndex
CREATE INDEX "attachments_organization_id_idx" ON "attachments"("organization_id");

-- CreateIndex
CREATE INDEX "attachments_patient_id_idx" ON "attachments"("patient_id");

-- CreateIndex
CREATE INDEX "attachments_session_id_idx" ON "attachments"("session_id");

-- CreateIndex
CREATE INDEX "consents_organization_id_idx" ON "consents"("organization_id");

-- CreateIndex
CREATE INDEX "consents_patient_id_type_idx" ON "consents"("patient_id", "type");

-- CreateIndex
CREATE INDEX "audit_logs_organization_id_created_at_idx" ON "audit_logs"("organization_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_user_id_idx" ON "audit_logs"("user_id");

-- CreateIndex
CREATE INDEX "audit_logs_resource_resource_id_idx" ON "audit_logs"("resource", "resource_id");

-- CreateIndex
CREATE INDEX "refresh_tokens_user_id_idx" ON "refresh_tokens"("user_id");

-- CreateIndex
CREATE INDEX "refresh_tokens_token_hash_idx" ON "refresh_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "refresh_tokens_family_idx" ON "refresh_tokens"("family");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_role_resource_action_key" ON "permissions"("role", "resource", "action");

-- CreateIndex
CREATE UNIQUE INDEX "local_workers_worker_id_key" ON "local_workers"("worker_id");

-- CreateIndex
CREATE INDEX "ai_context_documents_organization_id_idx" ON "ai_context_documents"("organization_id");

-- CreateIndex
CREATE INDEX "ai_context_chunks_document_id_idx" ON "ai_context_chunks"("document_id");

-- CreateIndex
CREATE INDEX "knowledge_bases_organization_id_idx" ON "knowledge_bases"("organization_id");

-- CreateIndex
CREATE INDEX "knowledge_bases_organization_id_type_idx" ON "knowledge_bases"("organization_id", "type");

-- CreateIndex
CREATE UNIQUE INDEX "knowledge_documents_context_document_id_key" ON "knowledge_documents"("context_document_id");

-- CreateIndex
CREATE INDEX "knowledge_documents_knowledge_base_id_idx" ON "knowledge_documents"("knowledge_base_id");

-- CreateIndex
CREATE INDEX "knowledge_documents_knowledge_base_id_status_idx" ON "knowledge_documents"("knowledge_base_id", "status");

-- CreateIndex
CREATE INDEX "knowledge_topics_knowledge_base_id_idx" ON "knowledge_topics"("knowledge_base_id");

-- CreateIndex
CREATE INDEX "knowledge_topics_parent_id_idx" ON "knowledge_topics"("parent_id");

-- CreateIndex
CREATE INDEX "knowledge_concepts_knowledge_base_id_idx" ON "knowledge_concepts"("knowledge_base_id");

-- CreateIndex
CREATE INDEX "knowledge_concepts_knowledge_base_id_type_idx" ON "knowledge_concepts"("knowledge_base_id", "type");

-- CreateIndex
CREATE INDEX "knowledge_concepts_source_document_id_idx" ON "knowledge_concepts"("source_document_id");

-- CreateIndex
CREATE INDEX "knowledge_relations_knowledge_base_id_idx" ON "knowledge_relations"("knowledge_base_id");

-- CreateIndex
CREATE INDEX "knowledge_relations_knowledge_base_id_sourceType_source_id_idx" ON "knowledge_relations"("knowledge_base_id", "sourceType", "source_id");

-- CreateIndex
CREATE INDEX "knowledge_relations_knowledge_base_id_targetType_target_id_idx" ON "knowledge_relations"("knowledge_base_id", "targetType", "target_id");

-- CreateIndex
CREATE INDEX "knowledge_relations_source_document_id_idx" ON "knowledge_relations"("source_document_id");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "professionals" ADD CONSTRAINT "professionals_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "professionals" ADD CONSTRAINT "professionals_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "professionals" ADD CONSTRAINT "professionals_specialty_id_fkey" FOREIGN KEY ("specialty_id") REFERENCES "specialties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patients" ADD CONSTRAINT "patients_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "professional_patients" ADD CONSTRAINT "professional_patients_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "professional_patients" ADD CONSTRAINT "professional_patients_professional_id_fkey" FOREIGN KEY ("professional_id") REFERENCES "professionals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "professional_patients" ADD CONSTRAINT "professional_patients_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical_sessions" ADD CONSTRAINT "clinical_sessions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical_sessions" ADD CONSTRAINT "clinical_sessions_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical_sessions" ADD CONSTRAINT "clinical_sessions_professional_id_fkey" FOREIGN KEY ("professional_id") REFERENCES "professionals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_recordings" ADD CONSTRAINT "session_recordings_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_recordings" ADD CONSTRAINT "session_recordings_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "clinical_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transcripts" ADD CONSTRAINT "transcripts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transcripts" ADD CONSTRAINT "transcripts_recording_id_fkey" FOREIGN KEY ("recording_id") REFERENCES "session_recordings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transcripts" ADD CONSTRAINT "transcripts_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "clinical_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transcript_segments" ADD CONSTRAINT "transcript_segments_transcript_id_fkey" FOREIGN KEY ("transcript_id") REFERENCES "transcripts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transcript_segments" ADD CONSTRAINT "transcript_segments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical_notes" ADD CONSTRAINT "clinical_notes_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical_notes" ADD CONSTRAINT "clinical_notes_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "clinical_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical_notes" ADD CONSTRAINT "clinical_notes_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical_notes" ADD CONSTRAINT "clinical_notes_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical_notes" ADD CONSTRAINT "clinical_notes_finalized_by_id_fkey" FOREIGN KEY ("finalized_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical_notes" ADD CONSTRAINT "clinical_notes_previous_version_id_fkey" FOREIGN KEY ("previous_version_id") REFERENCES "clinical_notes"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_analyses" ADD CONSTRAINT "ai_analyses_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_analyses" ADD CONSTRAINT "ai_analyses_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "clinical_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_analyses" ADD CONSTRAINT "ai_analyses_transcript_id_fkey" FOREIGN KEY ("transcript_id") REFERENCES "transcripts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_copilot_settings" ADD CONSTRAINT "session_copilot_settings_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "clinical_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_copilot_analyses" ADD CONSTRAINT "session_copilot_analyses_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "clinical_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_copilot_analyses" ADD CONSTRAINT "session_copilot_analyses_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "clinical_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consents" ADD CONSTRAINT "consents_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consents" ADD CONSTRAINT "consents_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consents" ADD CONSTRAINT "consents_granted_by_id_fkey" FOREIGN KEY ("granted_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consents" ADD CONSTRAINT "consents_revoked_by_id_fkey" FOREIGN KEY ("revoked_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "local_workers" ADD CONSTRAINT "local_workers_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_context_documents" ADD CONSTRAINT "ai_context_documents_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_context_chunks" ADD CONSTRAINT "ai_context_chunks_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "ai_context_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_bases" ADD CONSTRAINT "knowledge_bases_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_documents" ADD CONSTRAINT "knowledge_documents_knowledge_base_id_fkey" FOREIGN KEY ("knowledge_base_id") REFERENCES "knowledge_bases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_documents" ADD CONSTRAINT "knowledge_documents_context_document_id_fkey" FOREIGN KEY ("context_document_id") REFERENCES "ai_context_documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_topics" ADD CONSTRAINT "knowledge_topics_knowledge_base_id_fkey" FOREIGN KEY ("knowledge_base_id") REFERENCES "knowledge_bases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_topics" ADD CONSTRAINT "knowledge_topics_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "knowledge_topics"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_concepts" ADD CONSTRAINT "knowledge_concepts_knowledge_base_id_fkey" FOREIGN KEY ("knowledge_base_id") REFERENCES "knowledge_bases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_concepts" ADD CONSTRAINT "knowledge_concepts_topic_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "knowledge_topics"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_relations" ADD CONSTRAINT "knowledge_relations_knowledge_base_id_fkey" FOREIGN KEY ("knowledge_base_id") REFERENCES "knowledge_bases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_document_topics" ADD CONSTRAINT "knowledge_document_topics_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "knowledge_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_document_topics" ADD CONSTRAINT "knowledge_document_topics_topic_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "knowledge_topics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

