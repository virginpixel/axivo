import Link from "next/link";
import { requirePermission } from "@/shared/auth/guard";
import { recordAudit } from "@/shared/audit/audit";
import { STANDARD_REPORTS, getReport } from "@/modules/reports/definitions";
import { formatDateTimeWithZone } from "@/shared/utils";
import { PageHeader } from "@/shared/ui/page";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui/card";
import { Table, THead, TBody, TR, TH, TD, EmptyState } from "@/shared/ui/table";
import { Download } from "lucide-react";

export const metadata = { title: "Reports" };
export const dynamic = "force-dynamic";

/** Standard reports (SDS Doc 15): run live, filtered by permissions, exportable. */
export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ report?: string }>;
}) {
  const { user, audit } = await requirePermission("reports.view");
  const params = await searchParams;
  const selected = params.report ? getReport(params.report) : undefined;
  const canExport = user.permissions.has("reports.export");

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

  const result = await selected.run(user);
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
        description={`${selected.description} · ${result.rows.length} row(s) · generated ${formatDateTimeWithZone(new Date())}`}
        actions={
          canExport ? (
            <div className="flex gap-2">
              <a
                href={`/api/reports/${selected.key}/export?format=csv`}
                className="inline-flex h-8 items-center gap-1.5 rounded-md border bg-card px-3 text-xs font-medium hover:bg-accent"
              >
                <Download className="h-3.5 w-3.5" /> CSV
              </a>
              <a
                href={`/api/reports/${selected.key}/export?format=xlsx`}
                className="inline-flex h-8 items-center gap-1.5 rounded-md border bg-card px-3 text-xs font-medium hover:bg-accent"
              >
                <Download className="h-3.5 w-3.5" /> XLSX
              </a>
            </div>
          ) : undefined
        }
      />
      {result.rows.length === 0 ? (
        <EmptyState title="No data" description="No records match this report right now." />
      ) : (
        <Table>
          <THead>
            <TR>
              {result.headers.map((header) => (
                <TH key={header}>{header}</TH>
              ))}
            </TR>
          </THead>
          <TBody>
            {result.rows.map((row, rowIndex) => (
              <TR key={rowIndex}>
                {row.map((cell, cellIndex) => (
                  <TD key={cellIndex} className="max-w-64 truncate" title={cell}>
                    {cell}
                  </TD>
                ))}
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </div>
  );
}
