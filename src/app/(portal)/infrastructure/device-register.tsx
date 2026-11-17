import Link from "next/link";
import { db } from "@/shared/db";
import type { AuthenticatedUser } from "@/shared/auth/session";
import { PageHeader, StatCard, Pagination } from "@/shared/ui/page";
import { Table, THead, TBody, TR, TH, TD, EmptyState } from "@/shared/ui/table";
import { StatusBadge } from "@/shared/ui/badge";
import { Select } from "@/shared/ui/input";
import { LiveSearch } from "@/shared/ui/live-search";
import { enumLabel } from "@/shared/utils";
import { DEVICE_STATUSES, KIND_PATHS, type DeviceKind, type DeviceStatus } from "@/modules/infrastructure/validators";
import type { Prisma } from "@prisma/client";
import { loadDeviceCatalogs, locationPath } from "./catalogs";
import { DeviceDialog } from "./device-dialogs";
import { AssetLinkDialog } from "./asset-link-dialog";

export interface RegisterParams {
  q?: string;
  company?: string;
  type?: string;
  status?: string;
  page?: string;
}

const PAGE_SIZE = 50;

/** One register page: network devices or servers & hosts (SDS Doc 24). */
export async function DeviceRegister({
  kind,
  user,
  params,
}: {
  kind: DeviceKind;
  user: AuthenticatedUser;
  params: RegisterParams;
}) {
  const isGlobalAdmin = user.systemRoleKey === "SYSTEM_ADMINISTRATOR";
  const canManage = user.permissions.has("infrastructure.manage");
  const companyScope = isGlobalAdmin ? {} : { companyId: user.companyId };
  const q = params.q?.trim() ?? "";
  const page = Math.max(1, Number(params.page) || 1);
  const status = DEVICE_STATUSES.includes(params.status as DeviceStatus) ? (params.status as DeviceStatus) : undefined;
  const isServer = kind === "SERVER";

  const where: Prisma.InfraDeviceWhereInput = {
    deletedAt: null,
    kind,
    ...companyScope,
    ...(isGlobalAdmin && params.company ? { companyId: params.company } : {}),
    ...(params.type ? { typeId: params.type } : {}),
    // Decommissioned devices stay on record but out of the way unless asked for.
    ...(status ? { status } : { status: { not: "DECOMMISSIONED" } }),
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { hostname: { contains: q, mode: "insensitive" } },
            { ipAddress: { startsWith: q } },
            { serialNumber: { contains: q, mode: "insensitive" } },
            { model: { contains: q, mode: "insensitive" } },
            { operatingSystem: { contains: q, mode: "insensitive" } },
            { purpose: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [devices, total, counts, catalogs, allLocations] = await Promise.all([
    db.infraDevice.findMany({
      where,
      orderBy: [{ name: "asc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        company: { select: { name: true } },
        type: { select: { name: true } },
        manufacturer: { select: { name: true } },
        host: { select: { id: true, name: true } },
        applications: { select: { applicationId: true } },
        asset: { select: { id: true, name: true, assetTag: true } },
        _count: { select: { credentials: true } },
      },
    }),
    db.infraDevice.count({ where }),
    db.infraDevice.groupBy({
      by: ["status"],
      where: { deletedAt: null, kind, ...companyScope, ...(isGlobalAdmin && params.company ? { companyId: params.company } : {}) },
      _count: { _all: true },
    }),
    loadDeviceCatalogs(user),
    db.location.findMany({ where: { deletedAt: null, ...companyScope }, select: { id: true, name: true, parentId: true } }),
  ]);
  const countOf = (s: DeviceStatus) => counts.find((c) => c.status === s)?._count._all ?? 0;
  const typesOfKind = catalogs.types.filter((type) => type.kind === kind);

  const title = isServer ? "Servers & hosts" : "Network devices";
  const basePath = KIND_PATHS[kind];

  return (
    <div>
      <PageHeader
        title={title}
        description={
          isServer
            ? "Physical servers, virtual machines, storage and appliances, with the applications they run and the logins that manage them."
            : "Switches, firewalls, routers and wireless controllers, with their firmware and the logins that manage them."
        }
        actions={
          canManage ? (
            <div className="flex flex-wrap items-center gap-2">
              <AssetLinkDialog kind={kind} categories={catalogs.canCreateAssets ? catalogs.assetCategories : []} />
              <DeviceDialog kind={kind} catalogs={catalogs} />
            </div>
          ) : undefined
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-3">
        <StatCard label="Active" value={countOf("ACTIVE")} tone="success" />
        <StatCard label="Standby" value={countOf("STANDBY")} hint="Kept off until needed" />
        <StatCard label="Decommissioned" value={countOf("DECOMMISSIONED")} hint="Hidden unless filtered" />
      </div>

      <div className="mb-4 flex flex-wrap items-end gap-2">
        <LiveSearch placeholder="Search name, IP, serial, model" className="w-full sm:w-72" />
        <form method="get" className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="q" value={q} />
          {isGlobalAdmin ? (
            <Select name="company" defaultValue={params.company ?? ""} className="w-full sm:w-44" aria-label="Filter by company">
              <option value="">All companies</option>
              {catalogs.companies.map((company) => (
                <option key={company.id} value={company.id}>{company.name}</option>
              ))}
            </Select>
          ) : null}
          <Select name="type" defaultValue={params.type ?? ""} className="w-full sm:w-44" aria-label="Filter by type">
            <option value="">All types</option>
            {typesOfKind.map((type) => (
              <option key={type.id} value={type.id}>{type.name}</option>
            ))}
          </Select>
          <Select name="status" defaultValue={params.status ?? ""} className="w-full sm:w-44" aria-label="Filter by status">
            <option value="">In service</option>
            {DEVICE_STATUSES.map((value) => (
              <option key={value} value={value}>{enumLabel(value)}</option>
            ))}
          </Select>
          <button type="submit" className="h-9 rounded-full border border-input bg-card px-4 text-sm font-medium transition-colors hover:border-primary/40 hover:bg-accent hover:text-accent-foreground">Filter</button>
        </form>
      </div>

      {devices.length === 0 ? (
        <EmptyState
          title={q || params.type || params.status || params.company ? "Nothing matches" : `No ${title.toLowerCase()} yet`}
          description={
            q || params.type || params.status || params.company
              ? "Try another search or filter."
              : canManage
                ? "Add one here, or bring in your spreadsheet from the Import tab."
                : "Nothing has been recorded yet."
          }
        />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Name</TH>
              <TH>Type</TH>
              <TH>IP address</TH>
              {isGlobalAdmin ? <TH>Company</TH> : null}
              <TH>Location</TH>
              <TH>Make / model</TH>
              <TH>{isServer ? "OS" : "Firmware"}</TH>
              {isServer ? <TH>Runs on</TH> : null}
              <TH>Logins</TH>
              <TH>Status</TH>
              {canManage ? <TH className="text-right">Actions</TH> : null}
            </TR>
          </THead>
          <TBody>
            {devices.map((device) => (
              <TR key={device.id}>
                <TD>
                  <Link href={`/infrastructure/devices/${device.id}`} className="font-medium text-foreground hover:underline">
                    {device.name}
                  </Link>
                  {device.hostname ? <p className="max-w-56 truncate text-xs text-muted-foreground">{device.hostname}</p> : null}
                  {device.asset ? (
                    <Link href={`/assets/${device.asset.id}`} className="block max-w-56 truncate text-xs text-muted-foreground hover:underline">
                      Asset {device.asset.assetTag ?? device.asset.name}
                    </Link>
                  ) : null}
                </TD>
                <TD>{device.type.name}</TD>
                <TD className="font-mono text-xs tabular-nums">{device.ipAddress ?? "None"}</TD>
                {isGlobalAdmin ? <TD>{device.company.name}</TD> : null}
                <TD className="text-xs">{device.locationId ? locationPath(device.locationId, allLocations) : "None"}</TD>
                <TD>
                  {device.manufacturer?.name ?? ""}
                  {device.model ? <p className="text-xs text-muted-foreground">{device.model}</p> : null}
                  {!device.manufacturer && !device.model ? "None" : null}
                </TD>
                <TD className="text-xs">
                  {isServer ? (
                    <>
                      {device.operatingSystem ?? "None"}
                      {device.version ? <p className="text-muted-foreground">{device.version}</p> : null}
                    </>
                  ) : (
                    <>
                      {device.version ?? "None"}
                      {device.operatingSystem ? <p className="text-muted-foreground">{device.operatingSystem}</p> : null}
                    </>
                  )}
                </TD>
                {isServer ? (
                  <TD className="text-xs">
                    {device.host ? (
                      <Link href={`/infrastructure/devices/${device.host.id}`} className="hover:underline">{device.host.name}</Link>
                    ) : "None"}
                  </TD>
                ) : null}
                <TD className="tabular-nums">{device._count.credentials || "None"}</TD>
                <TD><StatusBadge status={device.status} /></TD>
                {canManage ? (
                  <TD className="text-right">
                    <DeviceDialog
                      kind={kind}
                      catalogs={catalogs}
                      device={{
                        id: device.id,
                        companyId: device.companyId,
                        typeId: device.typeId,
                        name: device.name,
                        hostname: device.hostname,
                        ipAddress: device.ipAddress,
                        locationId: device.locationId,
                        manufacturerId: device.manufacturerId,
                        model: device.model,
                        serialNumber: device.serialNumber,
                        operatingSystem: device.operatingSystem,
                        version: device.version,
                        domain: device.domain,
                        purpose: device.purpose,
                        status: device.status,
                        hostDeviceId: device.hostDeviceId,
                        notes: device.notes,
                        applicationIds: device.applications.map((link) => link.applicationId),
                        assetLabel: device.asset ? (device.asset.assetTag ? `${device.asset.name} (${device.asset.assetTag})` : device.asset.name) : null,
                      }}
                    />
                  </TD>
                ) : null}
              </TR>
            ))}
          </TBody>
        </Table>
      )}
      <Pagination
        page={page}
        pageCount={Math.max(1, Math.ceil(total / PAGE_SIZE))}
        total={total}
        buildHref={(next) => {
          const search = new URLSearchParams();
          if (q) search.set("q", q);
          if (params.company) search.set("company", params.company);
          if (params.type) search.set("type", params.type);
          if (params.status) search.set("status", params.status);
          search.set("page", String(next));
          return `${basePath}?${search.toString()}`;
        }}
      />
    </div>
  );
}
