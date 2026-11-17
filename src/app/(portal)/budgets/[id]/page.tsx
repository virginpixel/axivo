import { notFound } from "next/navigation";
import { requirePermission } from "@/shared/auth/guard";
import { db } from "@/shared/db";
import { PageHeader } from "@/shared/ui/page";
import { Table, THead, TBody, TR, TH, TD, EmptyState } from "@/shared/ui/table";
import { Badge } from "@/shared/ui/badge";
import { CompanyPill } from "@/shared/ui/filter-pill";
import { DeleteButton } from "@/shared/ui/delete-button";
import { LiveSearch } from "@/shared/ui/live-search";
import { NoteHint } from "@/shared/ui/note-hint";
import { Download } from "lucide-react";
import { NotFoundError } from "@/shared/errors";
import { cn, formatDateTime } from "@/shared/utils";
import { loadBudget } from "@/modules/budgets/service";
import { CAPEX_TYPE_LABELS, MONTHS, PRIORITY_LABELS, STATUS_LABELS, usd } from "@/modules/budgets/budget-math";
import { deleteBudgetAction, deleteLineAction } from "@/modules/budgets/actions";
import { BudgetImportDialog, LineDialog, MoveButton, type BudgetCatalogs } from "../budget-dialogs";

export const dynamic = "force-dynamic";

const STATUS_BADGE = { DRAFT: "default", SUBMITTED: "warning", APPROVED: "success" } as const;
const PRIORITY_BADGE = { FIRST: "destructive", MEDIUM: "warning", WISH_LIST: "default" } as const;

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const budget = await db.budget.findUnique({ where: { id }, select: { kind: true, year: true } }).catch(() => null);
  return { title: budget ? `${budget.year} ${budget.kind}` : "Budget" };
}

