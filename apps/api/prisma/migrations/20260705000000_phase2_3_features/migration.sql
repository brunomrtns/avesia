-- CreateTable: PatientMemory (F3 — memória longitudinal)
CREATE TABLE "patient_memories" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "patient_id" TEXT NOT NULL,
    "summary" TEXT NOT NULL DEFAULT '',
    "key_themes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "session_count" INTEGER NOT NULL DEFAULT 0,
    "last_session_id" TEXT,
    "last_updated_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "patient_memories_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "patient_memories_patient_id_key" ON "patient_memories"("patient_id");
CREATE INDEX "patient_memories_organization_id_idx" ON "patient_memories"("organization_id");

-- AddForeignKey
ALTER TABLE "patient_memories" ADD CONSTRAINT "patient_memories_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "patient_memories" ADD CONSTRAINT "patient_memories_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: ApiKey (F3 — API pública)
CREATE TABLE "api_keys" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "key_hash" TEXT NOT NULL,
    "key_prefix" TEXT NOT NULL DEFAULT '',
    "last_used_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "api_keys_key_hash_key" ON "api_keys"("key_hash");
CREATE INDEX "api_keys_organization_id_idx" ON "api_keys"("organization_id");

ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: ClinicalAlert (F3 — alertas de risco)
CREATE TABLE "clinical_alerts" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "patient_id" TEXT NOT NULL,
    "session_id" TEXT,
    "type" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'MEDIUM',
    "description" TEXT NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "acknowledged" BOOLEAN NOT NULL DEFAULT false,
    "acknowledged_by_id" TEXT,
    "acknowledged_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clinical_alerts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "clinical_alerts_organization_id_idx" ON "clinical_alerts"("organization_id");
CREATE INDEX "clinical_alerts_patient_id_idx" ON "clinical_alerts"("patient_id");
CREATE INDEX "clinical_alerts_organization_id_acknowledged_idx" ON "clinical_alerts"("organization_id", "acknowledged");

ALTER TABLE "clinical_alerts" ADD CONSTRAINT "clinical_alerts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "clinical_alerts" ADD CONSTRAINT "clinical_alerts_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "clinical_alerts" ADD CONSTRAINT "clinical_alerts_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "clinical_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "clinical_alerts" ADD CONSTRAINT "clinical_alerts_acknowledged_by_id_fkey" FOREIGN KEY ("acknowledged_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
