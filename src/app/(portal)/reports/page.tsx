import Link from "next/link";
import { requirePermission } from "@/shared/auth/guard";
import { recordAudit } from "@/shared/audit/audit";
import { STANDARD_REPORTS, getReport, buildReportView } from "@/modules/reports/definitions";
import { formatDateTimeWithZone } from "@/shared/utils";
import { PageHeader, Pagination } from "@/shared/ui/page";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui/card";
import { EmptyState } from "@/shared/ui/table";
import { ReportTable } from "./report-table";
import { Download } from "lucide-react";

export const metadata = { title: "Reports" };
export const dynamic = "force-dynamic";

/** Standard reports (SDS Doc 15): run live, filtered by permissions, exportable. */
export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { user, audit } = await requirePermission("reports.view");
  const params = await searchParams;
  const selected = params.report ? getReport(params.report) : undefined;
  const canExport = user.permissions.has("reports.export");
  // Filter values come straight from the query string (minus "report").
  const activeFilters: Record<string, string | undefined> = { ...params };
  delete activeFilters.report;

  if (!selected) {
    const categories = Array.from(new Set(STANDARD_REPORTS.map((report) => report.category)));
    return (
      <div>
        <PageHeader title="Reports" description="Standard operational and compliance reports using live data." />
        <div className="space-y-6">
          {categories.map((category) => (
            <section key={category} aria-label={category}>
              <h2 className="mb-3 text-base font-semibold">{category}</h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {STANDARD_REPORTS.filter((report) => report.category === category).map((report) => (
                  <Link key={report.key} href={`/reports?report=${report.key}`}>
                    <Card className="h-full transition-colors hover:border-primary/60">
                      <CardHeader>
                        <CardTitle className="text-sm">{report.name}</CardTitle>
                        <CardDescription>{report.description}</CardDescription>
                      </CardHeader>
                    </Card>
                  </Link>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    );
  }

  const filterDefs = selected.filters ? await selected.filters(user) : [];
  const result = await selected.run(user, activeFilters);
  // Company, date range, search and paging are applied the same way for every
  // report; only the column names differ per report.
  const page = Math.max(1, Number(params.page) || 1);
  const view = buildReportView(selected, result, activeFilters, page, 50);
  // Preserve report + filters when building export links.
  const exportQuery = new URLSearchParams();
  for (const [key, value] of Object.entries(activeFilters)) {
    if (value) exportQuery.set(key, value);
  }
  const exportSuffix = exportQuery.toString() ? `&${exportQuery.toString()}` : "";
  await recordAudit(audit, {
    module: "reports",
    eventType: "report.executed",
    action: `Executed report "${selected.name}" (${result.rows.length} row(s))`,
    targetType: "report",
    targetLabel: selected.key,
  });

  return (
    <div>
      <PageHeader
        title={selected.name}
        breadcrumbs={[{ label: "Reports", href: "/reports" }, { label: selected.name }]}
        description={`${selected.description} · ${view.total} row(s) · generated ${formatDateTimeWithZone(new Date())}`}
        actions={
          canExport ? (
            <div className="flex gap-2">
              <a
                href={`/api/reports/${selected.key}/export?format=csv${exportSuffix}`}
                className="inline-flex h-8 items-center gap-1.5 rounded-md border border-input bg-card px-2.5 text-xs font-medium transition-colors hover:border-primary/40 hover:bg-accent hover:text-accent-foreground"
              >
                <Download className="h-3.5 w-3.5" /> CSV
              </a>
              <a
                href={`/api/reports/${selected.key}/export?format=xlsx${exportSuffix}`}
                className="inline-flex h-8 items-center gap-1.5 rounded-md border border-input bg-card px-2.5 text-xs font-medium transition-colors hover:border-primary/40 hover:bg-accent hover:text-accent-foreground"
              >
                <Download className="h-3.5 w-3.5" /> XLSX
              </a>
            </div>
          ) : undefined
        }
      />
      <form method="get" className="mb-4 flex flex-wrap items-end gap-2">
          <input type="hidden" name="report" value={selected.key} />
          <div>
            <label htmlFor="filter-q" className="label-caps mb-1 block text-muted-foreground">
              Search
            </label>
            <input
              id="filter-q"
              name="q"
              type="search"
              defaultValue={activeFilters.q ?? ""}
              placeholder={selected.searchPlaceholder ?? "Search this report"}
              className="h-9 w-72 rounded-md border border-input bg-card px-2.5 text-sm transition-colors placeholder:text-muted-foreground/80 focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/25"
            />
          </div>
          {view.companyOptions.length > 1 ? (
            <div>
              <label htmlFor="filter-company" className="label-caps mb-1 block text-muted-foreground">
                Company
              </label>
              <select
                id="filter-company"
                name="company"
                defaultValue={activeFilters.company ?? ""}
                className="h-9 rounded-md border border-input bg-card px-2.5 text-sm transition-colors focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/25"
              >
                <option value="">All companies</option>
                {view.companyOptions.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </div>
          ) : null}
          {selected.dateColumn ? (
            <>
              <div>
                <label htmlFor="filter-from" className="label-caps mb-1 block text-muted-foreground">
                  {selected.dateColumn} from
                </label>
                <input
                  id="filter-from"
                  name="from"
                  type="date"
                  defaultValue={activeFilters.from ?? ""}
                  className="h-9 rounded-md border border-input bg-card px-2.5 text-sm transition-colors focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/25"
                />
              </div>
              <div>
                <label htmlFor="filter-to" className="label-caps mb-1 block text-muted-foreground">
                  {selected.dateColumn} to
                </label>
                <input
                  id="filter-to"
                  name="to"
                  type="date"
                  defaultValue={activeFilters.to ?? ""}
                  className="h-9 rounded-md border border-input bg-card px-2.5 text-sm transition-colors focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/25"
                />
              </div>
            </>
          ) : null}
          {filterDefs.map((filter) => (
            <div key={filter.key}>
              <label htmlFor={`filter-${filter.key}`} className="label-caps mb-1 block text-muted-foreground">
                {filter.label}
              </label>
              <select
                id={`filter-${filter.key}`}
                name={filter.key}
                defaultValue={activeFilters[filter.key] ?? ""}
                className="h-9 rounded-md border border-input bg-card px-2.5 text-sm transition-colors focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/25"
              >
                <option value="">All</option>
                {filter.options.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>
          ))}
          <button
            type="submit"
            className="h-9 rounded-md bg-primary px-3.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Apply
          </button>
          {exportSuffix ? (
            <Link
              href={`/reports?report=${selected.key}`}
              className="inline-flex h-9 items-center rounded-md border border-input px-3 text-sm font-medium transition-colors hover:border-primary/40 hover:bg-accent hover:text-accent-foreground"
            >
              Clear
            </Link>
          ) : null}
      </form>
      {view.total === 0 ? (
        <EmptyState title="No data" description="No records match these filters." />
      ) : (
        <>
          <ReportTable
            reportKey={selected.key}
            headers={view.headers}
            rows={view.rows}
            rowLinks={view.rowLinks}
            rowIds={selected.bundle ? view.rowIds : undefined}
            canExport={canExport}
          />
          <Pagination
            page={view.page}
            pageCount={view.pageCount}
            total={view.total}
            buildHref={(next) => {
              const search = new URLSearchParams();
              search.set("report", selected.key);
              for (const [key, value] of Object.entries(activeFilters)) {
                if (value && key !== "page") search.set(key, value);
              }
              search.set("page", String(next));
              return `/reports?${search.toString()}`;
            }}
          />
        </>
      )}
    </div>
  );
}
