-- Documents can now be deleted from every screen. The delete is soft: the row
-- is hidden but its stored file, version history and the records referencing it
-- (handovers, clearances, disposals, checkouts) are kept, so signed evidence is
-- never destroyed and an accidental delete can be restored.

ALTER TABLE "documents"
  ADD COLUMN "deleted_at" TIMESTAMP(3),
  ADD COLUMN "deleted_by" UUID;

CREATE INDEX IF NOT EXISTS "documents_company_id_deleted_at_idx"
  ON "documents" ("company_id", "deleted_at");
