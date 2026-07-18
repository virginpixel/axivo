import { requirePermission } from "@/shared/auth/guard";
import { db } from "@/shared/db";
import { PageHeader, StatCard, Pagination } from "@/shared/ui/page";
import { Table, THead, TBody, TR, TH, TD, EmptyState } from "@/shared/ui/table";
import { Badge } from "@/shared/ui/badge";
import { Input, Select } from "@/shared/ui/input";
import { formatDateTime } from "@/shared/utils";
import { Download } from "lucide-react";
import type { Prisma } from "@prisma/client";

export const metadata = { title: "Audit Logs" };
export const dynamic = "force-dynamic";

/** Immutable audit & activity log viewer (SDS Doc 16). */
export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    module?: string;
    outcome?: string;
    actor?: string;
    from?: string;
    to?: string;
    page?: string;
  }>;
}) {
  const { user } = await requirePermission("audit.view");
  const params = await searchParams;
  const page = Math.max(1, Number(params.page) || 1);
  const pageSize = 50;
  const isGlobalAdmin = user.systemRoleKey === "SYSTEM_ADMINISTRATOR";
  const canExport = user.permissions.has("audit.export");

  const where: Prisma.AuditEventWhereInput = {
    ...(isGlobalAdmin ? {} : { OR: [{ companyId: user.companyId }, { companyId: null }] }),
    ...(params.module ? { module: params.module } : {}),
    ...(params.outcome ? { outcome: params.outcome as never } : {}),
    ...(params.actor ? { actorLabel: { contains: params.actor, mode: "insensitive" } } : {}),
    ...(params.q
      ? {
          OR: [
            { action: { contains: params.q, mode: "insensitive" } },
            { eventType: { contains: params.q, mode: "insensitive" } },
            { targetLabel: { contains: params.q, mode: "insensitive" } },
          ],
        }
      : {}),
    ...(params.from || params.to
      ? {
          occurredAt: {
            ...(params.from ? { gte: new Date(params.from) } : {}),
            ...(params.to ? { lte: new Date(`${params.to}T23:59:59.999Z`) } : {}),
          },
        }
      : {}),
  };

  const dayAgo = new Date(Date.now() - 24 * 3_600_000);
  const [rows, total, modules, failedLogins24h, denied24h, securityEvents24h] = await Promise.all([
    db.auditEvent.findMany({
      where,
      orderBy: { occurredAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { fieldChanges: true },
    }),
    db.auditEvent.count({ where }),
    db.auditEvent.groupBy({ by: ["module"], _count: true, orderBy: { module: "asc" } }),
    db.auditEvent.count({ where: { eventType: "login.failed", occurredAt: { gte: dayAgo } } }),
    db.auditEvent.count({ where: { outcome: "DENIED", occurredAt: { gte: dayAgo } } }),
    db.auditEvent.count({ where: { module: "security", occurredAt: { gte: dayAgo } } }),
  ]);
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  const exportQuery = new URLSearchParams();
  if (params.module) exportQuery.set("module", params.module);
  if (params.actor) exportQuery.set("actor", params.actor);
  if (params.from) exportQuery.set("from", params.from);
  if (params.to) exportQuery.set("to", params.to);

  return (
    <div>
      <PageHeader
        title="Audit & Activity Logs"
        description="Immutable record of every significant action. Records cannot be edited or deleted."
        actions={
          canExport ? (
            <div className="flex gap-2">
              <a
                href={`/api/audit/export?format=csv&${exportQuery.toString()}`}
                className="inline-flex h-8 items-center gap-1.5 rounded-md border bg-card px-3 text-xs font-medium hover:bg-accent"
              >
                <Download className="h-3.5 w-3.5" /> CSV
              </a>
              <a
                href={`/api/audit/export?format=xlsx&${exportQuery.toString()}`}
                className="inline-flex h-8 items-center gap-1.5 rounded-md border bg-card px-3 text-xs font-medium hover:bg-accent"
              >
                <Download className="h-3.5 w-3.5" /> XLSX
              </a>
            </div>
          ) : undefined
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Events (filtered)" value={total} />
        <StatCard label="Failed logins (24h)" value={failedLogins24h} tone={failedLogins24h > 0 ? "warning" : "default"} />
        <StatCard label="Permission denials (24h)" value={denied24h} tone={denied24h > 0 ? "warning" : "default"} />
        <StatCard label="Security events (24h)" value={securityEvents24h} />
      </div>

      <form method="get" className="mb-4 flex flex-wrap items-end gap-2">
        <Input name="q" defaultValue={params.q ?? ""} placeholder="Search action, event, target…" className="w-full sm:w-64" aria-label="Search audit events" />
        <Select name="module" defaultValue={params.module ?? ""} className="w-full sm:w-40" aria-label="Filter by module">
          <option value="">All modules</option>
          {modules.map((entry) => (
            <option key={entry.module} value={entry.module}>{entry.module}</option>
          ))}
        </Select>
        <Select name="outcome" defaultValue={params.outcome ?? ""} className="w-full sm:w-36" aria-label="Filter by outcome">
          <option value="">All outcomes</option>
          <option value="SUCCESS">Success</option>
          <option value="FAILURE">Failure</option>
          <option value="DENIED">Denied</option>
        </Select>
        <Input name="actor" defaultValue={params.actor ?? ""} placeholder="Actor" className="w-full sm:w-36" aria-label="Filter by actor" />
        <Input name="from" type="date" defaultValue={params.from ?? ""} className="w-full sm:w-40" aria-label="From date" />
        <Input name="to" type="date" defaultValue={params.to ?? ""} className="w-full sm:w-40" aria-label="To date" />
        <button type="submit" className="h-9 rounded-md border bg-card px-4 text-sm hover:bg-accent">Filter</button>
      </form>

      {rows.length === 0 ? (
        <EmptyState title="No audit events" description="Events matching your filters appear here." />
      ) : (
        <>
          <Table>
            <THead>
              <TR>
                <TH>Occurred (UTC)</TH><TH>Module</TH><TH>Action</TH><TH>Actor</TH><TH>IP</TH><TH>Outcome</TH>
              </TR>
            </THead>
            <TBody>
              {rows.map((event) => (
                <TR key={event.id}>
                  <TD className="whitespace-nowrap font-mono text-xs">{formatDateTime(event.occurredAt)}</TD>
                  <TD>
                    <Badge variant="outline">{event.module}</Badge>
                  </TD>
                  <TD className="max-w-md">
                    <span className="block">{event.action}</span>
                    {event.fieldChanges.length > 0 ? (
                      <details className="mt-1">
                        <summary className="cursor-pointer text-xs text-primary">
                          {event.fieldChanges.length} field change(s)
                        </summary>
                        <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                          {event.fieldChanges.map((change) => (
                            <li key={change.id}>
                              <span className="font-medium">{change.field}</span>: {change.previousValue ?? "—"} →{" "}
                              {change.newValue ?? "—"}
                            </li>
                          ))}
                        </ul>
                      </details>
                    ) : null}
                  </TD>
                  <TD className="text-xs">{event.actorLabel}</TD>
                  <TD className="font-mono text-xs">{event.ipAddress ?? "—"}</TD>
                  <TD>
                    <Badge
                      variant={
                        event.outcome === "SUCCESS" ? "success" : event.outcome === "DENIED" ? "warning" : "destructive"
                      }
                    >
                      {event.outcome.toLowerCase()}
                    </Badge>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
          <Pagination
            page={page}
            pageCount={pageCount}
            total={total}
            buildHref={(p) => {
              const search = new URLSearchParams();
              for (const [key, value] of Object.entries(params)) {
                if (value && key !== "page") search.set(key, value);
              }
              search.set("page", String(p));
              return `/audit?${search.toString()}`;
            }}
          />
        </>
      )}
    </div>
  );
}
