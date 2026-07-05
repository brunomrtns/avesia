-- AlterTable: make storageKey nullable so it can be nulled after audio deletion
ALTER TABLE "session_recordings" ALTER COLUMN "storage_key" DROP NOT NULL;
