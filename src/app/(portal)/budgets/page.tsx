import Link from "next/link";
import { requirePermission } from "@/shared/auth/guard";
import { PageHeader } from "@/shared/ui/page";
import { EmptyState } from "@/shared/ui/table";
import { Badge } from "@/shared/ui/badge";
import { listBudgets } from "@/modules/budgets/service";
import { STATUS_LABELS, usd } from "@/modules/budgets/budget-math";
import { NewBudgetDialog } from "./budget-dialogs";

export const dynamic = "force-dynamic";
export const metadata = { title: "Budgets" };

const STATUS_BADGE = { DRAFT: "default", SUBMITTED: "warning", APPROVED: "success" } as const;

/** Yearly IT budgets: OPEX and CAPEX, each company's share (SDS Doc 25). */
export default async function BudgetsPage() {
  const { user } = await requirePermission("budgets.view");
  const canManage = user.permissions.has("budgets.manage");
  const budgets = await listBudgets();
  const years = [...new Set(budgets.map((b) => b.year))];

  return (
    <div>
      <PageHeader
        title="Budgets"
        description="Each year's IT running costs (OPEX) and purchases (CAPEX), in USD. Shared lines are split between companies, and each company's total counts only its share."
        actions={canManage ? <NewBudgetDialog earlier={budgets.map((b) => ({ id: b.id, kind: b.kind, year: b.year }))} /> : undefined}
      />
      {budgets.length === 0 ? (
        <EmptyState
          title="No budgets yet"
          description={canManage ? "Create next year's OPEX budget, then its CAPEX budget. Lines can be imported from your spreadsheets." : "Nothing has been prepared yet."}
        />
      ) : (
        <div className="space-y-8">
          {years.map((year) => (
            <section key={year}>
              <h2 className="mb-3 font-display text-2xl">{year}</h2>
              <div className="grid gap-4 lg:grid-cols-2">
                {(["OPEX", "CAPEX"] as const).map((kind) => {
                  const budget = budgets.find((b) => b.year === year && b.kind === kind);
                  if (!budget) {
                    return (
                      <div key={kind} className="flex items-center rounded-2xl border border-dashed px-5 py-6 text-sm text-muted-foreground">
                        No {year} {kind} budget yet.
                      </div>
                    );
                  }
                  return (
                    <Link
                      key={kind}
                      href={`/budgets/${budget.id}`}
                      className="group block rounded-2xl border bg-card px-5 py-4 transition-colors hover:border-primary/40"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="label-caps text-muted-foreground group-hover:text-foreground">
                            {kind === "OPEX" ? "OPEX · running costs" : "CAPEX · purchases"}
                          </p>
                          <p className="mt-2 font-display text-4xl tabular-nums leading-none">{usd(budget.total)}</p>
                          <p className="mt-1.5 text-xs text-muted-foreground">{budget.lines} lines</p>
                        </div>
                        <Badge variant={STATUS_BADGE[budget.status]}>{STATUS_LABELS[budget.status]}</Badge>
                      </div>
                      {budget.companies.length > 0 ? (
                        <dl className="mt-4 space-y-1.5 border-t pt-3 text-sm">
                          {budget.companies.map((c) => (
                            <div key={c.id} className="flex justify-between gap-3">
                              <dt className="text-muted-foreground">{c.name}</dt>
                              <dd className="tabular-nums">{usd(c.amount)}</dd>
                            </div>
                          ))}
                        </dl>
                      ) : null}
                    </Link>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
