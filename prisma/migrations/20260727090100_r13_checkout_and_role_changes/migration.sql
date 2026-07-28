-- Why an asset left the office, and where a checkout is in its life.
CREATE TYPE "LeaveType" AS ENUM ('ANNUAL', 'BUSINESS', 'SICK', 'OTHER');
CREATE TYPE "AssetCheckoutStatus" AS ENUM ('PENDING_APPROVAL', 'APPROVED', 'RETURNED', 'REJECTED', 'CANCELLED');

-- A form with no company serves every company: the applications and asset
-- categories it offers are resolved from the requested-for employee instead of
-- being fixed when the form is built.
ALTER TABLE "forms" ALTER COLUMN "company_id" DROP NOT NULL;

-- Request-field answers (which outlets somebody holds, and so on) used to live
-- only on the originating request item, which is why a person's page could not
-- show them. They now live on the assignment and are kept current.
ALTER TABLE "application_assignments" ADD COLUMN "field_data" JSONB;

CREATE TABLE "asset_checkouts" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "asset_id" UUID NOT NULL,
    "asset_assignment_id" UUID,
    "request_item_id" UUID,
    "leave_type" "LeaveType" NOT NULL,
    "start_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3) NOT NULL,
    "status" "AssetCheckoutStatus" NOT NULL DEFAULT 'PENDING_APPROVAL',
    "returned_at" TIMESTAMP(3),
    "returned_by" UUID,
    "document_id" UUID,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "asset_checkouts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "asset_checkouts_person_id_status_idx" ON "asset_checkouts"("person_id", "status");
CREATE INDEX "asset_checkouts_asset_id_status_idx" ON "asset_checkouts"("asset_id", "status");
CREATE INDEX "asset_checkouts_status_end_date_idx" ON "asset_checkouts"("status", "end_date");

ALTER TABLE "asset_checkouts" ADD CONSTRAINT "asset_checkouts_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "asset_checkouts" ADD CONSTRAINT "asset_checkouts_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "people"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "asset_checkouts" ADD CONSTRAINT "asset_checkouts_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "asset_checkouts" ADD CONSTRAINT "asset_checkouts_asset_assignment_id_fkey" FOREIGN KEY ("asset_assignment_id") REFERENCES "asset_assignments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "asset_checkouts" ADD CONSTRAINT "asset_checkouts_request_item_id_fkey" FOREIGN KEY ("request_item_id") REFERENCES "request_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "asset_checkouts" ADD CONSTRAINT "asset_checkouts_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Audit evidence for a change to somebody's existing access: what it was, what
-- it became, and the proof filed for it. Append-only by convention (Doc 16).
CREATE TABLE "assignment_changes" (
    "id" UUID NOT NULL,
    "application_assignment_id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "previous_role_id" UUID,
    "new_role_id" UUID,
    "previous_role_name" TEXT,
    "new_role_name" TEXT,
    "previous_field_data" JSONB,
    "new_field_data" JSONB,
    "request_item_id" UUID,
    "proof_document_id" UUID,
    "reason" TEXT,
    "changed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "changed_by" UUID,
    "changed_by_label" TEXT,

    CONSTRAINT "assignment_changes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "assignment_changes_application_assignment_id_changed_at_idx" ON "assignment_changes"("application_assignment_id", "changed_at");
CREATE INDEX "assignment_changes_company_id_changed_at_idx" ON "assignment_changes"("company_id", "changed_at");

ALTER TABLE "assignment_changes" ADD CONSTRAINT "assignment_changes_application_assignment_id_fkey" FOREIGN KEY ("application_assignment_id") REFERENCES "application_assignments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "assignment_changes" ADD CONSTRAINT "assignment_changes_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "assignment_changes" ADD CONSTRAINT "assignment_changes_request_item_id_fkey" FOREIGN KEY ("request_item_id") REFERENCES "request_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "assignment_changes" ADD CONSTRAINT "assignment_changes_proof_document_id_fkey" FOREIGN KEY ("proof_document_id") REFERENCES "documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: assignments created by an approved request already have their
-- answers recorded on the request item, so a person's page shows real values
-- from day one rather than only for access granted after this release.
UPDATE "application_assignments" AS a
SET "field_data" = i."item_data"
FROM "request_items" AS i
WHERE a."request_item_id" = i."id"
  AND i."item_data" IS NOT NULL
  AND a."field_data" IS NULL;
