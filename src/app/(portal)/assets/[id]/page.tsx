import { notFound } from "next/navigation";
import Link from "next/link";
import { requirePermission } from "@/shared/auth/guard";
import { db } from "@/shared/db";
import { PageHeader } from "@/shared/ui/page";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { TR, TH, TD } from "@/shared/ui/table";
import { PaginatedTable } from "@/shared/ui/paginated-table";
import { StatusBadge } from "@/shared/ui/badge";
import { formatDate, formatDateTime, fullName } from "@/shared/utils";
import { DISPOSAL_CATEGORY } from "@/modules/documents/categories";
import { AssetDialog, AssetRowActions } from "../asset-dialogs";
import { AssetStatusControl } from "./asset-status-control";
import { AssetTransferDialog } from "./asset-transfer-dialog";
import { AssetImageControl } from "./asset-image-control";

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
      // The discard form itself is listed once in the Documents card below.
      disposal: true,
    },
  });
  if (!asset) notFound();
  if (asset.companyId !== user.companyId && user.systemRoleKey !== "SYSTEM_ADMINISTRATOR") notFound();

  const canManage = user.permissions.has("assets.manage");
  const canAssign = user.permissions.has("assets.assignments.manage");
  const canMaintain = user.permissions.has("assets.maintenance.manage");
  const canDispose = user.permissions.has("assets.disposal.manage");

  // Transfers reach across companies, so locations, people and documents are
  // loaded for every company the user may see, not just the asset's own.
  const isGlobalAdmin = user.systemRoleKey === "SYSTEM_ADMINISTRATOR";
  const companyScope = isGlobalAdmin ? {} : { companyId: user.companyId };

  const [companies, categories, locations, people, manufacturers, models, vendors, documents, assetDocuments, otherAssets] =
    await Promise.all([
    db.company.findMany({
      where: { deletedAt: null, isActive: true, ...(isGlobalAdmin ? {} : { id: user.companyId }) },
      orderBy: { name: "asc" }, select: { id: true, name: true },
    }),
    db.assetCategory.findMany({
      where: { deletedAt: null },
      orderBy: { name: "asc" }, select: { id: true, name: true },
    }),
    db.location.findMany({
      where: { deletedAt: null, isActive: true, ...companyScope },
      orderBy: { name: "asc" }, select: { id: true, name: true, companyId: true },
    }),
    db.person.findMany({
      where: { deletedAt: null, isActive: true, ...companyScope },
      orderBy: { lastName: "asc" },
      select: { id: true, firstName: true, lastName: true, companyId: true, company: { select: { name: true } } },
    }),
    db.manufacturer.findMany({ where: { deletedAt: null, isActive: true }, orderBy: { name: "asc" }, select: { name: true } }),
    db.assetModel.findMany({
      where: { deletedAt: null, isActive: true },
      orderBy: { name: "asc" },
      include: {
        manufacturer: { select: { name: true } },
        fieldSet: { include: { fields: { orderBy: { sortOrder: "asc" }, include: { customField: true } } } },
      },
    }),
    db.vendor.findMany({ where: { deletedAt: null, isActive: true }, orderBy: { name: "asc" }, select: { name: true } }),
    // Only discard forms are offered in the discard dialog, so the picker stays
    // short instead of listing every document in the repository.
    db.document.findMany({
      where: { ...companyScope, category: { name: DISPOSAL_CATEGORY } },
      orderBy: { createdAt: "desc" },
      take: 200,
      select: { id: true, name: true, company: { select: { name: true } } },
    }),
    // Everything filed against this asset, including the discard form, which is
    // stored once and linked to every asset the same form covers.
    db.documentLink.findMany({
      where: { entityType: "asset", entityId: id, removedAt: null },
      orderBy: { createdAt: "desc" },
      include: { document: { select: { id: true, name: true, kind: true, createdAt: true } } },
    }),
    // Candidates for a batch discard: one signed form often covers many assets.
    db.asset.findMany({
      where: { deletedAt: null, id: { not: id }, status: { notIn: ["DISCARDED", "ASSIGNED"] }, ...companyScope },
      orderBy: { name: "asc" },
      take: 300,
      select: { id: true, name: true, assetTag: true, company: { select: { name: true } } },
    }),
  ]);

  const catalogs = {
    manufacturers: manufacturers.map((m) => ({ name: m.name })),
    models: models.map((m) => ({
      name: m.name,
      manufacturer: m.manufacturer?.name ?? null,
      fields: (m.fieldSet?.fields ?? []).map((f) => ({
        customFieldId: f.customFieldId,
        name: f.customField.name,
        format: f.customField.format,
        required: f.required,
        helpText: f.customField.helpText,
      })),
    })),
    vendors: vendors.map((v) => ({ name: v.name })),
  };
  // Custom field values to display, resolved against the asset's model fieldset.
  const assetModel = models.find((m) => m.name === asset.model);
  const assetCustomFields = (asset.customFields as Record<string, string> | null) ?? {};
  const customFieldRows = (assetModel?.fieldSet?.fields ?? []).map((f) => ({
    label: f.customField.name,
    value: assetCustomFields[f.customFieldId] ?? "None",
  }));
  const activeAssignment = asset.assignments.find((assignment) =>
    ["ASSIGNED", "PENDING"].includes(assignment.status),
  );
  const activeMaintenance = asset.maintenance.find((entry) => entry.status === "IN_PROGRESS");
  const peopleOptions = people.map((person) => ({
    id: person.id,
    name: fullName(person),
    companyId: person.companyId,
    companyName: person.company.name,
  }));
  const documentOptions = documents.map((document) => ({
    id: document.id,
    name: `${document.name} (${document.company.name})`,
  }));
  const discardCandidates = otherAssets.map((candidate) => ({
    id: candidate.id,
    name: candidate.name,
    assetTag: candidate.assetTag,
    companyName: candidate.company.name,
  }));

  return (
    <div>
      <PageHeader
        title={asset.name || asset.assetTag || "Asset"}
        breadcrumbs={[{ label: "Assets", href: "/assets" }, { label: asset.name || asset.assetTag || "Asset" }]}
        description={`${asset.category.name} · ${asset.company.name}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={asset.status} />
            {canManage && asset.status !== "DISCARDED" ? (
              <AssetStatusControl
                asset={{ id: asset.id, name: asset.name, companyId: asset.companyId, status: asset.status }}
                activeMaintenanceId={activeMaintenance?.id ?? null}
                canMaintain={canMaintain}
                canDispose={canDispose}
                otherAssets={discardCandidates}
                documents={documentOptions}
              />
            ) : null}
            {canManage && asset.status !== "DISCARDED" ? (
              <AssetTransferDialog
                asset={{ id: asset.id, name: asset.name, companyId: asset.companyId, locationId: asset.locationId }}
                companies={companies}
                locations={locations}
                people={peopleOptions}
                currentHolder={
                  activeAssignment
                    ? { assignmentId: activeAssignment.id, name: fullName(activeAssignment.person) }
                    : null
                }
              />
            ) : null}
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
                customFields: assetCustomFields,
              }}
              activeAssignmentId={activeAssignment?.id ?? null}
              activeMaintenanceId={activeMaintenance?.id ?? null}
              companies={companies}
              categories={categories}
              locations={locations}
              catalogs={catalogs}
              people={peopleOptions.map((person) => ({ id: person.id, name: person.name }))}
              permissions={{ canManage, canAssign, canMaintain, canDispose }}
            />
          </div>
        }
      />

      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Details</CardTitle></CardHeader>
          <CardContent>
            <dl className="grid grid-cols-1 gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
              <Row label="Asset tag" value={asset.assetTag ?? "None"} />
              <Row label="Serial number" value={asset.serialNumber ?? "None"} />
              <Row label="Manufacturer" value={asset.manufacturer ?? "None"} />
              <Row label="Model" value={asset.model ?? "None"} />
              <Row label="Vendor" value={asset.supplier ?? "None"} />
              <Row label="Location" value={asset.location?.name ?? "None"} />
              <Row label="Purchase date" value={asset.purchaseDate ? formatDate(asset.purchaseDate) : "None"} />
              <Row label="Warranty expiry" value={asset.warrantyExpiry ? formatDate(asset.warrantyExpiry) : "None"} />
              {customFieldRows.map((row) => (
                <Row key={row.label} label={row.label} value={row.value} />
              ))}
            </dl>
            {asset.notes ? <p className="mt-3 border-t pt-3 text-sm">{asset.notes}</p> : null}
            {asset.disposal ? (
              <div className="mt-4 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">
                <p className="font-semibold text-destructive">Disposed {formatDate(asset.disposal.disposalDate)}</p>
                <p className="mt-1">{asset.disposal.method}: {asset.disposal.reason}</p>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Image</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {(asset.imagePath || assetModel?.imagePath) ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={`/api/assets/${asset.id}/image`}
                alt={asset.name || "Asset"}
                className="max-h-56 w-full rounded-md border object-contain"
              />
            ) : (
              <div className="flex h-40 items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
                No image
              </div>
            )}
            {canManage && asset.status !== "DISCARDED" ? (
              <AssetImageControl
                assetId={asset.id}
                hasOverride={!!asset.imagePath}
                hasModelImage={!!assetModel?.imagePath}
              />
            ) : null}
          </CardContent>
        </Card>
      </div>

      <Card className="mt-5">
        <CardHeader><CardTitle>Documents</CardTitle></CardHeader>
        <CardContent>
          <PaginatedTable
            emptyMessage="No documents linked to this asset."
            headers={<><TH>Document</TH><TH>Added</TH><TH className="text-right">File</TH></>}
            rows={assetDocuments.map((link) => ({
              key: link.id,
              node: (
                <TR>
                  <TD className="font-medium">{link.document.name}</TD>
                  <TD>{formatDate(link.createdAt)}</TD>
                  <TD className="text-right">
                    <a href={`/api/documents/${link.document.id}/download`} className="text-primary hover:underline">
                      Open
                    </a>
                  </TD>
                </TR>
              ),
            }))}
          />
        </CardContent>
      </Card>

      <Card className="mt-5">
        <CardHeader><CardTitle>Assignment history</CardTitle></CardHeader>
        <CardContent>
          <PaginatedTable
            emptyMessage="Never assigned."
            headers={<><TH>Employee</TH><TH>Assigned</TH><TH>Returned</TH><TH>Acknowledged</TH><TH>Status</TH></>}
            rows={asset.assignments.map((assignment) => ({
              key: assignment.id,
              node: (
                <TR>
                  <TD>
                    <Link href={`/people/${assignment.personId}`} className="font-medium text-primary hover:underline">
                      {fullName(assignment.person)}
                    </Link>
                  </TD>
                  <TD>{formatDate(assignment.assignedAt)}</TD>
                  <TD>{assignment.returnedAt ? formatDate(assignment.returnedAt) : "None"}</TD>
                  <TD>{assignment.acknowledgedAt ? formatDate(assignment.acknowledgedAt) : "None"}</TD>
                  <TD><StatusBadge status={assignment.status} /></TD>
                </TR>
              ),
            }))}
          />
        </CardContent>
      </Card>

      <Card className="mt-5">
        <CardHeader><CardTitle>Maintenance history</CardTitle></CardHeader>
        <CardContent>
          <PaginatedTable
            emptyMessage="No maintenance recorded."
            headers={<><TH>Type</TH><TH>Description</TH><TH>Provider</TH><TH>Started</TH><TH>Completed</TH><TH>Status</TH></>}
            rows={asset.maintenance.map((entry) => ({
              key: entry.id,
              node: (
                <TR>
                  <TD className="font-medium">{entry.maintenanceType}</TD>
                  <TD className="max-w-72 truncate">{entry.description}</TD>
                  <TD>{entry.serviceProvider ?? "None"}</TD>
                  <TD>{formatDate(entry.startDate)}</TD>
                  <TD>{entry.completionDate ? formatDateTime(entry.completionDate) : "None"}</TD>
                  <TD><StatusBadge status={entry.status} /></TD>
                </TR>
              ),
            }))}
          />
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
