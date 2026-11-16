-- Infrastructure register and credential vault (SDS Doc 24, Doc 00 §14).

-- CreateEnum
CREATE TYPE "InfraDeviceKind" AS ENUM ('NETWORK', 'SERVER');

-- CreateEnum
CREATE TYPE "InfraDeviceStatus" AS ENUM ('ACTIVE', 'STANDBY', 'DECOMMISSIONED');

-- CreateTable
CREATE TABLE "infra_device_types" (
    "id" UUID NOT NULL,
    "kind" "InfraDeviceKind" NOT NULL,
    "name" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

CONSTRAINT "infra_device_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "infra_devices" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "kind" "InfraDeviceKind" NOT NULL,
    "type_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "hostname" TEXT,
    "ip_address" TEXT,
    "location_id" UUID,
    "manufacturer_id" UUID,
    "model" TEXT,
    "serial_number" TEXT,
    "operating_system" TEXT,
    "version" TEXT,
    "domain" TEXT,
    "purpose" TEXT,
    "status" "InfraDeviceStatus" NOT NULL DEFAULT 'ACTIVE',
    "host_device_id" UUID,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" UUID,

CONSTRAINT "infra_devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "infra_device_applications" (
    "id" UUID NOT NULL,
    "device_id" UUID NOT NULL,
    "application_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,

CONSTRAINT "infra_device_applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credential_sets" (
    "id" UUID NOT NULL,
    "company_id" UUID,
    "name" TEXT NOT NULL,
    "username" TEXT,
    "secret_ciphertext" TEXT,
    "password_changed_at" TIMESTAMP(3),
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" UUID,

CONSTRAINT "credential_sets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "infra_device_credentials" (
    "id" UUID NOT NULL,
    "device_id" UUID NOT NULL,
    "credential_set_id" UUID NOT NULL,
    "purpose" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,

CONSTRAINT "infra_device_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "infra_device_types_name_key" ON "infra_device_types"("name");

-- CreateIndex
CREATE INDEX "infra_device_types_kind_is_active_idx" ON "infra_device_types"("kind", "is_active");

-- CreateIndex
CREATE INDEX "infra_devices_company_id_kind_status_idx" ON "infra_devices"("company_id", "kind", "status");

-- CreateIndex
CREATE INDEX "infra_devices_ip_address_idx" ON "infra_devices"("ip_address");

-- CreateIndex
CREATE INDEX "infra_devices_serial_number_idx" ON "infra_devices"("serial_number");

-- CreateIndex
CREATE INDEX "infra_devices_host_device_id_idx" ON "infra_devices"("host_device_id");

-- CreateIndex
CREATE INDEX "infra_device_applications_application_id_idx" ON "infra_device_applications"("application_id");

-- CreateIndex
CREATE UNIQUE INDEX "infra_device_applications_device_id_application_id_key" ON "infra_device_applications"("device_id", "application_id");

-- CreateIndex
CREATE INDEX "credential_sets_company_id_idx" ON "credential_sets"("company_id");

-- CreateIndex
CREATE INDEX "infra_device_credentials_credential_set_id_idx" ON "infra_device_credentials"("credential_set_id");

-- CreateIndex
CREATE UNIQUE INDEX "infra_device_credentials_device_id_credential_set_id_key" ON "infra_device_credentials"("device_id", "credential_set_id");

-- AddForeignKey
ALTER TABLE "infra_devices" ADD CONSTRAINT "infra_devices_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "infra_devices" ADD CONSTRAINT "infra_devices_type_id_fkey" FOREIGN KEY ("type_id") REFERENCES "infra_device_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "infra_devices" ADD CONSTRAINT "infra_devices_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "infra_devices" ADD CONSTRAINT "infra_devices_manufacturer_id_fkey" FOREIGN KEY ("manufacturer_id") REFERENCES "manufacturers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "infra_devices" ADD CONSTRAINT "infra_devices_host_device_id_fkey" FOREIGN KEY ("host_device_id") REFERENCES "infra_devices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "infra_device_applications" ADD CONSTRAINT "infra_device_applications_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "infra_devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "infra_device_applications" ADD CONSTRAINT "infra_device_applications_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credential_sets" ADD CONSTRAINT "credential_sets_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "infra_device_credentials" ADD CONSTRAINT "infra_device_credentials_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "infra_devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "infra_device_credentials" ADD CONSTRAINT "infra_device_credentials_credential_set_id_fkey" FOREIGN KEY ("credential_set_id") REFERENCES "credential_sets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
