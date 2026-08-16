-- AlterTable: one-level sub-locations (a location may sit under a parent location)
ALTER TABLE "locations" ADD COLUMN "parent_id" UUID;

-- CreateIndex
CREATE INDEX "locations_parent_id_idx" ON "locations"("parent_id");

-- AddForeignKey
ALTER TABLE "locations" ADD CONSTRAINT "locations_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
