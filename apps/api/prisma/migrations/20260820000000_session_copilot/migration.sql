-- CreateTable: SessionCopilotSettings
CREATE TABLE "session_copilot_settings" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "intensity" TEXT NOT NULL DEFAULT 'medium',
    "max_frequency_ms" INTEGER NOT NULL DEFAULT 30000,
    "auto_generate" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "session_copilot_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable: SessionCopilotAnalysis
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

-- CreateIndex
CREATE UNIQUE INDEX "session_copilot_settings_session_id_key" ON "session_copilot_settings"("session_id");

-- CreateIndex
CREATE INDEX "session_copilot_analyses_session_id_idx" ON "session_copilot_analyses"("session_id");

-- CreateIndex
CREATE INDEX "session_copilot_analyses_organization_id_idx" ON "session_copilot_analyses"("organization_id");

-- CreateIndex
CREATE INDEX "session_copilot_analyses_session_id_segment_seq_end_idx" ON "session_copilot_analyses"("session_id", "segment_seq_end");

-- AddForeignKey
ALTER TABLE "session_copilot_settings" ADD CONSTRAINT "session_copilot_settings_session_id_fkey"
    FOREIGN KEY ("session_id") REFERENCES "clinical_sessions"("id") ON DELETE CASCADE;

-- AddForeignKey
ALTER TABLE "session_copilot_analyses" ADD CONSTRAINT "session_copilot_analyses_session_id_fkey"
    FOREIGN KEY ("session_id") REFERENCES "clinical_sessions"("id") ON DELETE CASCADE;

-- AddForeignKey
ALTER TABLE "session_copilot_analyses" ADD CONSTRAINT "session_copilot_analyses_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE;
