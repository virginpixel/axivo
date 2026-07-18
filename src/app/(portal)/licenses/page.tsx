import { requirePermission } from "@/shared/auth/guard";
import { db } from "@/shared/db";
import { getLicenseAvailability } from "@/modules/licenses/service";
import { PageHeader, StatCard } from "@/shared/ui/page";
import { Table, THead, TBody, TR, TH, TD, EmptyState } from "@/shared/ui/table";
import { StatusBadge } from "@/shared/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { formatDate, fullName } from "@/shared/utils";
import { LicenseDialog, PurchaseDialog, LicenseAssignDialog, LicenseAssignmentActions } from "./license-dialogs";

export const metadata = { title: "Licenses" };
export const dynamic = "force-dynamic";

/** License management with availability tracking (SDS Doc 10). */
export default async function LicensesPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { user } = await requirePermission("licenses.view");
  const params = await searchParams;
  const q = params.q?.trim() ?? "";
  const isGlobalAdmin = user.systemRoleKey === "SYSTEM_ADMINISTRATOR";
  const canManage = user.permissions.has("licenses.manage");
  const canAssign = user.permissions.has("licenses.assignments.manage");
  const companyScope = isGlobalAdmin ? {} : { companyId: user.companyId };

  const [licenses, companies, applications, people, contracts] = await Promise.all([
    db.license.findMany({
      where: {
        deletedAt: null,
        ...companyScope,
        ...(q ? { name: { contains: q, mode: "insensitive" } } : {}),
      },
      orderBy: [{ company: { name: "asc" } }, { name: "asc" }],
      include: {
        company: { select: { name: true } },
        application: { select: { name: true } },
        contract: { select: { contractNumber: true } },
        purchases: { where: { deletedAt: null }, orderBy: { purchaseDate: "desc" } },
        assignments: {
          where: { deletedAt: null, status: { in: ["ACTIVE", "PENDING", "SUSPENDED"] } },
          include: { person: true },
          orderBy: { assignedAt: "desc" },
        },
      },
    }),
    db.company.findMany({
      where: { deletedAt: null, isActive: true, ...(isGlobalAdmin ? {} : { id: user.companyId }) },
      orderBy: { name: "asc" }, select: { id: true, name: true },
    }),
    db.application.findMany({
      where: { deletedAt: null, ...companyScope },
      orderBy: { name: "asc" }, select: { id: true, name: true, companyId: true },
    }),
    db.person.findMany({
      where: { deletedAt: null, isActive: true, ...companyScope },
      orderBy: { lastName: "asc" }, select: { id: true, firstName: true, lastName: true, companyId: true },
    }),
    db.contract.findMany({
      where: { deletedAt: null, ...companyScope },
      orderBy: { contractNumber: "asc" }, select: { id: true, contractNumber: true, name: true, companyId: true },
    }),
  ]);

  const availability = new Map<string, { purchased: number; assigned: number; available: number }>();
  for (const license of licenses) {
    availability.set(license.id, await getLicenseAvailability(license.id));
  }
  const totals = Array.from(availability.values()).reduce(
    (acc, entry) => ({
      purchased: acc.purchased + entry.purchased,
      assigned: acc.assigned + entry.assigned,
      available: acc.available + entry.available,
    }),
    { purchased: 0, assigned: 0, available: 0 },
  );
  const soon = new Date(Date.now() + 60 * 86_400_000);
  const expiringCount = licenses.filter((license) =>
    license.purchases.some((purchase) => purchase.expiryDate && purchase.expiryDate <= soon && purchase.expiryDate >= new Date()),
  ).length;

  const peopleByCompany: Record<string, { id: string; name: string }[]> = {};
  for (const person of people) {
    (peopleByCompany[person.companyId] ??= []).push({ id: person.id, name: fullName(person) });
  }

  return (
    <div>
      <PageHeader
        title="Licenses"
        description="Software licenses, purchases, renewals and seat availability."
        actions={
          canManage ? (
            <LicenseDialog companies={companies} applications={applications} contracts={contracts} />
          ) : undefined
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Purchased seats" value={totals.purchased} />
        <StatCard label="Assigned" value={totals.assigned} />
        <StatCard label="Available" value={totals.available} tone={totals.available <= 0 ? "warning" : "success"} />
        <StatCard label="Expiring ≤ 60 days" value={expiringCount} tone={expiringCount > 0 ? "warning" : "default"} />
      </div>

      <form method="get" className="mb-4 flex gap-2">
        <input name="q" defaultValue={q} placeholder="Search licenses…" aria-label="Search"
          className="h-9 w-full rounded-md border border-input bg-card px-3 text-sm sm:w-64" />
        <button type="submit" className="h-9 rounded-md border bg-card px-4 text-sm hover:bg-accent">Search</button>
      </form>

      {licenses.length === 0 ? (
        <EmptyState title="No licenses" description="Record license definitions and purchases to track seat availability." />
      ) : (
        <div className="space-y-4">
          {licenses.map((license) => {
            const stats = availability.get(license.id)!;
            return (
              <Card key={license.id}>
                <CardHeader>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <CardTitle>
                        {license.name}
                        <span className="ml-2 text-sm font-normal text-muted-foreground">
                          {license.application.name} · {license.company.name} · {license.licenseType.toLowerCase()}
                          {license.vendor ? ` · ${license.vendor}` : ""}
                          {license.contract ? ` · contract ${license.contract.contractNumber}` : ""}
                        </span>
                      </CardTitle>
                      <p className="mt-0.5 text-sm">
                        <span className="font-semibold">{stats.available}</span> available ·{" "}
                        {stats.assigned}/{stats.purchased} assigned
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusBadge status={license.status} />
                      {canManage ? (
                        <>
                          <PurchaseDialog licenseId={license.id} licenseType={license.licenseType} />
                          <LicenseDialog
                            companies={companies}
                            applications={applications}
                            contracts={contracts}
                            license={{
                              id: license.id,
                              companyId: license.companyId,
                              applicationId: license.applicationId,
                              name: license.name,
                              licenseType: license.licenseType,
                              vendor: license.vendor,
                              licenseKey: license.licenseKey,
                              contractId: license.contractId,
                              notes: license.notes,
                            }}
                          />
                        </>
                      ) : null}
                      {canAssign ? (
                        <LicenseAssignDialog
                          licenseId={license.id}
                          people={peopleByCompany[license.companyId] ?? []}
                          available={stats.available}
                        />
                      ) : null}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="grid gap-4 lg:grid-cols-2">
                  <div>
                    <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Purchases & renewals
                    </h3>
                    {license.purchases.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No purchases recorded.</p>
                    ) : (
                      <Table>
                        <THead><TR><TH>Type</TH><TH>Qty</TH><TH>Purchased</TH><TH>Expiry</TH></TR></THead>
                        <TBody>
                          {license.purchases.slice(0, 5).map((purchase) => (
                            <TR key={purchase.id}>
                              <TD>{purchase.purchaseType.replace(/_/g, " ").toLowerCase()}</TD>
                              <TD>{purchase.quantity}</TD>
                              <TD>{formatDate(purchase.purchaseDate)}</TD>
                              <TD>{purchase.expiryDate ? formatDate(purchase.expiryDate) : "—"}</TD>
                            </TR>
                          ))}
                        </TBody>
                      </Table>
                    )}
                  </div>
                  <div>
                    <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Active assignments
                    </h3>
                    {license.assignments.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No active assignments.</p>
                    ) : (
                      <Table>
                        <THead>
                          <TR><TH>Employee</TH><TH>Assigned</TH><TH>Status</TH>{canAssign ? <TH /> : null}</TR>
                        </THead>
                        <TBody>
                          {license.assignments.slice(0, 8).map((assignment) => (
                            <TR key={assignment.id}>
                              <TD>{fullName(assignment.person)}</TD>
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
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
