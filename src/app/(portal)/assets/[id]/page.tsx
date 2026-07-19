import { notFound } from "next/navigation";
import Link from "next/link";
import { requirePermission } from "@/shared/auth/guard";
import { db } from "@/shared/db";
import { PageHeader } from "@/shared/ui/page";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/shared/ui/table";
import { StatusBadge } from "@/shared/ui/badge";
import { formatDate, formatDateTime, fullName } from "@/shared/utils";
import { AssetDialog, AssetRowActions } from "../asset-dialogs";
import { AssetStatusControl } from "./asset-status-control";

export const dynamic = "force-dynamic";

/** Asset detail: overview, status control, assignment/maintenance history (SDS Doc 11). */
export default async function AssetDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { user } = await requirePermission("assets.view");
  const { id } = await params;

  const asset = await db.asset.findFirst({
    where: { id, deletedAt: null },
    include: {
      company: true,
      category: true,
      location: true,
      assignments: {
        where: { deletedAt: null },
        include: { person: true },
        orderBy: { assignedAt: "desc" },
      },
      maintenance: { where: { deletedAt: null }, orderBy: { startDate: "desc" } },
      disposal: { include: { document: true } },
    },
  });
  if (!asset) notFound();
  if (asset.companyId !== user.companyId && user.systemRoleKey !== "SYSTEM_ADMINISTRATOR") notFound();

  const canManage = user.permissions.has("assets.manage");
  const canAssign = user.permissions.has("assets.assignments.manage");
  const canMaintain = user.permissions.has("assets.maintenance.manage");
  const canDispose = user.permissions.has("assets.disposal.manage");

  const [companies, categories, locations, people, catalogItems, documents] = await Promise.all([
    db.company.findMany({
      where: { deletedAt: null, isActive: true },
      orderBy: { name: "asc" }, select: { id: true, name: true },
    }),
    db.assetCategory.findMany({
      where: { deletedAt: null, companyId: asset.companyId },
      orderBy: { name: "asc" }, select: { id: true, name: true, companyId: true },
    }),
    db.location.findMany({
      where: { deletedAt: null, isActive: true, companyId: asset.companyId },
      orderBy: { name: "asc" }, select: { id: true, name: true, companyId: true },
    }),
    db.person.findMany({
      where: { deletedAt: null, isActive: true, companyId: asset.companyId },
      orderBy: { lastName: "asc" }, select: { id: true, firstName: true, lastName: true },
    }),
    db.catalogItem.findMany({
      where: { deletedAt: null, isActive: true, kind: { in: ["MANUFACTURER", "ASSET_MODEL", "SUPPLIER"] } },
      orderBy: { name: "asc" },
      select: { id: true, kind: true, name: true, parentId: true },
    }),
    db.document.findMany({
      where: { companyId: asset.companyId },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: { id: true, name: true },
    }),
  ]);

  const catalogs = {
    manufacturers: catalogItems.filter((item) => item.kind === "MANUFACTURER"),
    models: catalogItems.filter((item) => item.kind === "ASSET_MODEL"),
    suppliers: catalogItems.filter((item) => item.kind === "SUPPLIER"),
  };
  const activeAssignment = asset.assignments.find((assignment) =>
    ["ASSIGNED", "PENDING"].includes(assignment.status),
  );
  const activeMaintenance = asset.maintenance.find((entry) => entry.status === "IN_PROGRESS");

  return (
    <div>
      <PageHeader
        title={asset.name || asset.assetTag || "Asset"}
        breadcrumbs={[{ label: "Assets", href: "/assets" }, { label: asset.name || asset.assetTag || "Asset" }]}
        description={`${asset.category.name} · ${asset.company.name}`}
        actions={
          <div className="flex items-center gap-2">
            <StatusBadge status={asset.status} />
            <AssetRowActions
              asset={{
                id: asset.id,
                companyId: asset.companyId,
                categoryId: asset.categoryId,
                name: asset.name,
                assetTag: asset.assetTag,
                serialNumber: asset.serialNumber,
                manufacturer: asset.manufacturer,
                model: asset.model,
                locationId: asset.locationId,
                supplier: asset.supplier,
                warrantyExpiry: asset.warrantyExpiry?.toISOString().slice(0, 10) ?? null,
                notes: asset.notes,
                status: asset.status,
              }}
              activeAssignmentId={activeAssignment?.id ?? null}
              activeMaintenanceId={activeMaintenance?.id ?? null}
              companies={companies}
              categories={categories}
              locations={locations}
              catalogs={catalogs}
              people={people.map((person) => ({ id: person.id, name: fullName(person) }))}
              documents={documents}
              permissions={{ canManage, canAssign, canMaintain, canDispose }}
            />
          </div>
        }
      />

      <div className="grid gap-5 lg:grid-cols-3">
        <Card>
          <CardHeader><CardTitle>Details</CardTitle></CardHeader>
          <CardContent>
            <dl className="space-y-2 text-sm">
              <Row label="Asset tag" value={asset.assetTag ?? "—"} />
              <Row label="Serial number" value={asset.serialNumber ?? "—"} />
              <Row label="Manufacturer" value={asset.manufacturer ?? "—"} />
              <Row label="Model" value={asset.model ?? "—"} />
              <Row label="Supplier" value={asset.supplier ?? "—"} />
              <Row label="Location" value={asset.location?.name ?? "—"} />
              <Row label="Purchase date" value={asset.purchaseDate ? formatDate(asset.purchaseDate) : "—"} />
              <Row label="Warranty expiry" value={asset.warrantyExpiry ? formatDate(asset.warrantyExpiry) : "—"} />
              <Row label="Notes" value={asset.notes ?? "—"} />
            </dl>
            {canManage && asset.status !== "DISCARDED" ? (
              <div className="mt-4 border-t pt-3">
                <AssetStatusControl
                  assetId={asset.id}
                  status={asset.status}
                  activeMaintenanceId={activeMaintenance?.id ?? null}
                  canMaintain={canMaintain}
                />
              </div>
            ) : null}
            {asset.disposal ? (
              <div className="mt-4 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">
                <p className="font-semibold text-destructive">Disposed {formatDate(asset.disposal.disposalDate)}</p>
                <p className="mt-1">{asset.disposal.method} — {asset.disposal.reason}</p>
                <a
                  href={`/api/documents/${asset.disposal.documentId}/download`}
                  className="mt-1 inline-block text-xs text-primary underline"
                >
                  Disposal document: {asset.disposal.document.name}
                </a>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Assignment history</CardTitle></CardHeader>
          <CardContent>
            {asset.assignments.length === 0 ? (
              <p className="text-sm text-muted-foreground">Never assigned.</p>
            ) : (
              <Table>
                <THead>
                  <TR><TH>Employee</TH><TH>Assigned</TH><TH>Returned</TH><TH>Acknowledged</TH><TH>Status</TH></TR>
                </THead>
                <TBody>
                  {asset.assignments.map((assignment) => (
                    <TR key={assignment.id}>
                      <TD>
                        <Link href={`/people/${assignment.personId}`} className="font-medium text-primary hover:underline">
                          {fullName(assignment.person)}
                        </Link>
                      </TD>
                      <TD>{formatDate(assignment.assignedAt)}</TD>
                      <TD>{assignment.returnedAt ? formatDate(assignment.returnedAt) : "—"}</TD>
                      <TD>{assignment.acknowledgedAt ? formatDate(assignment.acknowledgedAt) : "—"}</TD>
                      <TD><StatusBadge status={assignment.status} /></TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="mt-5">
        <CardHeader><CardTitle>Maintenance history</CardTitle></CardHeader>
        <CardContent>
          {asset.maintenance.length === 0 ? (
            <p className="text-sm text-muted-foreground">No maintenance recorded.</p>
          ) : (
            <Table>
              <THead>
                <TR><TH>Type</TH><TH>Description</TH><TH>Provider</TH><TH>Started</TH><TH>Completed</TH><TH>Status</TH></TR>
              </THead>
              <TBody>
                {asset.maintenance.map((entry) => (
                  <TR key={entry.id}>
                    <TD className="font-medium">{entry.maintenanceType}</TD>
                    <TD className="max-w-72 truncate">{entry.description}</TD>
                    <TD>{entry.serviceProvider ?? "—"}</TD>
                    <TD>{formatDate(entry.startDate)}</TD>
                    <TD>{entry.completionDate ? formatDateTime(entry.completionDate) : "—"}</TD>
                    <TD><StatusBadge status={entry.status} /></TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-b pb-2 last:border-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
  );
}
