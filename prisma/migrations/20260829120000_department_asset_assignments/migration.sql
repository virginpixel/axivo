-- Assets used by a whole team are held by the department itself rather than by
-- whoever happens to use them. An assignment now has exactly one holder: a
-- person or a department.
ALTER TABLE "asset_assignments" ALTER COLUMN "person_id" DROP NOT NULL;
ALTER TABLE "asset_assignments" ADD COLUMN "department_id" UUID;

ALTER TABLE "asset_assignments"
  ADD CONSTRAINT "asset_assignments_department_id_fkey"
  FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Exactly one holder, enforced in the database so no code path can record an
-- assignment that belongs to nobody or to both at once.
ALTER TABLE "asset_assignments"
  ADD CONSTRAINT "asset_assignments_single_holder"
  CHECK (("person_id" IS NOT NULL) <> ("department_id" IS NOT NULL));

CREATE INDEX "asset_assignments_department_id_status_idx"
  ON "asset_assignments"("department_id", "status");
