import { notFound } from "next/navigation";
import { requirePermission } from "@/shared/auth/guard";
import { db } from "@/shared/db";
import { PageHeader } from "@/shared/ui/page";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { Table, THead, TBody, TR, TH, TD, EmptyState } from "@/shared/ui/table";
import { AssetListCard } from "../../asset-list-card";

export const dynamic = "force-dynamic";

/** Manufacturer detail: its models and all assets of that manufacturer. */
export default async function ManufacturerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission("settings.view");
  const { id } = await params;
  const manufacturer = await db.manufacturer.findFirst({
    where: { id, deletedAt: null },
    include: { models: { where: { deletedAt: null }, orderBy: { name: "asc" } } },
  });
  if (!manufacturer) notFound();

  const assets = await db.asset.findMany({
    where: { deletedAt: null, manufacturer: manufacturer.name },
    orderBy: { name: "asc" },
    include: { category: { select: { name: true } }, location: { select: { name: true } } },
  });

  return (
    <div>
      <PageHeader
        title={manufacturer.name}
        breadcrumbs={[{ label: "Settings", href: "/settings?tab=manufacturers" }, { label: "Manufacturers", href: "/settings?tab=manufacturers" }, { label: manufacturer.name }]}
        description={`${manufacturer.models.length} model(s) · ${assets.length} asset(s)`}
      />
      <div className="grid gap-5 lg:grid-cols-3">
        <Card>
          <CardHeader><CardTitle>Models</CardTitle></CardHeader>
          <CardContent>
            {manufacturer.models.length === 0 ? (
              <EmptyState title="No models" description="No models recorded for this manufacturer." />
            ) : (
              <Table>
                <THead><TR><TH>Model</TH><TH>Status</TH></TR></THead>
                <TBody>
                  {manufacturer.models.map((model) => (
                    <TR key={model.id}>
                      <TD className="font-medium">{model.name}</TD>
                      <TD>{model.isActive ? "Active" : "Inactive"}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
          </CardContent>
        </Card>
        <div className="lg:col-span-2">
          <AssetListCard
            title="Assets"
            assets={assets.map((asset) => ({
              id: asset.id,
              name: asset.name,
              assetTag: asset.assetTag,
              status: asset.status,
              category: asset.category?.name ?? null,
              location: asset.location?.name ?? null,
            }))}
          />
        </div>
      </div>
    </div>
  );
}
