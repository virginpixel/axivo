-- AlterTable
ALTER TABLE "infra_devices" ADD COLUMN     "asset_id" UUID,
ADD COLUMN     "config_backup" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "config_checked_at" TIMESTAMP(3),
ADD COLUMN     "config_error" TEXT,
ADD COLUMN     "config_status" TEXT;

-- CreateTable
CREATE TABLE "infra_config_backups" (
    "id" UUID NOT NULL,
    "device_id" UUID NOT NULL,
    "taken_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "content_ciphertext" TEXT NOT NULL,
    "content_hash" TEXT NOT NULL,
    "line_count" INTEGER NOT NULL,
    "lines_added" INTEGER NOT NULL DEFAULT 0,
    "lines_removed" INTEGER NOT NULL DEFAULT 0,
    "firmware" TEXT,
    "created_by" UUID,

CONSTRAINT "infra_config_backups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "infra_backup_runs" (
    "id" UUID NOT NULL,
    "trigger" TEXT NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),
    "devices" INTEGER NOT NULL DEFAULT 0,
    "unchanged" INTEGER NOT NULL DEFAULT 0,
    "changed" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,
    "skipped" INTEGER NOT NULL DEFAULT 0,
    "created_by" UUID,

CONSTRAINT "infra_backup_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "infra_config_backups_device_id_taken_at_idx" ON "infra_config_backups"("device_id", "taken_at");

-- CreateIndex
CREATE INDEX "infra_backup_runs_started_at_idx" ON "infra_backup_runs"("started_at");

-- CreateIndex
CREATE UNIQUE INDEX "infra_devices_asset_id_key" ON "infra_devices"("asset_id");

-- AddForeignKey
ALTER TABLE "infra_devices" ADD CONSTRAINT "infra_devices_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "infra_config_backups" ADD CONSTRAINT "infra_config_backups_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "infra_devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
