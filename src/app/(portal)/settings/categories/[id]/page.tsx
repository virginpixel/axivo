import { notFound } from "next/navigation";
import { requirePermission } from "@/shared/auth/guard";
import { db } from "@/shared/db";
import { PageHeader } from "@/shared/ui/page";
import { RequestFieldsCard } from "@/shared/ui/request-fields-card";
import { listRequestFields } from "@/modules/request-fields/service";
import { AssetListCard } from "../../asset-list-card";

export const dynamic = "force-dynamic";

/** Asset category detail: its request fields and all assets in the category. */
export default async function CategoryDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { user } = await requirePermission("settings.view");
  const { id } = await params;
  const category = await db.assetCategory.findFirst({
    where: { id, deletedAt: null },
  });
  if (!category) notFound();

  const [assets, requestFields] = await Promise.all([
    db.asset.findMany({
      where: { deletedAt: null, categoryId: category.id },
      orderBy: { name: "asc" },
      include: { location: { select: { name: true } } },
    }),
    listRequestFields({ assetCategoryId: category.id }),
  ]);

  return (
    <div>
      <PageHeader
        title={category.name}
        breadcrumbs={[{ label: "Settings", href: "/settings?tab=asset-categories" }, { label: "Asset Categories", href: "/settings?tab=asset-categories" }, { label: category.name }]}
        description={`${assets.length} asset(s)`}
      />
      <div className="mb-5">
        <RequestFieldsCard
          owner={{ assetCategoryId: category.id }}
          canManage={user.permissions.has("assets.manage")}
          description="No extra questions yet. Add the details a requester must provide when asking for this kind of asset."
          fields={requestFields.map((field) => ({
            id: field.id,
            label: field.label,
            fieldType: field.fieldType,
            placeholder: field.placeholder,
            helpText: field.helpText,
            isRequired: field.isRequired,
            options: Array.isArray(field.options) ? (field.options as string[]) : [],
            displayOrder: field.displayOrder,
            isActive: field.isActive,
          }))}
        />
      </div>
      <AssetListCard
        title="Assets"
        assets={assets.map((asset) => ({
          id: asset.id,
          name: asset.name,
          assetTag: asset.assetTag,
          status: asset.status,
          category: category.name,
          location: asset.location?.name ?? null,
        }))}
      />
    </div>
  );
}
