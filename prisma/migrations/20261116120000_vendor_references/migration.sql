-- Contracts and licence purchases referenced their vendor by NAME. The name was
-- always chosen from the vendor picker, so it matched a real vendor on the day
-- it was entered - but renaming a vendor in Settings left every record holding
-- the old text for ever, showing a stale name and matching nothing. A reference
-- fixes both: the name is read from the vendor, so a rename reaches everywhere.

ALTER TABLE "contracts" ADD COLUMN "vendor_id" UUID;
ALTER TABLE "license_purchases" ADD COLUMN "vendor_id" UUID;

-- Any name that no longer matches a vendor becomes one, so nothing is lost on
-- the way across. DISTINCT ON (lower(name)) because two records may differ only
-- by case and vendor names are unique.
INSERT INTO "vendors" ("id", "name", "created_at", "updated_at")
SELECT gen_random_uuid(), x."name", now(), now()
FROM (
  SELECT DISTINCT ON (lower(y."name")) y."name"
  FROM (
    SELECT trim(c."vendor") AS "name"
    FROM "contracts" c
    WHERE c."deleted_at" IS NULL AND trim(c."vendor") <> ''
    UNION ALL
    SELECT trim(p."supplier")
    FROM "license_purchases" p
    WHERE p."deleted_at" IS NULL AND p."supplier" IS NOT NULL AND trim(p."supplier") <> ''
  ) y
  ORDER BY lower(y."name"), y."name"
) x
WHERE NOT EXISTS (
  SELECT 1 FROM "vendors" v WHERE lower(v."name") = lower(x."name") AND v."deleted_at" IS NULL
);

UPDATE "contracts" c
SET "vendor_id" = v."id"
FROM "vendors" v
WHERE lower(v."name") = lower(trim(c."vendor")) AND v."deleted_at" IS NULL;

UPDATE "license_purchases" p
SET "vendor_id" = v."id"
FROM "vendors" v
WHERE p."supplier" IS NOT NULL
  AND lower(v."name") = lower(trim(p."supplier"))
  AND v."deleted_at" IS NULL;

-- A contract must name a vendor, and the column is about to be NOT NULL. Any
-- row still unmatched held a blank or whitespace-only name, which no longer
-- round-trips; park those on a placeholder rather than fail the migration and
-- leave the installation unable to start.
INSERT INTO "vendors" ("id", "name", "created_at", "updated_at")
SELECT gen_random_uuid(), 'Unknown vendor', now(), now()
WHERE EXISTS (SELECT 1 FROM "contracts" WHERE "vendor_id" IS NULL AND "deleted_at" IS NULL)
  AND NOT EXISTS (SELECT 1 FROM "vendors" WHERE "name" = 'Unknown vendor');

UPDATE "contracts" c
SET "vendor_id" = (SELECT v."id" FROM "vendors" v WHERE v."name" = 'Unknown vendor')
WHERE c."vendor_id" IS NULL;

ALTER TABLE "contracts" ALTER COLUMN "vendor_id" SET NOT NULL;

ALTER TABLE "contracts"
  ADD CONSTRAINT "contracts_vendor_id_fkey" FOREIGN KEY ("vendor_id")
  REFERENCES "vendors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "license_purchases"
  ADD CONSTRAINT "license_purchases_vendor_id_fkey" FOREIGN KEY ("vendor_id")
  REFERENCES "vendors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "contracts_vendor_id_idx" ON "contracts"("vendor_id");
CREATE INDEX "license_purchases_vendor_id_idx" ON "license_purchases"("vendor_id");

ALTER TABLE "contracts" DROP COLUMN "vendor";
ALTER TABLE "license_purchases" DROP COLUMN "supplier";
