import { notFound } from "next/navigation";
import { requirePermission } from "@/shared/auth/guard";
import { db } from "@/shared/db";
import { getLicenseAvailability, getLicenseCoverage } from "@/modules/licenses/service";
import { PageHeader, StatCard, Pagination } from "@/shared/ui/page";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/shared/ui/table";
import { StatusBadge, Badge } from "@/shared/ui/badge";
import { formatDate, fullName } from "@/shared/utils";
import { UtilizationBar } from "@/shared/ui/utilization-bar";
import { LicenseAssignDialog, LicenseAssignmentActions, PurchaseDialog } from "../license-dialogs";

export const dynamic = "force-dynamic";

/** License detail: availability, full assignment history and purchases (SDS Doc 10). */
export default async function LicenseDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ hpage?: string }>;
}) {
  const { user } = await requirePermission("licenses.view");
  const { id } = await params;
  const { hpage } = await searchParams;
  // Removed assignments are history: they accumulate forever and are never the
  // reason someone opens this page, so they get their own paginated card.
  const historyPage = Math.max(1, Number(hpage) || 1);
  const historyPageSize = 10;
  const ACTIVE_ASSIGNMENT_STATUSES = ["PENDING", "ACTIVE", "SUSPENDED"] as const;

  const license = await db.license.findFirst({
    where: { id, deletedAt: null },
    include: {
      company: true,
      application: true,
      contract: true,
      purchases: { where: { deletedAt: null }, orderBy: { purchaseDate: "desc" } },
      assignments: {
        where: { deletedAt: null, status: { in: ["PENDING", "ACTIVE", "SUSPENDED"] } },
        include: { person: true },
        orderBy: { assignedAt: "desc" },
      },
    },
  });
  if (!license) notFound();
  if (!license.isShared && license.companyId !== user.companyId && user.systemRoleKey !== "SYSTEM_ADMINISTRATOR") notFound();

  const availability = await getLicenseAvailability(license.id);
  const coverage = getLicenseCoverage(license.purchases);
  const historyWhere = {
    licenseId: license.id,
    deletedAt: null,
    status: { notIn: [...ACTIVE_ASSIGNMENT_STATUSES] },
  };
  const [history, historyTotal] = await Promise.all([
    db.licenseAssignment.findMany({
      where: historyWhere,
      include: { person: true },
      orderBy: { removedAt: "desc" },
      skip: (historyPage - 1) * historyPageSize,
      take: historyPageSize,
    }),
    db.licenseAssignment.count({ where: historyWhere }),
  ]);
  const canManage = user.permissions.has("licenses.manage");
  const canAssign = user.permissions.has("licenses.assignments.manage");

  const people = canAssign
    ? await db.person.findMany({
        // Shared licenses can be assigned to anyone; company-scoped ones stay put.
        where: { ...(license.isShared ? {} : { companyId: license.companyId }), deletedAt: null, isActive: true },
        orderBy: { lastName: "asc" },
        select: { id: true, firstName: true, lastName: true },
      })
    : [];
  const vendorNames = canManage
    ? (await db.vendor.findMany({
        where: { deletedAt: null, isActive: true },
        orderBy: { name: "asc" },
        select: { name: true },
      })).map((vendor) => vendor.name)
    : [];

  return (
    <div>
      <PageHeader
        title={license.name}
        breadcrumbs={[{ label: "Licenses", href: "/licenses" }, { label: license.name }]}
        description={[
          license.application?.name ?? undefined,
          license.isShared ? "All companies" : license.company.name,
          license.licenseType.toLowerCase(),
          license.purchases[0]?.supplier ?? undefined,
        ]
          .filter(Boolean)
          .join(" · ")}
        actions={
          <div className="flex items-center gap-2">
            <StatusBadge status={license.status} />
            {coverage.expiresAt ? (
              <Badge
                variant={
                  coverage.state === "expired"
                    ? "destructive"
                    : coverage.state === "expiring"
                      ? "warning"
                      : "success"
                }
              >
                {coverage.state === "expired" ? "Expired" : "Covered until"} {formatDate(coverage.expiresAt)}
              </Badge>
            ) : null}
            {canManage ? <PurchaseDialog licenseId={license.id} licenseType={license.licenseType} vendors={vendorNames} /> : null}
            {canAssign ? (
              <LicenseAssignDialog
                licenseId={license.id}
                people={people.map((person) => ({ id: person.id, name: fullName(person) }))}
                available={availability.available}
              />
            ) : null}
          </div>
        }
      />

      <div className="mb-5 grid grid-cols-3 gap-4">
        <StatCard label="Purchased seats" value={availability.purchased} />
        <StatCard label="Available" value={availability.available} tone={availability.available <= 0 ? "warning" : "success"} />
        <StatCard label="Assigned" value={availability.assigned} />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Current assignments</CardTitle>
            <UtilizationBar used={availability.assigned} total={availability.purchased} className="mt-2 w-full" />
          </CardHeader>
          <CardContent>
            {license.assignments.length === 0 ? (
              <p className="text-sm text-muted-foreground">No one holds a seat on this license.</p>
            ) : (
              <Table>
                <THead>
                  <TR>
                    <TH>Employee</TH><TH>Assigned</TH><TH>Status</TH>
                    {canAssign ? <TH /> : null}
                  </TR>
                </THead>
                <TBody>
                  {license.assignments.map((assignment) => (
                    <TR key={assignment.id}>
                      <TD className="font-medium">{fullName(assignment.person)}</TD>
                      <TD>{formatDate(assignment.assignedAt)}</TD>
                      <TD><StatusBadge status={assignment.status} /></TD>
                      {canAssign ? (
                        <TD className="text-right">
                          <LicenseAssignmentActions assignmentId={assignment.id} status={assignment.status} />
                        </TD>
                      ) : null}
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Assignment history</CardTitle></CardHeader>
          <CardContent>
            {historyTotal === 0 ? (
              <p className="text-sm text-muted-foreground">No seats have been released yet.</p>
            ) : (
              <>
                <Table>
                  <THead>
                    <TR><TH>Employee</TH><TH>Assigned</TH><TH>Removed</TH><TH>Status</TH></TR>
                  </THead>
                  <TBody>
                    {history.map((assignment) => (
                      <TR key={assignment.id}>
                        <TD className="font-medium">{fullName(assignment.person)}</TD>
                        <TD>{formatDate(assignment.assignedAt)}</TD>
                        <TD>{assignment.removedAt ? formatDate(assignment.removedAt) : "-"}</TD>
                        <TD><StatusBadge status={assignment.status} /></TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
                <Pagination
                  page={historyPage}
                  pageCount={Math.max(1, Math.ceil(historyTotal / historyPageSize))}
                  total={historyTotal}
                  buildHref={(next) => `/licenses/${license.id}?hpage=${next}`}
                />
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Purchases & renewals</CardTitle></CardHeader>
          <CardContent>
            {license.purchases.length === 0 ? (
              <p className="text-sm text-muted-foreground">No purchases recorded.</p>
            ) : (
              <Table>
                <THead>
                  <TR><TH>Type</TH><TH>Qty</TH><TH>Purchased</TH><TH>Start</TH><TH>Expiry</TH><TH>Price</TH><TH>Supplier</TH></TR>
                </THead>
                <TBody>
                  {license.purchases.map((purchase) => (
                    <TR key={purchase.id}>
                      <TD>{purchase.purchaseType.replace(/_/g, " ").toLowerCase()}</TD>
                      <TD>{purchase.quantity}</TD>
                      <TD>{formatDate(purchase.purchaseDate)}</TD>
                      <TD>{purchase.startDate ? formatDate(purchase.startDate) : "None"}</TD>
                      <TD>{purchase.expiryDate ? formatDate(purchase.expiryDate) : "None"}</TD>
                      <TD>{purchase.price ? `${Number(purchase.price).toLocaleString()} ${purchase.currency ?? ""}` : "None"}</TD>
                      <TD>{purchase.supplier ?? "None"}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
            {license.licenseKey ? (
              <p className="mt-3 rounded-md bg-muted px-3 py-2 font-mono text-xs">
                License key: {license.licenseKey}
              </p>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
