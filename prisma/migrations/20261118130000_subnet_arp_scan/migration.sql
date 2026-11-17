-- AlterTable
ALTER TABLE "subnets" ADD COLUMN     "arp_checked_at" TIMESTAMP(3),
ADD COLUMN     "arp_device_id" UUID,
ADD COLUMN     "arp_message" TEXT,
ADD COLUMN     "arp_scan" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "arp_status" TEXT;

-- AlterTable
ALTER TABLE "infra_devices" ADD COLUMN     "routed_networks" JSONB;

-- AddForeignKey
ALTER TABLE "subnets" ADD CONSTRAINT "subnets_arp_device_id_fkey" FOREIGN KEY ("arp_device_id") REFERENCES "infra_devices"("id") ON DELETE SET NULL ON UPDATE CASCADE;
