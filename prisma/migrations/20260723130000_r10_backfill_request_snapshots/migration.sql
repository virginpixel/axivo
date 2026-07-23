-- Backfill the snapshot columns for requests submitted before they existed, so
-- historic requests keep their names once the application, category or form
-- they reference is deleted.

UPDATE "request_items" ri
SET "form_name_snapshot" = f."name"
FROM "requests" r
JOIN "forms" f ON f."id" = r."form_id"
WHERE ri."request_id" = r."id"
  AND ri."form_name_snapshot" IS NULL;

UPDATE "request_items" ri
SET "target_name_snapshot" = a."name"
FROM "applications" a
WHERE ri."application_id" = a."id"
  AND ri."target_name_snapshot" IS NULL;

UPDATE "request_items" ri
SET "target_name_snapshot" = ac."name"
FROM "asset_categories" ac
WHERE ri."asset_category_id" = ac."id"
  AND ri."target_name_snapshot" IS NULL;

UPDATE "request_items" ri
SET "role_name_snapshot" = ar."name"
FROM "application_roles" ar
WHERE ri."application_role_id" = ar."id"
  AND ri."role_name_snapshot" IS NULL;

-- Field labels for answers already captured in item_data.
UPDATE "request_items" ri
SET "field_labels_snapshot" = sub."labels"
FROM (
  SELECT ri2."id" AS item_id,
         jsonb_object_agg(rf."field_key", rf."label") AS labels
  FROM "request_items" ri2
  JOIN "request_fields" rf
    ON (rf."application_id" IS NOT NULL AND rf."application_id" = ri2."application_id")
    OR (rf."asset_category_id" IS NOT NULL AND rf."asset_category_id" = ri2."asset_category_id")
  WHERE ri2."item_data" IS NOT NULL
    AND ri2."field_labels_snapshot" IS NULL
  GROUP BY ri2."id"
) sub
WHERE ri."id" = sub.item_id;
