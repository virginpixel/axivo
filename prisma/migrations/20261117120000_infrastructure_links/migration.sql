-- CreateEnum
CREATE TYPE "InfraLinkSource" AS ENUM ('MANUAL', 'DISCOVERY');

-- CreateTable
CREATE TABLE "infra_links" (
    "id" UUID NOT NULL,
    "device_a_id" UUID NOT NULL,
    "port_a" TEXT,
    "device_b_id" UUID NOT NULL,
    "port_b" TEXT,
    "source" "InfraLinkSource" NOT NULL DEFAULT 'MANUAL',
    "last_seen_at" TIMESTAMP(3),
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" UUID,

    CONSTRAINT "infra_links_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "infra_links_device_a_id_idx" ON "infra_links"("device_a_id");

-- CreateIndex
CREATE INDEX "infra_links_device_b_id_idx" ON "infra_links"("device_b_id");

-- AddForeignKey
ALTER TABLE "infra_links" ADD CONSTRAINT "infra_links_device_a_id_fkey" FOREIGN KEY ("device_a_id") REFERENCES "infra_devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "infra_links" ADD CONSTRAINT "infra_links_device_b_id_fkey" FOREIGN KEY ("device_b_id") REFERENCES "infra_devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
