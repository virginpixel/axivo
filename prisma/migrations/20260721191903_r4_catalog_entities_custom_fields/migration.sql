-- CreateEnum
CREATE TYPE "ClearanceItemKind" AS ENUM ('ASSET', 'APPLICATION', 'LICENSE');

-- CreateEnum
CREATE TYPE "CustomFieldFormat" AS ENUM ('TEXT', 'NUMBER', 'MAC_ADDRESS', 'IP_ADDRESS', 'IMEI', 'PHONE', 'EMAIL', 'URL', 'DATE');

-- DropForeignKey
ALTER TABLE "clearance_items" DROP CONSTRAINT "clearance_items_asset_assignment_id_fkey";

-- DropIndex
DROP INDEX "clearance_items_clearance_id_asset_assignment_id_key";

-- AlterTable
ALTER TABLE "assets" ADD COLUMN     "custom_fields" JSONB,
ADD COLUMN     "image_path" TEXT;

-- AlterTable
ALTER TABLE "clearance_items" ADD COLUMN     "application_assignment_id" UUID,
ADD COLUMN     "kind" "ClearanceItemKind" NOT NULL DEFAULT 'ASSET',
ADD COLUMN     "license_assignment_id" UUID,
ALTER COLUMN "asset_assignment_id" DROP NOT NULL;

-- CreateTable
CREATE TABLE "vendors" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "contact_name" TEXT,
    "contact_phone" TEXT,
    "contact_email" TEXT,
    "notes" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "vendors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "manufacturers" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "manufacturers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_models" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "manufacturer_id" UUID,
    "field_set_id" UUID,
    "image_path" TEXT,
    "notes" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "asset_models_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "custom_fields" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "format" "CustomFieldFormat" NOT NULL DEFAULT 'TEXT',
    "help_text" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "custom_fields_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "field_sets" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "field_sets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "field_set_fields" (
    "id" UUID NOT NULL,
    "field_set_id" UUID NOT NULL,
    "custom_field_id" UUID NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "field_set_fields_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "vendors_name_key" ON "vendors"("name");

-- CreateIndex
CREATE INDEX "vendors_is_active_idx" ON "vendors"("is_active");

-- CreateIndex
CREATE UNIQUE INDEX "manufacturers_name_key" ON "manufacturers"("name");

-- CreateIndex
CREATE INDEX "manufacturers_is_active_idx" ON "manufacturers"("is_active");

-- CreateIndex
CREATE INDEX "asset_models_is_active_idx" ON "asset_models"("is_active");

-- CreateIndex
CREATE UNIQUE INDEX "asset_models_manufacturer_id_name_key" ON "asset_models"("manufacturer_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "custom_fields_name_key" ON "custom_fields"("name");

-- CreateIndex
CREATE INDEX "custom_fields_is_active_idx" ON "custom_fields"("is_active");

-- CreateIndex
CREATE UNIQUE INDEX "field_sets_name_key" ON "field_sets"("name");

-- CreateIndex
CREATE INDEX "field_sets_is_active_idx" ON "field_sets"("is_active");

-- CreateIndex
CREATE INDEX "field_set_fields_field_set_id_idx" ON "field_set_fields"("field_set_id");

-- CreateIndex
CREATE UNIQUE INDEX "field_set_fields_field_set_id_custom_field_id_key" ON "field_set_fields"("field_set_id", "custom_field_id");

-- CreateIndex
CREATE INDEX "clearance_items_clearance_id_idx" ON "clearance_items"("clearance_id");

-- AddForeignKey
ALTER TABLE "clearance_items" ADD CONSTRAINT "clearance_items_asset_assignment_id_fkey" FOREIGN KEY ("asset_assignment_id") REFERENCES "asset_assignments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clearance_items" ADD CONSTRAINT "clearance_items_application_assignment_id_fkey" FOREIGN KEY ("application_assignment_id") REFERENCES "application_assignments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clearance_items" ADD CONSTRAINT "clearance_items_license_assignment_id_fkey" FOREIGN KEY ("license_assignment_id") REFERENCES "license_assignments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_models" ADD CONSTRAINT "asset_models_manufacturer_id_fkey" FOREIGN KEY ("manufacturer_id") REFERENCES "manufacturers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_models" ADD CONSTRAINT "asset_models_field_set_id_fkey" FOREIGN KEY ("field_set_id") REFERENCES "field_sets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_set_fields" ADD CONSTRAINT "field_set_fields_field_set_id_fkey" FOREIGN KEY ("field_set_id") REFERENCES "field_sets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_set_fields" ADD CONSTRAINT "field_set_fields_custom_field_id_fkey" FOREIGN KEY ("custom_field_id") REFERENCES "custom_fields"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- =============================================================================
-- Data migration: promote catalog items into dedicated entities.
-- Manufacturers, asset models and vendors were previously CatalogItem rows.
-- Suppliers are folded into vendors (deduped by name). Assets keep their
-- manufacturer/model/supplier names, so nothing is lost.
-- =============================================================================

-- Manufacturers (kind = MANUFACTURER)
INSERT INTO "manufacturers" ("id", "name", "is_active", "created_at", "updated_at", "deleted_at")
SELECT gen_random_uuid(), ci."name", ci."is_active", ci."created_at", CURRENT_TIMESTAMP, ci."deleted_at"
FROM "catalog_items" ci
WHERE ci."kind" = 'MANUFACTURER'
  AND ci."deleted_at" IS NULL
ON CONFLICT ("name") DO NOTHING;

-- Asset models (kind = ASSET_MODEL); link to manufacturer via the catalog parent name.
INSERT INTO "asset_models" ("id", "name", "manufacturer_id", "is_active", "created_at", "updated_at", "deleted_at")
SELECT gen_random_uuid(), ci."name", m."id", ci."is_active", ci."created_at", CURRENT_TIMESTAMP, ci."deleted_at"
FROM "catalog_items" ci
LEFT JOIN "catalog_items" parent ON parent."id" = ci."parent_id"
LEFT JOIN "manufacturers" m ON m."name" = parent."name"
WHERE ci."kind" = 'ASSET_MODEL'
  AND ci."deleted_at" IS NULL
ON CONFLICT ("manufacturer_id", "name") DO NOTHING;

-- Vendors from both VENDOR and SUPPLIER catalog kinds, deduped by name.
INSERT INTO "vendors" ("id", "name", "is_active", "created_at", "updated_at", "deleted_at")
SELECT gen_random_uuid(), src."name", bool_or(src."is_active"), min(src."created_at"), CURRENT_TIMESTAMP, NULL
FROM "catalog_items" src
WHERE src."kind" IN ('VENDOR', 'SUPPLIER')
  AND src."deleted_at" IS NULL
GROUP BY src."name"
ON CONFLICT ("name") DO NOTHING;

-- Also fold any free-text supplier names already stored on assets into the vendor list.
INSERT INTO "vendors" ("id", "name", "is_active", "created_at", "updated_at", "deleted_at")
SELECT gen_random_uuid(), a."supplier", true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
FROM (SELECT DISTINCT "supplier" FROM "assets" WHERE "supplier" IS NOT NULL AND "supplier" <> '') a
ON CONFLICT ("name") DO NOTHING;

-- And vendor names already stored on contracts.
INSERT INTO "vendors" ("id", "name", "is_active", "created_at", "updated_at", "deleted_at")
SELECT gen_random_uuid(), c."vendor", true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
FROM (SELECT DISTINCT "vendor" FROM "contracts" WHERE "vendor" IS NOT NULL AND "vendor" <> '') c
ON CONFLICT ("name") DO NOTHING;
