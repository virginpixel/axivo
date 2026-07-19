import Link from "next/link";
import { requirePermission } from "@/shared/auth/guard";
import { db } from "@/shared/db";
import { PageHeader, Pagination } from "@/shared/ui/page";
import { Table, THead, TBody, TR, TH, TD, EmptyState } from "@/shared/ui/table";
import { StatusBadge } from "@/shared/ui/badge";
import { formatDateTime } from "@/shared/utils";
import { Input, Select } from "@/shared/ui/input";
import { AutoRefresh } from "@/shared/ui/auto-refresh";
import type { Prisma, RequestStatus } from "@prisma/client";

export const metadata = { title: "Requests" };
export const dynamic = "force-dynamic";

const REQUEST_STATUSES: RequestStatus[] = [
  "SUBMITTED",
  "PENDING_APPROVAL",
  "CORRECTION_REQUESTED",
  "APPROVED",
  "IMPLEMENTATION_PENDING",
  "COMPLETED",
  "REJECTED",
  "CANCELLED",
];

/** Requests administration list (SDS Doc 09 Ch10). */
export default async function RequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; company?: string; page?: string }>;
}) {
  const { user } = await requirePermission("requests.view");
  const params = await searchParams;
  const page = Math.max(1, Number(params.page) || 1);
  const pageSize = 25;
  const isGlobalAdmin = user.systemRoleKey === "SYSTEM_ADMINISTRATOR";

  const where: Prisma.RequestWhereInput = {
    ...(isGlobalAdmin ? {} : { companyId: user.companyId }),
    ...(params.status && REQUEST_STATUSES.includes(params.status as RequestStatus)
      ? { status: params.status as RequestStatus }
      : {}),
    ...(params.company && isGlobalAdmin ? { companyId: params.company } : {}),
    ...(params.q
      ? {
          OR: [
            { requestNumber: { contains: params.q, mode: "insensitive" } },
            { requesterName: { contains: params.q, mode: "insensitive" } },
            { requesterEmail: { contains: params.q, mode: "insensitive" } },
            { requestedForName: { contains: params.q, mode: "insensitive" } },
            { requestedForEmail: { contains: params.q, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [rows, total, companies] = await Promise.all([
    db.request.findMany({
      where,
      orderBy: { submittedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        company: { select: { name: true } },
        form: { select: { name: true } },
        items: { select: { id: true, status: true } },
      },
    }),
    db.request.count({ where }),
    isGlobalAdmin
      ? db.company.findMany({ where: { deletedAt: null }, orderBy: { name: "asc" } })
      : Promise.resolve([]),
  ]);
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  const query = (overrides: Record<string, string | number | undefined>) => {
    const search = new URLSearchParams();
    const merged = { q: params.q, status: params.status, company: params.company, page: undefined, ...overrides };
    for (const [key, value] of Object.entries(merged)) {
      if (value !== undefined && value !== "") search.set(key, String(value));
    }
    const qs = search.toString();
    return qs ? `/requests?${qs}` : "/requests";
  };

  return (
    <div>
      <AutoRefresh />
      <PageHeader title="Requests" description="All business requests and their workflow progress." />

      <form method="get" className="mb-4 flex flex-wrap items-end gap-2">
        <div className="w-full sm:w-64">
          <Input name="q" placeholder="Search number, requester, employee…" defaultValue={params.q ?? ""} aria-label="Search requests" />
        </div>
        <Select name="status" defaultValue={params.status ?? ""} className="w-full sm:w-52" aria-label="Filter by status">
          <option value="">All statuses</option>
          {REQUEST_STATUSES.map((status) => (
            <option key={status} value={status}>
              {status.replace(/_/g, " ")}
            </option>
          ))}
        </Select>
        {companies.length > 0 ? (
          <Select name="company" defaultValue={params.company ?? ""} className="w-full sm:w-52" aria-label="Filter by company">
            <option value="">All companies</option>
            {companies.map((company) => (
              <option key={company.id} value={company.id}>
                {company.name}
              </option>
            ))}
          </Select>
        ) : null}
        <button type="submit" className="h-9 rounded-md border bg-card px-4 text-sm hover:bg-accent">
          Filter
        </button>
      </form>

      {rows.length === 0 ? (
        <EmptyState
          title="No requests found"
          description="Requests submitted through public forms appear here with their approval progress."
        />
      ) : (
        <>
          <Table>
            <THead>
              <TR>
                <TH>Request</TH>
                <TH>Requested for</TH>
                <TH>Form</TH>
                <TH>Company</TH>
                <TH>Items</TH>
                <TH>Submitted</TH>
                <TH>Status</TH>
              </TR>
            </THead>
            <TBody>
              {rows.map((request) => (
                <TR key={request.id}>
                  <TD>
                    <Link href={`/requests/${request.id}`} className="font-medium text-primary hover:underline">
                      {request.requestNumber}
                    </Link>
                    <p className="text-xs text-muted-foreground">by {request.requesterName}</p>
                  </TD>
                  <TD>
                    <p>{request.requestedForName}</p>
                    <p className="text-xs text-muted-foreground">{request.requestedForEmail}</p>
                  </TD>
                  <TD className="max-w-40 truncate">{request.form.name}</TD>
                  <TD>{request.company.name}</TD>
                  <TD>{request.items.length}</TD>
                  <TD className="whitespace-nowrap text-xs">{formatDateTime(request.submittedAt)}</TD>
                  <TD>
                    <StatusBadge status={request.status} />
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
          <Pagination page={page} pageCount={pageCount} total={total} buildHref={(p) => query({ page: p })} />
        </>
      )}
    </div>
  );
}
