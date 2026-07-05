-- Add expiresAt to transcripts and ai_analyses for data retention.
-- Transcripts and AI analyses expire after 90 days by default.
-- Audio is already deleted immediately after transcription (storageKey nulled).

ALTER TABLE "transcripts" ADD COLUMN "expires_at" TIMESTAMP;
ALTER TABLE "ai_analyses" ADD COLUMN "expires_at" TIMESTAMP;

-- Backfill: set expiresAt = createdAt + 90 days for existing records
UPDATE "transcripts" SET "expires_at" = "created_at" + INTERVAL '90 days' WHERE "expires_at" IS NULL;
UPDATE "ai_analyses" SET "expires_at" = "created_at" + INTERVAL '90 days' WHERE "expires_at" IS NULL;
