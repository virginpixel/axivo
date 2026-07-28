import Link from "next/link";
import { db } from "@/shared/db";
import { requirePermission } from "@/shared/auth/guard";
import { PageHeader, StatCard } from "@/shared/ui/page";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { StatusBadge } from "@/shared/ui/badge";
import { AutoRefresh } from "@/shared/ui/auto-refresh";
import { formatDateTime } from "@/shared/utils";
import { StatusDonut } from "./dashboard-charts";

export const metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

const label = (value: string) =>
  value
    .toLowerCase()
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");

/** Portal dashboard (SDS Doc 15 Ch4): live KPIs, charts and drill-down links. */
export default async function DashboardPage() {
  const { user } = await requirePermission("reports.view");
  const isGlobalAdmin = user.systemRoleKey === "SYSTEM_ADMINISTRATOR";
  const companyFilter = isGlobalAdmin ? {} : { companyId: user.companyId };

  const [
    pendingApprovals,
    pendingImplementations,
    correctionsPending,
    completedRequests,
    totalPeople,
    totalAssets,
    expiringContracts,
    pendingDeliveries,
    recentRequests,
    assetsByStatus,
    requestsByStatus,
    categoryCounts,
    categories,
  ] = await Promise.all([
    db.requestItem.count({ where: { status: "PENDING_APPROVAL", request: companyFilter } }),
    db.requestItem.count({ where: { status: "IMPLEMENTATION_PENDING", request: companyFilter } }),
    db.requestItem.count({ where: { status: "CORRECTION_REQUESTED", request: companyFilter } }),
    db.request.count({ where: { ...companyFilter, status: "COMPLETED" } }),
    db.person.count({ where: { ...companyFilter, deletedAt: null, isActive: true } }),
    db.asset.count({ where: { ...companyFilter, deletedAt: null } }),
    db.contract.count({
      where: {
        ...companyFilter,
        deletedAt: null,
        status: { in: ["ACTIVE", "EXPIRING"] },
        endDate: { lte: new Date(Date.now() + 60 * 86_400_000), gte: new Date() },
      },
    }),
    db.credentialDelivery.count({
      where: { status: { in: ["PENDING", "DELIVERED"] }, person: companyFilter },
    }),
    db.request.findMany({
      where: companyFilter,
      orderBy: { submittedAt: "desc" },
      take: 8,
      include: { items: { select: { id: true } } },
    }),
    db.asset.groupBy({ by: ["status"], where: { ...companyFilter, deletedAt: null }, _count: true }),
    db.request.groupBy({ by: ["status"], where: companyFilter, _count: true }),
    db.asset.groupBy({ by: ["categoryId"], where: { ...companyFilter, deletedAt: null }, _count: true }),
    db.assetCategory.findMany({
      where: { deletedAt: null },
      select: { id: true, name: true },
    }),
  ]);

  const categoryNames = new Map(categories.map((category) => [category.id, category.name]));
  const categoryList = categoryCounts
    .map((entry) => ({ name: categoryNames.get(entry.categoryId) ?? "Unknown", count: entry._count }))
    .sort((a, b) => b.count - a.count);

  return (
    <div>
      <AutoRefresh />
      <PageHeader
        title="Dashboard"
        description={`Operational overview${isGlobalAdmin ? " across all companies" : ""}.`}
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Link href="/requests?status=PENDING_APPROVAL">
          <StatCard label="Pending approvals" value={pendingApprovals} tone={pendingApprovals > 0 ? "warning" : "default"} />
        </Link>
        <Link href="/requests?status=IMPLEMENTATION_PENDING">
          <StatCard label="Pending implementations" value={pendingImplementations} tone={pendingImplementations > 0 ? "info" : "default"} />
        </Link>
        <Link href="/requests?status=CORRECTION_REQUESTED">
          <StatCard label="Corrections pending" value={correctionsPending} tone={correctionsPending > 0 ? "warning" : "default"} />
        </Link>
        <Link href="/requests?status=COMPLETED">
          <StatCard label="Completed requests" value={completedRequests} tone="success" />
        </Link>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Link href="/people">
          <StatCard label="Active employees" value={totalPeople} />
        </Link>
        <Link href="/assets">
          <StatCard label="Assets" value={totalAssets} />
        </Link>
        <Link href="/contracts">
          <StatCard label="Contracts expiring ≤60d" value={expiringContracts} tone={expiringContracts > 0 ? "warning" : "default"} />
        </Link>
        <Link href="/requests">
          <StatCard label="Credential acks pending" value={pendingDeliveries} tone={pendingDeliveries > 0 ? "info" : "default"} />
        </Link>
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Assets by status</CardTitle>
          </CardHeader>
          <CardContent>
            <StatusDonut
              ariaLabel="Assets by status"
              totalLabel="assets"
              data={assetsByStatus.map((entry) => ({ name: label(entry.status), value: entry._count }))}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Requests by status</CardTitle>
          </CardHeader>
          <CardContent>
            <StatusDonut
              ariaLabel="Requests by status"
              totalLabel="requests"
              data={requestsByStatus.map((entry) => ({ name: label(entry.status), value: entry._count }))}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Asset categories</CardTitle>
          </CardHeader>
          <CardContent>
            <StatusDonut
              ariaLabel="Assets by category"
              totalLabel="assets"
              data={categoryList.slice(0, 8).map((entry) => ({ name: entry.name, value: entry.count }))}
            />
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle>Recent requests</CardTitle>
          <Link href="/requests" className="text-xs font-medium text-primary hover:underline">
            View all
          </Link>
        </CardHeader>
        <CardContent>
          {recentRequests.length === 0 ? (
            <p className="text-sm text-muted-foreground">No requests submitted yet.</p>
          ) : (
            <ul className="divide-y">
              {recentRequests.map((request) => (
                <li key={request.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <Link href={`/requests/${request.id}`} className="font-medium text-primary hover:underline">
                      <span className="font-register">{request.requestNumber}</span>
                    </Link>
                    <p className="truncate text-xs text-muted-foreground">
                      For {request.requestedForName} · {request.items.length} item(s) ·{" "}
                      {formatDateTime(request.submittedAt)}
                    </p>
                  </div>
                  <StatusBadge status={request.status} />
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
