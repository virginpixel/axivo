-- Asset categories become global (no company scope). Duplicates that exist per
-- company are merged by name, and every reference is repointed at the survivor.

-- 1. Pick one surviving category per lowercased name (prefer live rows, then oldest).
CREATE TABLE "_category_merge_map" AS
SELECT c."id" AS old_id,
       (
         SELECT s."id"
         FROM "asset_categories" s
         WHERE lower(s."name") = lower(c."name")
         ORDER BY (s."deleted_at" IS NOT NULL), s."created_at", s."id"
         LIMIT 1
       ) AS survivor_id
FROM "asset_categories" c;

DELETE FROM "_category_merge_map" WHERE old_id = survivor_id;

-- 2. Repoint the assets that referenced a merged-away category.
UPDATE "assets" a
SET "category_id" = m.survivor_id
FROM "_category_merge_map" m
WHERE a."category_id" = m.old_id;

-- 3. Repoint request items.
UPDATE "request_items" ri
SET "asset_category_id" = m.survivor_id
FROM "_category_merge_map" m
WHERE ri."asset_category_id" = m.old_id;

-- 4. Remap the category ids embedded in each form's allow-list JSON array.
UPDATE "forms" f
SET "allowed_asset_category_ids" = sub.remapped
FROM (
  SELECT f2."id" AS form_id,
         jsonb_agg(DISTINCT COALESCE(m.survivor_id::text, elem)) AS remapped
  FROM "forms" f2
  CROSS JOIN LATERAL jsonb_array_elements_text(f2."allowed_asset_category_ids") AS elem
  LEFT JOIN "_category_merge_map" m ON m.old_id::text = elem
  WHERE f2."allowed_asset_category_ids" IS NOT NULL
    AND jsonb_typeof(f2."allowed_asset_category_ids") = 'array'
  GROUP BY f2."id"
) sub
WHERE f."id" = sub.form_id;

-- 5. Drop the now-unreferenced duplicates.
DELETE FROM "asset_categories" c USING "_category_merge_map" m WHERE c."id" = m.old_id;

DROP TABLE "_category_merge_map";

-- 6. Drop the company scope and enforce global uniqueness on the name.
ALTER TABLE "asset_categories" DROP CONSTRAINT "asset_categories_company_id_fkey";

DROP INDEX "asset_categories_company_id_is_active_idx";

DROP INDEX "asset_categories_company_id_name_key";

ALTER TABLE "asset_categories" DROP COLUMN "company_id";

CREATE UNIQUE INDEX "asset_categories_name_key" ON "asset_categories"("name");

CREATE INDEX "asset_categories_is_active_idx" ON "asset_categories"("is_active");
