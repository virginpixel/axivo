import Link from "next/link";
import { db } from "@/shared/db";
import { requirePermission } from "@/shared/auth/guard";
import { PageHeader, StatCard } from "@/shared/ui/page";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { StatusBadge } from "@/shared/ui/badge";
import { formatDateTime } from "@/shared/utils";

export const metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

/** Portal dashboard (SDS Doc 15 Ch4): live operational KPIs with drill-down links. */
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
    assignedAssets,
    availableAssets,
    expiringContracts,
    pendingDeliveries,
    recentRequests,
    failedNotifications,
  ] = await Promise.all([
    db.requestItem.count({ where: { status: "PENDING_APPROVAL", request: companyFilter } }),
    db.requestItem.count({ where: { status: "IMPLEMENTATION_PENDING", request: companyFilter } }),
    db.requestItem.count({ where: { status: "CORRECTION_REQUESTED", request: companyFilter } }),
    db.request.count({ where: { ...companyFilter, status: "COMPLETED" } }),
    db.person.count({ where: { ...companyFilter, deletedAt: null, isActive: true } }),
    db.asset.count({ where: { ...companyFilter, deletedAt: null } }),
    db.asset.count({ where: { ...companyFilter, deletedAt: null, status: "ASSIGNED" } }),
    db.asset.count({ where: { ...companyFilter, deletedAt: null, status: "AVAILABLE" } }),
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
    db.notification.count({ where: { status: "FAILED" } }),
  ]);

  return (
    <div>
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
          <StatCard label="Assets" value={totalAssets} hint={`${assignedAssets} assigned · ${availableAssets} available`} />
        </Link>
        <Link href="/contracts">
          <StatCard label="Contracts expiring ≤60d" value={expiringContracts} tone={expiringContracts > 0 ? "warning" : "default"} />
        </Link>
        <Link href="/requests">
          <StatCard
            label="Credential acks pending"
            value={pendingDeliveries}
            tone={pendingDeliveries > 0 ? "info" : "default"}
          />
        </Link>
      </div>

      {failedNotifications > 0 ? (
        <div className="mt-4 rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm">
          <strong className="text-destructive">{failedNotifications} notification(s) failed to deliver.</strong>{" "}
          <Link href="/notifications" className="text-primary underline">
            Review the notification queue
          </Link>{" "}
          and verify SMTP settings.
        </div>
      ) : null}

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Recent requests</CardTitle>
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
                      {request.requestNumber}
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
