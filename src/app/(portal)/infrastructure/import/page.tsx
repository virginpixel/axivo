import Link from "next/link";
import { requirePermission } from "@/shared/auth/guard";
import { db } from "@/shared/db";
import { PageHeader } from "@/shared/ui/page";
import { cn } from "@/shared/utils";
import { ImportWizard } from "./import-wizard";
import { ConnectionImport } from "./connection-import";
import { IpamImport } from "./ipam-import";

export const metadata = { title: "Import" };
export const dynamic = "force-dynamic";

/** Spreadsheet import with a preview step (SDS Doc 24): devices, or the cables between them. */
export default async function ImportPage({ searchParams }: { searchParams: Promise<{ what?: string }> }) {
  const { user } = await requirePermission("infrastructure.manage");
  const { what } = await searchParams;
  const connections = what === "connections";
  const ip = what === "ip";
  const isGlobalAdmin = user.systemRoleKey === "SYSTEM_ADMINISTRATOR";
  const [companies, types] = connections || ip
    ? [[], []]
    : await Promise.all([
        db.company.findMany({
          where: { deletedAt: null, isActive: true, ...(isGlobalAdmin ? {} : { id: user.companyId }) },
          orderBy: { name: "asc" },
          select: { id: true, name: true },
        }),
        db.infraDeviceType.findMany({
          where: { deletedAt: null, isActive: true },
          orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
          select: { id: true, name: true, kind: true },
        }),
      ]);
  return (
    <div>
      <PageHeader
        title={connections ? "Import connections" : ip ? "Import VLANs and IP addresses" : "Import devices"}
        description={
          connections
            ? "Bring in a neighbour table to draw the topology. You check every cable before anything is saved."
            : ip
              ? "Bring in a VLAN plan and the addresses found on the network. You see what changes before anything is saved."
              : "Bring in a network or server spreadsheet. You check how every row will land before anything is saved."
        }
      />
      <div className="mb-5 flex w-fit rounded-full border bg-card p-0.5" role="group" aria-label="What to import">
        {([
          ["devices", "Devices", "/infrastructure/import"],
          ["connections", "Connections", "/infrastructure/import?what=connections"],
          ["ip", "VLANs & IPs", "/infrastructure/import?what=ip"],
        ] as const).map(
          ([value, label, href]) => {
            const active = value === (connections ? "connections" : ip ? "ip" : "devices");
            return (
              <Link
                key={value}
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
                  active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {label}
              </Link>
            );
          },
        )}
      </div>
      {connections ? (
        <ConnectionImport />
      ) : ip ? (
        <IpamImport />
      ) : (
        <ImportWizard
          companies={companies}
          types={types}
          canImportLogins={user.permissions.has("infrastructure.credentials.manage")}
        />
      )}
    </div>
  );
}
