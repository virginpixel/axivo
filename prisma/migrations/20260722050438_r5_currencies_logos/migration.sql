-- AlterTable
ALTER TABLE "forms" ADD COLUMN     "logo_center_path" TEXT,
ADD COLUMN     "logo_left_path" TEXT,
ADD COLUMN     "logo_right_path" TEXT;

-- AlterTable
ALTER TABLE "vendors" ADD COLUMN     "logo_path" TEXT;

-- CreateTable
CREATE TABLE "currencies" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "rate_to_base" DECIMAL(18,6) NOT NULL DEFAULT 1,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "currencies_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "currencies_code_key" ON "currencies"("code");

-- CreateIndex
CREATE INDEX "currencies_is_active_idx" ON "currencies"("is_active");

-- Seed common currencies (USD is the default base at rate 1).
INSERT INTO "currencies" ("id", "code", "name", "rate_to_base", "updated_at")
VALUES
  (gen_random_uuid(), 'USD', 'US Dollar', 1, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'EUR', 'Euro', 1.08, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'GBP', 'British Pound', 1.27, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'PKR', 'Pakistani Rupee', 0.0036, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'AED', 'UAE Dirham', 0.27, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'INR', 'Indian Rupee', 0.012, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'SAR', 'Saudi Riyal', 0.27, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;

-- Fold any currency codes already stored on contracts into the list (rate 1 by default; adjust in Settings).
INSERT INTO "currencies" ("id", "code", "name", "rate_to_base", "updated_at")
SELECT gen_random_uuid(), c."currency", c."currency", 1, CURRENT_TIMESTAMP
FROM (SELECT DISTINCT "currency" FROM "contracts" WHERE "currency" IS NOT NULL AND "currency" <> '') c
ON CONFLICT ("code") DO NOTHING;
