-- AlterTable
ALTER TABLE "applications" ADD COLUMN     "workflow_id" UUID;

-- AlterTable
ALTER TABLE "asset_categories" ADD COLUMN     "workflow_id" UUID;

-- AlterTable
ALTER TABLE "forms" ADD COLUMN     "allows_mixed_items" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "application_id" UUID,
ADD COLUMN     "asset_category_id" UUID;

-- CreateTable
CREATE TABLE "request_fields" (
    "id" UUID NOT NULL,
    "application_id" UUID,
    "asset_category_id" UUID,
    "field_key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "field_type" "FormFieldType" NOT NULL,
    "placeholder" TEXT,
    "help_text" TEXT,
    "is_required" BOOLEAN NOT NULL DEFAULT false,
    "options" JSONB,
    "validation" JSONB,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "request_fields_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "request_fields_application_id_is_active_idx" ON "request_fields"("application_id", "is_active");

-- CreateIndex
CREATE INDEX "request_fields_asset_category_id_is_active_idx" ON "request_fields"("asset_category_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "request_fields_application_id_field_key_key" ON "request_fields"("application_id", "field_key");

-- CreateIndex
CREATE UNIQUE INDEX "request_fields_asset_category_id_field_key_key" ON "request_fields"("asset_category_id", "field_key");

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_workflow_id_fkey" FOREIGN KEY ("workflow_id") REFERENCES "workflows"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "request_fields" ADD CONSTRAINT "request_fields_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "request_fields" ADD CONSTRAINT "request_fields_asset_category_id_fkey" FOREIGN KEY ("asset_category_id") REFERENCES "asset_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_categories" ADD CONSTRAINT "asset_categories_workflow_id_fkey" FOREIGN KEY ("workflow_id") REFERENCES "workflows"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "forms" ADD CONSTRAINT "forms_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "forms" ADD CONSTRAINT "forms_asset_category_id_fkey" FOREIGN KEY ("asset_category_id") REFERENCES "asset_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;
