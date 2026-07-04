-- CreateTable
CREATE TABLE "ai_provider_configs" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "api_key" TEXT,
    "base_url" TEXT,
    "model" TEXT NOT NULL,
    "embedding_model" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "last_status" TEXT NOT NULL DEFAULT 'unknown',
    "last_checked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_provider_configs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ai_provider_configs_organization_id_idx" ON "ai_provider_configs"("organization_id");

-- CreateUniqueIndex
CREATE UNIQUE INDEX "ai_provider_configs_organization_id_provider_key" ON "ai_provider_configs"("organization_id", "provider");

-- AddForeignKey
ALTER TABLE "ai_provider_configs" ADD CONSTRAINT "ai_provider_configs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
