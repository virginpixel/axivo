-- Assets already linked to a device are installed: In use. Separate from the
-- migration that adds the value, which PostgreSQL will not use in the same
-- transaction.
UPDATE "assets" SET "status" = 'IN_USE'
WHERE "status" = 'AVAILABLE'
  AND "id" IN (SELECT "asset_id" FROM "infra_devices" WHERE "asset_id" IS NOT NULL AND "deleted_at" IS NULL);
