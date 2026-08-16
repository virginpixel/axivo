-- AlterTable: allow requests to be soft-deleted (hidden but retained for audit)
ALTER TABLE "requests" ADD COLUMN "deleted_at" TIMESTAMP(3);
ALTER TABLE "requests" ADD COLUMN "deleted_by" UUID;
