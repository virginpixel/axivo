-- Separate migration on purpose: Postgres refuses to use an enum value that was
-- added in the same transaction, so the backfill cannot live alongside the
-- ALTER TYPE.
--
-- Move already-implemented requests off "Implementation Pending". Mirrors the
-- precedence in rollupRequestStatus: anything still awaiting approval,
-- correction or implementation keeps the old status.
UPDATE "requests" AS r
SET "status" = 'PENDING_ACKNOWLEDGEMENT'
WHERE r."status" = 'IMPLEMENTATION_PENDING'
  AND EXISTS (
    SELECT 1 FROM "request_items" i
    WHERE i."request_id" = r."id" AND i."status" = 'IMPLEMENTED'
  )
  AND NOT EXISTS (
    SELECT 1 FROM "request_items" i
    WHERE i."request_id" = r."id"
      AND i."status" IN ('PENDING_APPROVAL', 'CORRECTION_REQUESTED', 'APPROVED', 'IMPLEMENTATION_PENDING')
  );
