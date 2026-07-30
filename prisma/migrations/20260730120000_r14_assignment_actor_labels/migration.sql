-- Record, as a readable name, who assigned an asset / licence / application and
-- who implemented a request item, so it can be shown in the portal and on the
-- generated evidence form. The actor's user id was already stored; these
-- columns hold the display name captured at the time of the action.
ALTER TABLE "application_assignments" ADD COLUMN "assigned_by_label" TEXT;
ALTER TABLE "license_assignments" ADD COLUMN "assigned_by_label" TEXT;
ALTER TABLE "asset_assignments" ADD COLUMN "assigned_by_label" TEXT;
ALTER TABLE "request_items" ADD COLUMN "implemented_by_label" TEXT;

-- Backfill existing rows from the acting system user's person name, so history
-- shows who acted rather than a blank.
UPDATE "asset_assignments" a
SET "assigned_by_label" = trim(p.first_name || ' ' || p.last_name)
FROM "system_users" su JOIN "people" p ON p.id = su.person_id
WHERE a.assigned_by = su.id AND a.assigned_by_label IS NULL;

UPDATE "license_assignments" a
SET "assigned_by_label" = trim(p.first_name || ' ' || p.last_name)
FROM "system_users" su JOIN "people" p ON p.id = su.person_id
WHERE a.assigned_by = su.id AND a.assigned_by_label IS NULL;

UPDATE "application_assignments" a
SET "assigned_by_label" = trim(p.first_name || ' ' || p.last_name)
FROM "system_users" su JOIN "people" p ON p.id = su.person_id
WHERE a.created_by = su.id AND a.assigned_by_label IS NULL;

UPDATE "request_items" ri
SET "implemented_by_label" = trim(p.first_name || ' ' || p.last_name)
FROM "system_users" su JOIN "people" p ON p.id = su.person_id
WHERE ri.implemented_by = su.id AND ri.implemented_by_label IS NULL;
