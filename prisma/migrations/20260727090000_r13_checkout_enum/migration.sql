-- Separate migration on purpose: Postgres refuses to use an enum value inside
-- the transaction that added it, so the value lands first and everything that
-- references it follows in the next migration.
ALTER TYPE "RequestTypeKind" ADD VALUE IF NOT EXISTS 'ASSET_CHECKOUT' AFTER 'ASSET_HANDOVER';
