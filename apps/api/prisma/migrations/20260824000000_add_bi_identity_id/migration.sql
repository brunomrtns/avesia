-- AlterTable
ALTER TABLE "users" ALTER COLUMN "password_hash" DROP NOT NULL;

-- Add BI Identity ID column
ALTER TABLE "users" ADD COLUMN "bi_identity_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "users_bi_identity_id_key" ON "users"("bi_identity_id");
