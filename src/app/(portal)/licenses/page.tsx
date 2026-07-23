import Link from "next/link";
import { requirePermission } from "@/shared/auth/guard";
import { db } from "@/shared/db";
import { getLicenseAvailability } from "@/modules/licenses/service";
import { PageHeader, StatCard, Pagination } from "@/shared/ui/page";
import { Table, THead, TBody, TR, TH, TD, EmptyState } from "@/shared/ui/table";
import { StatusBadge } from "@/shared/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { formatDate, fullName } from "@/shared/utils";
import { LiveSearch } from "@/shared/ui/live-search";
import { LicenseDialog, PurchaseDialog, LicenseAssignDialog } from "./license-dialogs";

export const metadata = { title: "Licenses" };
export const dynamic = "force-dynamic";

/** License management with availability tracking (SDS Doc 10). */
export default async function LicensesPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  const { user } = await requirePermission("licenses.view");
  const params = await searchParams;
  const q = params.q?.trim() ?? "";
  const page = Math.max(1, Number(params.page) || 1);
  const pageSize = 25;
  const isGlobalAdmin = user.systemRoleKey === "SYSTEM_ADMINISTRATOR";
  const canManage = user.permissions.has("licenses.manage");
  const canAssign = user.permissions.has("licenses.assignments.manage");
  const companyScope = isGlobalAdmin ? {} : { companyId: user.companyId };

  const licenseWhere = {
    deletedAt: null,
    ...companyScope,
    ...(q ? { name: { contains: q, mode: "insensitive" as const } } : {}),
  };
  const [licenses, licenseTotal, companies, applications, people, contracts, vendorItems] = await Promise.all([
    db.license.findMany({
      where: licenseWhere,
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: [{ company: { name: "asc" } }, { name: "asc" }],
      include: {
        company: { select: { name: true } },
        application: { select: { name: true } },
        contract: { select: { contractNumber: true, name: true } },
        purchases: { where: { deletedAt: null }, orderBy: { purchaseDate: "desc" } },
      },
    }),
    db.license.count({ where: licenseWhere }),
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
    db.catalogItem.findMany({
      where: { deletedAt: null, isActive: true, kind: "VENDOR" },
      orderBy: { name: "asc" }, select: { name: true },
    }),
  ]);
  const vendors = vendorItems.map((item) => item.name);

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
            <LicenseDialog companies={companies} applications={applications} contracts={contracts} vendors={vendors} />
          ) : undefined
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Purchased seats" value={totals.purchased} />
        <StatCard label="Available" value={totals.available} tone={totals.available <= 0 ? "warning" : "success"} />
        <StatCard label="Assigned" value={totals.assigned} />
        <StatCard label="Expiring ≤ 60 days" value={expiringCount} tone={expiringCount > 0 ? "warning" : "default"} />
      </div>

      <div className="mb-4">
        <LiveSearch placeholder="Search licenses" />
      </div>

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
                        <Link href={`/licenses/${license.id}`} className="hover:underline">
                          {license.name}
                        </Link>
                        <span className="ml-2 text-sm font-normal text-muted-foreground">
                          {license.application ? `${license.application.name} · ` : ""}
                          {license.company.name} · {license.licenseType.toLowerCase()}
                          {license.vendor ? ` · ${license.vendor}` : ""}
                          {license.contract ? ` · contract ${license.contract.contractNumber ?? license.contract.name}` : ""}
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
                            vendors={vendors}
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
                <CardContent className="flex items-center justify-between py-3">
                  <p className="text-sm text-muted-foreground">
                    {stats.purchased} seat(s) purchased across {license.purchases.length} purchase(s).
                  </p>
                  <Link href={`/licenses/${license.id}`} className="text-xs text-primary hover:underline">
                    View purchases &amp; assignments
                  </Link>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
      <Pagination
        page={page}
        pageCount={Math.max(1, Math.ceil(licenseTotal / pageSize))}
        total={licenseTotal}
        buildHref={(next) => {
          const search = new URLSearchParams();
          if (q) search.set("q", q);
          search.set("page", String(next));
          return `/licenses?${search.toString()}`;
        }}
      />
    </div>
  );
}
