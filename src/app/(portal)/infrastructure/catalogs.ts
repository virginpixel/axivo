import "server-only";
import { db } from "@/shared/db";
import type { AuthenticatedUser } from "@/shared/auth/session";
import type { DeviceCatalogs } from "./device-dialogs";

/** Everything the device form offers, limited to what the user may see. */
export async function loadDeviceCatalogs(user: AuthenticatedUser): Promise<DeviceCatalogs> {
  const isGlobalAdmin = user.systemRoleKey === "SYSTEM_ADMINISTRATOR";
  const scope = isGlobalAdmin ? {} : { companyId: user.companyId };
  const [companies, types, locations, manufacturers, hosts, applications] = await Promise.all([
    db.company.findMany({
      where: { deletedAt: null, isActive: true, ...(isGlobalAdmin ? {} : { id: user.companyId }) },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    db.infraDeviceType.findMany({
      where: { deletedAt: null },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true, kind: true, isActive: true },
    }),
    db.location.findMany({
      where: { deletedAt: null, isActive: true, ...scope },
      select: { id: true, name: true, companyId: true, parentId: true },
    }),
    db.manufacturer.findMany({ where: { deletedAt: null, isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.infraDevice.findMany({
      where: { deletedAt: null, kind: "SERVER", ...scope },
      orderBy: { name: "asc" },
      select: { id: true, name: true, companyId: true },
    }),
    db.application.findMany({
      where: { deletedAt: null, ...(isGlobalAdmin ? {} : { OR: [{ companyId: user.companyId }, { isShared: true }] }) },
      orderBy: { name: "asc" },
      select: { id: true, name: true, companyId: true, isShared: true },
    }),
  ]);
  return {
    companies,
    types,
    locations: locations
      .map((location) => ({ id: location.id, companyId: location.companyId, label: locationPath(location.id, locations) }))
      .sort((a, b) => a.label.localeCompare(b.label)),
    manufacturers,
    hosts,
    applications,
  };
}

/** "Township › BOH Data Center › Rack 3", walking parents (guarding against loops). */
export function locationPath(id: string, all: { id: string; name: string; parentId: string | null }[]): string {
  const byId = new Map(all.map((location) => [location.id, location]));
  const parts: string[] = [];
  let cursor = byId.get(id);
  for (let depth = 0; cursor && depth < 10; depth += 1) {
    parts.unshift(cursor.name);
    cursor = cursor.parentId ? byId.get(cursor.parentId) : undefined;
  }
  return parts.join(" › ");
}
