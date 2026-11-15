-- Alert recipients for licence expiry and contract renewal reminders.
--
-- Reminders previously went to every IT/System Administrator in the company,
-- with no way to aim one at the people who actually chase a renewal - who are
-- often a shared procurement mailbox rather than an Axivo user at all. Stored
-- as a JSON array of addresses, matching reminder_days alongside it.
ALTER TABLE "licenses" ADD COLUMN "alert_emails" JSONB;
ALTER TABLE "contracts" ADD COLUMN "alert_emails" JSONB;

-- The supplier's own contact for a contract: their account manager. Kept per
-- contract, not on the vendor, because one vendor can run several contracts
-- through different people.
ALTER TABLE "contracts" ADD COLUMN "contact_name" TEXT;
ALTER TABLE "contracts" ADD COLUMN "contact_email" TEXT;
ALTER TABLE "contracts" ADD COLUMN "contact_phone" TEXT;

-- The contract owner existed so that one person received the reminder, which
-- the address list now does properly. Carry each existing owner's address over
-- before the column goes, so nobody silently stops being told.
UPDATE "contracts" c
SET "alert_emails" = to_jsonb(ARRAY[p."email"])
FROM "people" p
WHERE p."id" = c."owner_person_id"
  AND c."owner_person_id" IS NOT NULL
  AND p."email" <> '';

ALTER TABLE "contracts" DROP CONSTRAINT IF EXISTS "contracts_owner_person_id_fkey";
ALTER TABLE "contracts" DROP COLUMN "owner_person_id";

-- Licences marked expired while actually covered. Expiry was a one-way door:
-- once the job retired a licence, a renewal recorded afterwards could not bring
-- it back, so it sat marked Expired beside its own future cover date. The code
-- reverses that now; these are the records already stuck.
UPDATE "licenses" l
SET "status" = 'ACTIVE'
WHERE l."status" = 'EXPIRED'
  AND l."deleted_at" IS NULL
  AND l."license_type" = 'SUBSCRIPTION'
  AND EXISTS (
    SELECT 1 FROM "license_purchases" p
    WHERE p."license_id" = l."id"
      AND p."deleted_at" IS NULL
      AND p."expiry_date" >= date_trunc('day', now())
  );
