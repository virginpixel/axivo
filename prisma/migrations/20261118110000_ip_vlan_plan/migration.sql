-- CreateEnum
CREATE TYPE "IpPlanStatus" AS ENUM ('ACTIVE', 'RESERVED', 'UNUSED');

-- CreateEnum
CREATE TYPE "IpAddressStatus" AS ENUM ('USED', 'RESERVED');

-- CreateEnum
CREATE TYPE "IpRecordSource" AS ENUM ('MANUAL', 'DISCOVERY');

-- CreateTable
CREATE TABLE "vlans" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "number" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "purpose" TEXT,
    "status" "IpPlanStatus" NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" UUID,

    CONSTRAINT "vlans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subnets" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "vlan_id" UUID,
    "network" TEXT NOT NULL,
    "prefix" INTEGER NOT NULL,
    "range_start" BIGINT NOT NULL,
    "range_end" BIGINT NOT NULL,
    "gateway" TEXT,
    "dhcp_relay" TEXT,
    "location_id" UUID,
    "purpose" TEXT,
    "status" "IpPlanStatus" NOT NULL DEFAULT 'ACTIVE',
    "source" "IpRecordSource" NOT NULL DEFAULT 'MANUAL',
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" UUID,

    CONSTRAINT "subnets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ip_addresses" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "address" TEXT NOT NULL,
    "address_num" BIGINT NOT NULL,
    "status" "IpAddressStatus" NOT NULL DEFAULT 'USED',
    "hostname" TEXT,
    "mac_address" TEXT,
    "mac_vendor" TEXT,
    "device_id" UUID,
    "switch_name" TEXT,
    "switch_port" TEXT,
    "description" TEXT,
    "source" "IpRecordSource" NOT NULL DEFAULT 'MANUAL',
    "last_seen_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" UUID,

    CONSTRAINT "ip_addresses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "vlans_company_id_number_key" ON "vlans"("company_id", "number");

-- CreateIndex
CREATE INDEX "subnets_company_id_range_start_range_end_idx" ON "subnets"("company_id", "range_start", "range_end");

-- CreateIndex
CREATE INDEX "subnets_vlan_id_idx" ON "subnets"("vlan_id");

-- CreateIndex
CREATE UNIQUE INDEX "subnets_company_id_network_prefix_key" ON "subnets"("company_id", "network", "prefix");

-- CreateIndex
CREATE INDEX "ip_addresses_company_id_address_num_idx" ON "ip_addresses"("company_id", "address_num");

-- CreateIndex
CREATE INDEX "ip_addresses_device_id_idx" ON "ip_addresses"("device_id");

-- CreateIndex
CREATE UNIQUE INDEX "ip_addresses_company_id_address_key" ON "ip_addresses"("company_id", "address");

-- AddForeignKey
ALTER TABLE "vlans" ADD CONSTRAINT "vlans_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subnets" ADD CONSTRAINT "subnets_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subnets" ADD CONSTRAINT "subnets_vlan_id_fkey" FOREIGN KEY ("vlan_id") REFERENCES "vlans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subnets" ADD CONSTRAINT "subnets_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ip_addresses" ADD CONSTRAINT "ip_addresses_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ip_addresses" ADD CONSTRAINT "ip_addresses_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "infra_devices"("id") ON DELETE SET NULL ON UPDATE CASCADE;
