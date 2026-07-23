import Link from "next/link";
import { requirePermission } from "@/shared/auth/guard";
import { db } from "@/shared/db";
import { PageHeader, StatCard, Pagination } from "@/shared/ui/page";
import { Table, THead, TBody, TR, TH, TD, EmptyState } from "@/shared/ui/table";
import { StatusBadge } from "@/shared/ui/badge";
import { Input, Select } from "@/shared/ui/input";
import { LiveSearch } from "@/shared/ui/live-search";
import { fullName, formatDate } from "@/shared/utils";
import { AssetDialog, AssetRowActions } from "./asset-dialogs";
import type { Prisma, AssetStatus } from "@prisma/client";

export const metadata = { title: "Assets" };
export const dynamic = "force-dynamic";

const ASSET_STATUSES: AssetStatus[] = ["AVAILABLE", "ASSIGNED", "UNDER_REPAIR", "OUT_OF_ORDER", "RESERVED", "DISCARDED"];

/** Asset management (SDS Doc 11). Categories and catalogs are managed in Settings. */
export default async function AssetsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; category?: string; page?: string }>;
}) {
  const { user } = await requirePermission("assets.view");
  const params = await searchParams;
  const q = params.q?.trim() ?? "";
  const page = Math.max(1, Number(params.page) || 1);
  const pageSize = 25;
  const isGlobalAdmin = user.systemRoleKey === "SYSTEM_ADMINISTRATOR";
  const canManage = user.permissions.has("assets.manage");
  const canAssign = user.permissions.has("assets.assignments.manage");
  const canMaintain = user.permissions.has("assets.maintenance.manage");
  const canDispose = user.permissions.has("assets.disposal.manage");
  const companyScope = isGlobalAdmin ? {} : { companyId: user.companyId };

  const where: Prisma.AssetWhereInput = {
    deletedAt: null,
    ...companyScope,
    ...(params.status && ASSET_STATUSES.includes(params.status as AssetStatus)
      ? { status: params.status as AssetStatus }
      : {}),
    ...(params.category ? { categoryId: params.category } : {}),
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { assetTag: { contains: q, mode: "insensitive" } },
            { serialNumber: { contains: q, mode: "insensitive" } },
            { manufacturer: { contains: q, mode: "insensitive" } },
            { model: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [assets, total, categories, companies, locations, people, statusCounts, catalogItems] =
    await Promise.all([
      db.asset.findMany({
        where,
        orderBy: { name: "asc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          company: { select: { name: true } },
          category: true,
          location: { select: { name: true } },
          assignments: {
            where: { status: { in: ["ASSIGNED", "PENDING"] }, deletedAt: null },
            include: { person: true },
            take: 1,
          },
          maintenance: {
            where: { status: "IN_PROGRESS", deletedAt: null },
            orderBy: { startDate: "desc" },
            take: 1,
            select: { id: true },
          },
        },
      }),
      db.asset.count({ where }),
      db.assetCategory.findMany({
        where: { deletedAt: null },
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      }),
      db.company.findMany({
        where: { deletedAt: null, isActive: true, ...(isGlobalAdmin ? {} : { id: user.companyId }) },
        orderBy: { name: "asc" }, select: { id: true, name: true },
      }),
      db.location.findMany({
        where: { deletedAt: null, isActive: true, ...companyScope },
        orderBy: { name: "asc" }, select: { id: true, name: true, companyId: true },
      }),
      db.person.findMany({
        where: { deletedAt: null, isActive: true, ...companyScope },
        orderBy: { lastName: "asc" }, select: { id: true, firstName: true, lastName: true, companyId: true },
      }),
      db.asset.groupBy({ by: ["status"], where: { deletedAt: null, ...companyScope }, _count: true }),
      db.assetModel.findMany({
        where: { deletedAt: null, isActive: true },
        orderBy: { name: "asc" },
        include: {
          manufacturer: { select: { name: true } },
          fieldSet: { include: { fields: { orderBy: { sortOrder: "asc" }, include: { customField: true } } } },
        },
      }),
    ]);

  const [manufacturerList, vendorList] = await Promise.all([
    db.manufacturer.findMany({ where: { deletedAt: null, isActive: true }, orderBy: { name: "asc" }, select: { name: true } }),
    db.vendor.findMany({ where: { deletedAt: null, isActive: true }, orderBy: { name: "asc" }, select: { name: true } }),
  ]);

  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const counts = Object.fromEntries(statusCounts.map((entry) => [entry.status, entry._count]));
  const peopleByCompany: Record<string, { id: string; name: string }[]> = {};
  for (const person of people) {
    (peopleByCompany[person.companyId] ??= []).push({ id: person.id, name: fullName(person) });
  }
  const catalogs = {
    manufacturers: manufacturerList.map((m) => ({ name: m.name })),
    models: catalogItems.map((m) => ({
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
    vendors: vendorList.map((v) => ({ name: v.name })),
  };
  const categoryOptions = categories.map((category) => ({
    id: category.id,
    name: category.name,
  }));

  return (
    <div>
      <PageHeader
        title="Assets"
        description="Company assets across their full lifecycle. Categories, manufacturers, models and suppliers are managed in Settings."
        actions={
          canManage ? (
            <AssetDialog
              companies={companies}
              categories={categoryOptions}
              locations={locations}
              catalogs={catalogs}
              people={people.map((person) => ({ id: person.id, name: fullName(person), companyId: person.companyId }))}
            />
          ) : undefined
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Available" value={counts.AVAILABLE ?? 0} tone="success" />
        <StatCard label="Assigned" value={counts.ASSIGNED ?? 0} tone="info" />
        <StatCard label="Under repair / out of order" value={(counts.UNDER_REPAIR ?? 0) + (counts.OUT_OF_ORDER ?? 0)} tone="warning" />
        <StatCard label="Discarded" value={counts.DISCARDED ?? 0} />
      </div>

      <div className="mb-4 flex flex-wrap items-end gap-2">
        <LiveSearch placeholder="Search name, tag, serial, model" className="w-full sm:w-64" />
        <form method="get" className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="q" value={q} />
          <Select name="status" defaultValue={params.status ?? ""} className="w-full sm:w-44" aria-label="Filter by status">
            <option value="">All statuses</option>
            {ASSET_STATUSES.map((status) => (
              <option key={status} value={status}>{status.replace(/_/g, " ")}</option>
            ))}
          </Select>
          <Select name="category" defaultValue={params.category ?? ""} className="w-full sm:w-44" aria-label="Filter by category">
            <option value="">All categories</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>{category.name}</option>
            ))}
          </Select>
          <button type="submit" className="h-9 rounded-md border bg-card px-4 text-sm hover:bg-accent">Filter</button>
        </form>
      </div>

      {assets.length === 0 ? (
        <EmptyState title="No assets found" description="Register company assets to track assignment, maintenance and disposal." />
      ) : (
        <>
          <Table>
            <THead>
              <TR>
                <TH>Asset</TH><TH>Category</TH><TH>Manufacturer / model</TH><TH>Serial</TH><TH>Assigned to</TH><TH>Warranty</TH><TH>Status</TH>
                <TH className="text-right">Actions</TH>
              </TR>
            </THead>
            <TBody>
              {assets.map((asset) => {
                const activeAssignment = asset.assignments[0];
                return (
                  <TR key={asset.id}>
                    <TD>
                      <Link href={`/assets/${asset.id}`} className="font-medium text-primary hover:underline">
                        {asset.name || asset.assetTag || "Unnamed asset"}
                      </Link>
                      {asset.assetTag ? (
                        <p className="text-xs text-muted-foreground">{asset.assetTag}</p>
                      ) : null}
                    </TD>
                    <TD>{asset.category.name}</TD>
                    <TD>{[asset.manufacturer, asset.model].filter(Boolean).join(" ") || "None"}</TD>
                    <TD>{asset.serialNumber ?? "None"}</TD>
                    <TD>{activeAssignment ? fullName(activeAssignment.person) : "None"}</TD>
                    <TD>{asset.warrantyExpiry ? formatDate(asset.warrantyExpiry) : "None"}</TD>
                    <TD><StatusBadge status={asset.status} /></TD>
                    <TD className="text-right">
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
                          customFields: (asset.customFields as Record<string, string> | null) ?? null,
                        }}
                        activeAssignmentId={activeAssignment?.id ?? null}
                        activeMaintenanceId={asset.maintenance[0]?.id ?? null}
                        companies={companies}
                        categories={categoryOptions}
                        locations={locations}
                        catalogs={catalogs}
                        people={peopleByCompany[asset.companyId] ?? []}
                        permissions={{ canManage, canAssign, canMaintain, canDispose }}
                      />
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
          <Pagination
            page={page}
            pageCount={pageCount}
            total={total}
            buildHref={(p) => {
              const search = new URLSearchParams();
              if (q) search.set("q", q);
              if (params.status) search.set("status", params.status);
              if (params.category) search.set("category", params.category);
              search.set("page", String(p));
              return `/assets?${search.toString()}`;
            }}
          />
        </>
      )}
    </div>
  );
}
