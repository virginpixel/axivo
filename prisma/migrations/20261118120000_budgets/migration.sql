-- CreateEnum
CREATE TYPE "BudgetKind" AS ENUM ('OPEX', 'CAPEX');

-- CreateEnum
CREATE TYPE "BudgetStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED');

-- CreateEnum
CREATE TYPE "CapexPriority" AS ENUM ('FIRST', 'MEDIUM', 'WISH_LIST');

-- CreateEnum
CREATE TYPE "CapexType" AS ENUM ('REVENUE_GENERATING', 'COST_SAVING', 'REGULAR_REPLACEMENT', 'NEW_OPERATION', 'OTHER');

-- CreateTable
CREATE TABLE "budgets" (
    "id" UUID NOT NULL,
    "kind" "BudgetKind" NOT NULL,
    "year" INTEGER NOT NULL,
    "status" "BudgetStatus" NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "submitted_at" TIMESTAMP(3),
    "submitted_by" UUID,
    "approved_at" TIMESTAMP(3),
    "approved_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" UUID,

    CONSTRAINT "budgets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "budget_lines" (
    "id" UUID NOT NULL,
    "budget_id" UUID NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "reference" TEXT,
    "department" TEXT,
    "description" TEXT NOT NULL,
    "vendor_id" UUID,
    "category" TEXT,
    "amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "months" JSONB,
    "quantity" INTEGER,
    "unit_price" DECIMAL(14,2),
    "associated_cost" DECIMAL(14,2),
    "priority" "CapexPriority",
    "capex_type" "CapexType",
    "period" TEXT,
    "location_code" TEXT,
    "justification" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" UUID,

    CONSTRAINT "budget_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "budget_allocations" (
    "id" UUID NOT NULL,
    "line_id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "percent" DECIMAL(5,2) NOT NULL,

    CONSTRAINT "budget_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "budgets_kind_year_key" ON "budgets"("kind", "year");

-- CreateIndex
CREATE INDEX "budget_lines_budget_id_sort_order_idx" ON "budget_lines"("budget_id", "sort_order");

-- CreateIndex
CREATE INDEX "budget_lines_vendor_id_idx" ON "budget_lines"("vendor_id");

-- CreateIndex
CREATE INDEX "budget_allocations_company_id_idx" ON "budget_allocations"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "budget_allocations_line_id_company_id_key" ON "budget_allocations"("line_id", "company_id");

-- AddForeignKey
ALTER TABLE "budget_lines" ADD CONSTRAINT "budget_lines_budget_id_fkey" FOREIGN KEY ("budget_id") REFERENCES "budgets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_lines" ADD CONSTRAINT "budget_lines_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_allocations" ADD CONSTRAINT "budget_allocations_line_id_fkey" FOREIGN KEY ("line_id") REFERENCES "budget_lines"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_allocations" ADD CONSTRAINT "budget_allocations_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
