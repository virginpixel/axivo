-- Assets recorded the vendor's name, chosen from the same vendor list that
-- contracts and licence purchases now reference. Renaming a vendor relied on
-- copying the new name into every asset afterwards: a hand-written catch-up,
-- matching on the exact old string, that a reference makes unnecessary.

ALTER TABLE "assets" ADD COLUMN "vendor_id" UUID;

-- Any supplier name no longer in the catalogue becomes a vendor, so nothing is
-- lost on the way across.
INSERT INTO "vendors" ("id", "name", "created_at", "updated_at")
SELECT gen_random_uuid(), x."name", now(), now()
FROM (
  SELECT DISTINCT ON (lower(trim(a."supplier"))) trim(a."supplier") AS "name"
  FROM "assets" a
  WHERE a."deleted_at" IS NULL AND a."supplier" IS NOT NULL AND trim(a."supplier") <> ''
  ORDER BY lower(trim(a."supplier")), trim(a."supplier")
) x
WHERE NOT EXISTS (
  SELECT 1 FROM "vendors" v WHERE lower(v."name") = lower(x."name") AND v."deleted_at" IS NULL
);

UPDATE "assets" a
SET "vendor_id" = v."id"
FROM "vendors" v
WHERE a."supplier" IS NOT NULL
  AND lower(v."name") = lower(trim(a."supplier"))
  AND v."deleted_at" IS NULL;

ALTER TABLE "assets"
  ADD CONSTRAINT "assets_vendor_id_fkey" FOREIGN KEY ("vendor_id")
  REFERENCES "vendors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "assets_vendor_id_idx" ON "assets"("vendor_id");

ALTER TABLE "assets" DROP COLUMN "supplier";
