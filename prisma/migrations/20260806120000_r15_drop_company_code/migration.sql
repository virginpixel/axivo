-- Company "code" removed: it was a unique label not used anywhere functionally
-- (companies are referenced everywhere by id). Dropping the column also drops
-- its unique index.
ALTER TABLE "companies" DROP COLUMN "code";
