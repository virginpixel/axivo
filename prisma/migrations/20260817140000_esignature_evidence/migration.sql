-- Electronic-signature evidence for the acknowledgement/approval/submission
-- flows: where and how each was signed, plus a hash of the exact content that
-- was signed so any later change to it is detectable. All columns nullable so
-- existing rows are unaffected.

ALTER TABLE "handovers"
  ADD COLUMN "acknowledged_ip" TEXT,
  ADD COLUMN "acknowledged_user_agent" TEXT,
  ADD COLUMN "acknowledged_terms_version" TEXT,
  ADD COLUMN "acknowledged_hash" TEXT;

ALTER TABLE "approval_actions"
  ADD COLUMN "ip_address" TEXT,
  ADD COLUMN "user_agent" TEXT,
  ADD COLUMN "content_hash" TEXT;

ALTER TABLE "requests"
  ADD COLUMN "source_user_agent" TEXT,
  ADD COLUMN "submission_hash" TEXT;
