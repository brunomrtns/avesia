-- AlterTable
ALTER TABLE "ai_analyses" ALTER COLUMN "expires_at" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "transcripts" ALTER COLUMN "expires_at" SET DATA TYPE TIMESTAMP(3);
