-- Add fallback column to ai_provider_configs
ALTER TABLE "ai_provider_configs" ADD COLUMN "is_fallback" BOOLEAN NOT NULL DEFAULT false;
