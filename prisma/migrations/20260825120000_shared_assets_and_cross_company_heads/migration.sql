-- Shared assets: equipment held by several people at once (e.g. a department
-- phone used by every concierge on shift). Each holder acknowledges their own
-- handover, so damage is attributable to the person who held it at the time.
-- Normal assets keep the single-active-assignment rule.

ALTER TABLE "assets" ADD COLUMN "is_shared" BOOLEAN NOT NULL DEFAULT false;

-- Several people may now hold the same asset concurrently, so lookups by asset
-- return a set rather than at most one row.
CREATE INDEX IF NOT EXISTS "asset_assignments_asset_id_status_idx"
  ON "asset_assignments" ("asset_id", "status");
