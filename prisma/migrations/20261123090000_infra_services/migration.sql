-- CreateTable
CREATE TABLE "infra_services" (
    "id" UUID NOT NULL,
    "device_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "ports" TEXT,
    "url" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" UUID,

    CONSTRAINT "infra_services_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "infra_services_device_id_name_key" ON "infra_services"("device_id", "name");

-- AddForeignKey
ALTER TABLE "infra_services" ADD CONSTRAINT "infra_services_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "infra_devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
