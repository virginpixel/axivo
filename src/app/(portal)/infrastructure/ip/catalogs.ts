import "server-only";
import { db } from "@/shared/db";
import type { AuthenticatedUser } from "@/shared/auth/session";
import { locationPath } from "../catalogs";
import type { IpCatalogs } from "./ip-dialogs";

/** What the VLAN, subnet and address forms offer, limited to what the user may see. */
export async function loadIpCatalogs(user: AuthenticatedUser): Promise<IpCatalogs> {
  const isGlobalAdmin = user.systemRoleKey === "SYSTEM_ADMINISTRATOR";
  const scope = isGlobalAdmin ? {} : { companyId: user.companyId };
  const [companies, vlans, locations, devices] = await Promise.all([
    db.company.findMany({
      where: { deletedAt: null, isActive: true, ...(isGlobalAdmin ? {} : { id: user.companyId }) },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    db.vlan.findMany({ where: scope, orderBy: { number: "asc" }, select: { id: true, companyId: true, number: true, name: true } }),
    db.location.findMany({ where: { deletedAt: null, isActive: true, ...scope }, select: { id: true, name: true, companyId: true, parentId: true } }),
    db.infraDevice.findMany({
      where: { deletedAt: null, ...scope },
      orderBy: { name: "asc" },
      select: { id: true, companyId: true, name: true, ipAddress: true },
    }),
  ]);
  return {
    companies,
    vlans,
    locations: locations
      .map((l) => ({ id: l.id, companyId: l.companyId, label: locationPath(l.id, locations) }))
      .sort((a, b) => a.label.localeCompare(b.label)),
    devices,
  };
}
