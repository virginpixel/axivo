-- "Used by" (location_code) replaces the department on a budget line: keep
-- each department as the line's Used by where none was given, then drop it.
UPDATE "budget_lines" SET "location_code" = "department"
WHERE "location_code" IS NULL AND "department" IS NOT NULL;

-- AlterTable
ALTER TABLE "budget_lines" DROP COLUMN "department";
