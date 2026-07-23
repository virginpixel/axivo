-- AlterTable
ALTER TABLE "request_items" ADD COLUMN     "field_labels_snapshot" JSONB,
ADD COLUMN     "form_name_snapshot" TEXT,
ADD COLUMN     "role_name_snapshot" TEXT,
ADD COLUMN     "target_name_snapshot" TEXT;
