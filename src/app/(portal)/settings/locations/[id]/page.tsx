import { notFound } from "next/navigation";
import { requirePermission } from "@/shared/auth/guard";
import { db } from "@/shared/db";
import { PageHeader } from "@/shared/ui/page";
import { AssetListCard } from "../../asset-list-card";

export const dynamic = "force-dynamic";

/** Asset location detail: all assets at the location. */
export default async function LocationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { user } = await requirePermission("settings.view");
  const { id } = await params;
  const isGlobalAdmin = user.systemRoleKey === "SYSTEM_ADMINISTRATOR";
  const location = await db.location.findFirst({
    where: { id, deletedAt: null, ...(isGlobalAdmin ? {} : { companyId: user.companyId }) },
    include: { company: { select: { name: true } } },
  });
  if (!location) notFound();

  const assets = await db.asset.findMany({
    where: { deletedAt: null, locationId: location.id },
    orderBy: { name: "asc" },
    include: { category: { select: { name: true } } },
  });

  return (
    <div>
      <PageHeader
        title={location.name}
        breadcrumbs={[{ label: "Settings", href: "/settings?tab=locations" }, { label: "Asset Locations", href: "/settings?tab=locations" }, { label: location.name }]}
        description={`${location.company.name} · ${assets.length} asset(s)`}
      />
      <AssetListCard
        title="Assets"
        assets={assets.map((asset) => ({
          id: asset.id,
          name: asset.name,
          assetTag: asset.assetTag,
          status: asset.status,
          category: asset.category?.name ?? null,
          location: location.name,
        }))}
      />
    </div>
  );
}
