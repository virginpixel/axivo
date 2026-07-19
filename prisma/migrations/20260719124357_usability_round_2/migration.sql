-- CreateEnum
CREATE TYPE "CatalogKind" AS ENUM ('MANUFACTURER', 'ASSET_MODEL', 'SUPPLIER', 'VENDOR', 'CONTRACT_CATEGORY');

-- DropForeignKey
ALTER TABLE "licenses" DROP CONSTRAINT "licenses_application_id_fkey";

-- AlterTable
ALTER TABLE "assets" ADD COLUMN     "name" TEXT NOT NULL DEFAULT '',
ALTER COLUMN "asset_tag" DROP NOT NULL;

-- AlterTable
ALTER TABLE "contracts" ALTER COLUMN "contract_number" DROP NOT NULL;

-- AlterTable
ALTER TABLE "forms" ADD COLUMN     "allowed_asset_category_ids" JSONB;

-- AlterTable
ALTER TABLE "licenses" ALTER COLUMN "application_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "notifications" ADD COLUMN     "archived_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "requests" ADD COLUMN     "requested_for_department" TEXT,
ADD COLUMN     "requested_for_employee_id" TEXT,
ADD COLUMN     "requested_for_position" TEXT,
ADD COLUMN     "requester_department" TEXT,
ADD COLUMN     "requester_employee_id" TEXT,
ADD COLUMN     "requester_position" TEXT;

-- CreateTable
CREATE TABLE "catalog_items" (
    "id" UUID NOT NULL,
    "kind" "CatalogKind" NOT NULL,
    "name" TEXT NOT NULL,
    "parent_id" UUID,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "catalog_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "catalog_items_kind_is_active_idx" ON "catalog_items"("kind", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "catalog_items_kind_name_parent_id_key" ON "catalog_items"("kind", "name", "parent_id");

-- AddForeignKey
ALTER TABLE "licenses" ADD CONSTRAINT "licenses_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "catalog_items" ADD CONSTRAINT "catalog_items_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "catalog_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
