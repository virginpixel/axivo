-- Third-party access requests. Contractors and tenants belong to no department
-- here, so a Department Head step can never resolve for them. A form may now be
-- opened to third parties and carries its own approval chain for those requests,
-- which routes to an internal role (e.g. Tenant Manager) instead.

ALTER TABLE "forms"
  ADD COLUMN "allows_third_party" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "third_party_workflow_id" UUID;

ALTER TABLE "forms"
  ADD CONSTRAINT "forms_third_party_workflow_id_fkey"
  FOREIGN KEY ("third_party_workflow_id") REFERENCES "workflows"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- The person is created like anyone else so they can hold access, assets and
-- signed handovers. company_id still points at the property they work for
-- (company scoping depends on it); their own employer is text.
ALTER TABLE "people"
  ADD COLUMN "is_third_party" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "external_company_name" TEXT;

ALTER TABLE "requests"
  ADD COLUMN "is_third_party" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "requested_for_external_company" TEXT;

CREATE INDEX IF NOT EXISTS "people_company_id_is_third_party_idx"
  ON "people" ("company_id", "is_third_party");
