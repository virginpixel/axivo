import Link from "next/link";
import { requirePermission } from "@/shared/auth/guard";
import { db } from "@/shared/db";
import { PageHeader } from "@/shared/ui/page";
import { EmptyState } from "@/shared/ui/table";
import { buttonVariants } from "@/shared/ui/button";
import { formatDate } from "@/shared/utils";
import { loadTopology } from "@/modules/infrastructure/topology";
import { TopologyView } from "./topology-map";
import { LinkDialog } from "../link-dialogs";
import { CompanyFilter } from "./company-filter";

export const metadata = { title: "Topology" };
export const dynamic = "force-dynamic";

/** Which switch connects to which, from which port (SDS Doc 24). */
export default async function TopologyPage({
  searchParams,
}: {
  searchParams: Promise<{ company?: string; focus?: string }>;
}) {
  const { user, audit } = await requirePermission("infrastructure.view");
  const params = await searchParams;
  const isGlobalAdmin = user.systemRoleKey === "SYSTEM_ADMINISTRATOR";
  const canManage = user.permissions.has("infrastructure.manage");
  const scope = { audit, companyId: user.companyId, isGlobalAdmin };

  const [data, companies, devices] = await Promise.all([
    loadTopology(scope, params.company),
    isGlobalAdmin
      ? db.company.findMany({ where: { deletedAt: null, isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } })
      : [],
    canManage
      ? db.infraDevice.findMany({
          where: { deletedAt: null, ...(isGlobalAdmin ? {} : { companyId: user.companyId }) },
          orderBy: { name: "asc" },
          select: { id: true, name: true, ipAddress: true, type: { select: { name: true } }, company: { select: { name: true } } },
        })
      : [],
  ]);

  const deviceOptions = devices.map((d) => ({
    id: d.id,
    name: d.name,
    hint: [d.type.name, d.ipAddress, isGlobalAdmin ? d.company.name : null].filter(Boolean).join(" · "),
  }));
  // Dates are formatted here, on the server, in the organisation's timezone.
  const links = data.links.map((link) => ({ ...link, seenLabel: link.lastSeenAt ? formatDate(new Date(link.lastSeenAt)) : null }));

  return (
    <div>
      <PageHeader
        title="Topology"
        description="Which switch connects to which, and from which port."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {isGlobalAdmin && companies.length > 1 ? (
              <CompanyFilter companies={companies} value={params.company ?? ""} />
            ) : null}
            {canManage ? <LinkDialog devices={deviceOptions} /> : null}
          </div>
        }
      />
      {data.links.length === 0 ? (
        <EmptyState
          title="No cables recorded yet"
          description={
            canManage
              ? "Import a neighbour table (the Neighbours sheet of the discovery workbook works as it is), or add cables one by one."
              : "Nobody has recorded which devices connect to which yet."
          }
          action={canManage ? <Link href="/infrastructure/import?what=connections" className={buttonVariants()}>Import connections</Link> : undefined}
        />
      ) : (
        <TopologyView
          nodes={data.nodes}
          links={links}
          canManage={canManage}
          devices={deviceOptions}
          focusId={params.focus}
        />
      )}
    </div>
  );
}
