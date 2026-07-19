import { notFound } from "next/navigation";
import { requirePermission } from "@/shared/auth/guard";
import { db } from "@/shared/db";
import { getLicenseAvailability } from "@/modules/licenses/service";
import { PageHeader, StatCard } from "@/shared/ui/page";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/shared/ui/table";
import { StatusBadge } from "@/shared/ui/badge";
import { formatDate, fullName } from "@/shared/utils";
import { LicenseAssignDialog, LicenseAssignmentActions, PurchaseDialog } from "../license-dialogs";

export const dynamic = "force-dynamic";

/** License detail: availability, full assignment history and purchases (SDS Doc 10). */
export default async function LicenseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { user } = await requirePermission("licenses.view");
  const { id } = await params;

  const license = await db.license.findFirst({
    where: { id, deletedAt: null },
    include: {
      company: true,
      application: true,
      contract: true,
      purchases: { where: { deletedAt: null }, orderBy: { purchaseDate: "desc" } },
      assignments: {
        where: { deletedAt: null },
        include: { person: true },
        orderBy: { assignedAt: "desc" },
      },
    },
  });
  if (!license) notFound();
  if (license.companyId !== user.companyId && user.systemRoleKey !== "SYSTEM_ADMINISTRATOR") notFound();

  const availability = await getLicenseAvailability(license.id);
  const canManage = user.permissions.has("licenses.manage");
  const canAssign = user.permissions.has("licenses.assignments.manage");

  const people = canAssign
    ? await db.person.findMany({
        where: { companyId: license.companyId, deletedAt: null, isActive: true },
        orderBy: { lastName: "asc" },
        select: { id: true, firstName: true, lastName: true },
      })
    : [];

  return (
    <div>
      <PageHeader
        title={license.name}
        breadcrumbs={[{ label: "Licenses", href: "/licenses" }, { label: license.name }]}
        description={[
          license.application?.name ?? "Standalone license",
          license.company.name,
          license.licenseType.toLowerCase(),
          license.vendor ?? undefined,
        ]
          .filter(Boolean)
          .join(" · ")}
        actions={
          <div className="flex items-center gap-2">
            <StatusBadge status={license.status} />
            {canManage ? <PurchaseDialog licenseId={license.id} licenseType={license.licenseType} /> : null}
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
          <CardHeader><CardTitle>Assignments</CardTitle></CardHeader>
          <CardContent>
            {license.assignments.length === 0 ? (
              <p className="text-sm text-muted-foreground">No assignments yet.</p>
            ) : (
              <Table>
                <THead>
                  <TR>
                    <TH>Employee</TH><TH>Assigned</TH><TH>Removed</TH><TH>Status</TH>
                    {canAssign ? <TH /> : null}
                  </TR>
                </THead>
                <TBody>
                  {license.assignments.map((assignment) => (
                    <TR key={assignment.id}>
                      <TD className="font-medium">{fullName(assignment.person)}</TD>
                      <TD>{formatDate(assignment.assignedAt)}</TD>
                      <TD>{assignment.removedAt ? formatDate(assignment.removedAt) : "—"}</TD>
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
                      <TD>{purchase.startDate ? formatDate(purchase.startDate) : "—"}</TD>
                      <TD>{purchase.expiryDate ? formatDate(purchase.expiryDate) : "—"}</TD>
                      <TD>{purchase.price ? `${Number(purchase.price).toLocaleString()} ${purchase.currency ?? ""}` : "—"}</TD>
                      <TD>{purchase.supplier ?? "—"}</TD>
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