/** One budget: its lines, each company's share and the months (SDS Doc 25). */
export default async function BudgetPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ company?: string; view?: string; q?: string }>;
}) {
  const { user } = await requirePermission("budgets.view");
  const { id } = await params;
  const query = await searchParams;
  const canManage = user.permissions.has("budgets.manage");
  const canApprove = user.permissions.has("budgets.approve");

  let data: Awaited<ReturnType<typeof loadBudget>>;
  try {
    data = await loadBudget(id, query.company || undefined, query.q || undefined);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }
  const { budget, lines, total, byCompany, byMonth } = data;
  const capex = budget.kind === "CAPEX";
  const draft = budget.status === "DRAFT";
  const editable = draft && canManage;
  const monthsView = !capex && query.view === "months";
  const companyName = query.company ? byCompany.find((c) => c.id === query.company)?.name : null;

  const [companies, vendors, history] = await Promise.all([
    db.company.findMany({ where: { deletedAt: null, isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    editable ? db.vendor.findMany({ where: { deletedAt: null, isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }) : [],
    db.auditEvent.findMany({
      where: { targetType: "budget", targetId: budget.id },
      orderBy: { occurredAt: "desc" },
      take: 8,
      select: { id: true, action: true, actorLabel: true, occurredAt: true },
    }),
  ]);
  const catalogs: BudgetCatalogs = {
    companies,
    vendors,
    usedBy: [...new Map(lines.filter((l) => l.locationCode).map((l) => [l.locationCode!.toLowerCase(), l.locationCode!])).values()].sort(),
    canCreateVendors: user.permissions.has("settings.manage"),
  };
  const lastShares = lines.length > 0
    ? lines[lines.length - 1]!.allocations.map((a) => ({ companyId: a.companyId, percent: String(a.percent) }))
    : companies.length > 0 ? [{ companyId: companies[0]!.id, percent: "100" }] : [];
  const href = (next: { company?: string; view?: string }) => {
    const s = new URLSearchParams();
    const company = next.company ?? query.company;
    const view = next.view ?? query.view;
    if (query.q) s.set("q", query.q);
    if (company) s.set("company", company);
    if (view) s.set("view", view);
    const q = s.toString();
    return `/budgets/${budget.id}${q ? `?${q}` : ""}`;
  };
  const exportQuery = new URLSearchParams();
  if (query.company) exportQuery.set("company", query.company);
  if (query.q) exportQuery.set("q", query.q);
  const exportHref = `/api/budgets/${budget.id}/export${exportQuery.size ? `?${exportQuery}` : ""}`;
  const record = (l: (typeof lines)[number]) => ({
    ...l,
    vendorId: l.vendor?.id ?? null,
    allocations: l.allocations.map((a) => ({ companyId: a.companyId, percent: a.percent })),
  });

  return (
    <div>
      <PageHeader
        title={`${budget.year} ${capex ? "CAPEX" : "OPEX"} budget`}
        backHref="/budgets"
        backLabel="Budgets"
        description={capex ? "Purchases: equipment, licences bought outright and projects." : "Running costs: subscriptions, maintenance, connectivity and services."}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={STATUS_BADGE[budget.status]}>{STATUS_LABELS[budget.status]}</Badge>
            {editable ? <BudgetImportDialog budgetId={budget.id} kind={budget.kind} companies={companies} /> : null}
            {editable ? <LineDialog budgetId={budget.id} kind={budget.kind} catalogs={catalogs} defaultShares={lastShares} /> : null}
            {draft && canManage && lines.length > 0 ? <MoveButton budgetId={budget.id} move="submit" label="Submit for approval" variant="primary" /> : null}
            {budget.status === "SUBMITTED" && canApprove ? <MoveButton budgetId={budget.id} move="return" label="Return to draft" /> : null}
            {budget.status === "SUBMITTED" && canApprove ? <MoveButton budgetId={budget.id} move="approve" label="Approve" variant="primary" /> : null}
            {budget.status === "APPROVED" && canApprove ? <MoveButton budgetId={budget.id} move="reopen" label="Reopen" /> : null}
            {editable ? (
              <DeleteButton
                action={deleteBudgetAction}
                id={budget.id}
                entityLabel={`${budget.year} ${budget.kind} budget`}
                message={`Delete the ${budget.year} ${budget.kind} budget and its ${lines.length} lines?`}
                successMessage="Budget deleted."
                redirectTo="/budgets"
              />
            ) : null}
          </div>
        }
      />

      {!draft ? (
        <p className="mb-5 rounded-xl border bg-muted/40 px-4 py-2.5 text-sm">
          {budget.status === "SUBMITTED"
            ? `Submitted ${budget.submittedAt ? formatDateTime(budget.submittedAt) : ""} and waiting for approval. Lines cannot change until it is returned to draft.`
            : `Approved ${budget.approvedAt ? formatDateTime(budget.approvedAt) : ""}. Lines cannot change unless it is reopened.`}
        </p>
      ) : null}

      <div className="mb-5 flex flex-wrap items-end gap-x-10 gap-y-4 rounded-2xl border bg-card px-5 py-4">
        <div>
          <p className="label-caps text-muted-foreground">{companyName ? `${companyName}'s share` : "Total"}{query.q ? ", lines found" : ""}</p>
          <p className="mt-2 font-display text-5xl tabular-nums leading-none">{usd(total)}</p>
          <p className="mt-1.5 text-xs text-muted-foreground">{lines.length} lines</p>
        </div>
        {byCompany.length > 0 ? (
          <dl className="flex flex-wrap gap-x-8 gap-y-2 text-sm">
            {byCompany.map((c) => (
              <div key={c.id}>
                <dt className={cn("text-xs text-muted-foreground", query.company === c.id && "font-medium text-foreground")}>{c.name}</dt>
                <dd className="tabular-nums">{usd(c.amount)}</dd>
              </div>
            ))}
          </dl>
        ) : null}
      </div>

      {!capex && lines.length > 0 ? (
        <div className="mb-5 overflow-x-auto rounded-2xl border bg-card px-5 py-4">
          <p className="label-caps mb-3 text-muted-foreground">By month</p>
          <div className="grid min-w-[44rem] grid-cols-12 items-end gap-2">
            {byMonth.map((amount, i) => {
              const peak = Math.max(...byMonth, 1);
              return (
                <div key={i} className="text-center">
                  <div className="mx-auto flex h-16 w-full items-end justify-center">
                    <div className="w-full rounded-t bg-primary/70" style={{ height: `${Math.max((amount / peak) * 100, 2)}%` }} title={usd(amount, 2)} />
                  </div>
                  <p className="mt-1 text-[11px] text-muted-foreground">{MONTHS[i]}</p>
                  <p className="text-[11px] tabular-nums">{usd(amount)}</p>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <LiveSearch placeholder={capex ? "Search item or ref" : "Search product or vendor"} className="w-full sm:w-72" />
        <CompanyPill href={href({ company: "" })} label="All companies" active={!query.company} />
        {byCompany.map((c) => (
          <CompanyPill key={c.id} href={href({ company: c.id })} label={c.name} active={query.company === c.id} />
        ))}
        <span className="ml-auto flex flex-wrap gap-2">
          {!capex ? (
            <>
              <CompanyPill href={href({ view: "" })} label="Year" active={!monthsView} />
              <CompanyPill href={href({ view: "months" })} label="Months" active={monthsView} />
            </>
          ) : null}
          <a
            href={exportHref}
            className="inline-flex items-center gap-1.5 rounded-full border border-input bg-card px-4 py-1.5 text-sm font-medium transition-colors hover:border-primary/40 hover:bg-accent"
          >
            <Download className="h-4 w-4" /> Export
          </a>
        </span>
      </div>

      {lines.length === 0 ? (
        <EmptyState
          title={query.q ? "Nothing matches" : "No lines"}
          description={
            query.q
              ? `No line matches "${query.q}".`
              : editable
                ? "Add lines one by one, or import them from your spreadsheet."
                : companyName
                  ? `No line is paid by ${companyName}.`
                  : "Nothing has been added yet."
          }
        />
      ) : monthsView ? (
        <Table>
          <THead>
            <TR>
              <TH>Item</TH>
              {MONTHS.map((m) => <TH key={m} className="text-right">{m}</TH>)}
              <TH className="text-right">Year</TH>
            </TR>
          </THead>
          <TBody>
            {lines.map((l) => (
              <TR key={l.id}>
                <TD className="max-w-56">
                  <span className="block truncate text-sm font-medium" title={l.description}>{l.description}</span>
                  <span className="text-xs text-muted-foreground">{l.evenlySpread ? "Even" : "Per month"}</span>
                </TD>
                {l.monthsInView.map((m, i) => <TD key={i} className="text-right text-xs tabular-nums">{m ? usd(m) : ""}</TD>)}
                <TD className="text-right text-sm font-medium tabular-nums">{usd(l.inView)}</TD>
              </TR>
            ))}
            <TR>
              <TD className="font-semibold">Total</TD>
              {byMonth.map((m, i) => <TD key={i} className="text-right text-xs font-semibold tabular-nums">{usd(m)}</TD>)}
              <TD className="text-right font-semibold tabular-nums">{usd(total)}</TD>
            </TR>
          </TBody>
        </Table>
      ) : (
        <Table>
          <THead>
            <TR>
              {capex ? <TH>Ref</TH> : null}
              <TH>Item</TH>
              {capex ? <TH>Priority</TH> : <TH>Vendor</TH>}
              {capex ? <TH className="text-right">Qty × price</TH> : null}
              <TH className="text-right">{companyName ? "Share" : "Amount"}</TH>
              <TH>Paid by</TH>
              <TH className="text-right">Actions</TH>
            </TR>
          </THead>
          <TBody>
            {lines.map((l) => (
              <TR key={l.id}>
                {capex ? <TD className="font-mono text-xs">{l.reference ?? ""}</TD> : null}
                <TD className="max-w-96">
                  <span className="text-sm font-medium">{l.description}</span>
                  <p className="text-xs text-muted-foreground">
                    {[
                      l.locationCode,
                      l.category,
                      capex && l.capexType ? CAPEX_TYPE_LABELS[l.capexType] : null,
                      capex && l.period ? `Needed ${l.period}` : null,
                      !capex && !l.evenlySpread ? "Amounts per month" : null,
                    ].filter(Boolean).join(" · ")}
                  </p>
                  {capex && l.justification ? <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground" title={l.justification}>{l.justification}</p> : null}
                </TD>
                {capex ? (
                  <TD>{l.priority ? <Badge variant={PRIORITY_BADGE[l.priority]}>{PRIORITY_LABELS[l.priority]}</Badge> : null}</TD>
                ) : (
                  <TD className="text-xs">{l.vendor?.name ?? ""}</TD>
                )}
                {capex ? (
                  <TD className="text-right text-xs tabular-nums">
                    {l.quantity ?? 1} × {usd(l.unitPrice ?? 0, 2)}
                    {l.associatedCost ? <p className="text-muted-foreground">+ {usd(l.associatedCost, 2)}</p> : null}
                  </TD>
                ) : null}
                <TD className="text-right text-sm font-medium tabular-nums">
                  {usd(l.inView, 2)}
                  {companyName && l.inView !== l.amount ? <p className="text-[11px] font-normal text-muted-foreground">of {usd(l.amount, 2)}</p> : null}
                </TD>
                <TD className="text-xs">
                  {l.allocations.map((a) => (
                    <p key={a.companyId} className="whitespace-nowrap">{a.companyName}{l.allocations.length > 1 || a.percent !== 100 ? ` ${a.percent}%` : ""}</p>
                  ))}
                </TD>
                <TD className="text-right">
                  <div className="flex justify-end">
                    <NoteHint note={l.notes} label={l.description} />
                    {editable ? (
                      <>
                        <LineDialog budgetId={budget.id} kind={budget.kind} catalogs={catalogs} line={record(l)} defaultShares={lastShares} />
                        <DeleteButton action={deleteLineAction} id={l.id} entityLabel={l.description} message={`Remove "${l.description}" from the budget?`} successMessage="Line removed." />
                      </>
                    ) : null}
                  </div>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}

      {history.length > 0 ? (
        <div className="mt-6 rounded-2xl border bg-card px-5 py-4">
          <p className="label-caps mb-2 text-muted-foreground">Recent changes</p>
          <ul className="space-y-1.5 text-sm">
            {history.map((h) => (
              <li key={h.id} className="flex flex-wrap justify-between gap-2 border-b pb-1.5 last:border-0">
                <span>{h.action}</span>
                <span className="text-xs text-muted-foreground">{h.actorLabel} · {formatDateTime(h.occurredAt)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
