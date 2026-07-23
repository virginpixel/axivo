import { notFound } from "next/navigation";
import { requirePermission } from "@/shared/auth/guard";
import { db } from "@/shared/db";
import { PageHeader } from "@/shared/ui/page";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { CUSTOM_FIELD_FORMAT_LABELS, type CustomFieldFormat } from "@/modules/catalogs/format";
import { AssetListCard } from "../../asset-list-card";
import { ModelImageControl } from "../../catalog-dialogs";

export const dynamic = "force-dynamic";

/** Asset model detail: image, fieldset, and all assets of this model. */
export default async function AssetModelDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { user } = await requirePermission("settings.view");
  const canManage = user.permissions.has("settings.manage");
  const { id } = await params;
  const model = await db.assetModel.findFirst({
    where: { id, deletedAt: null },
    include: {
      manufacturer: { select: { name: true } },
      fieldSet: { include: { fields: { orderBy: { sortOrder: "asc" }, include: { customField: true } } } },
    },
  });
  if (!model) notFound();

  const assets = await db.asset.findMany({
    where: { deletedAt: null, model: model.name },
    orderBy: { name: "asc" },
    include: { category: { select: { name: true } }, location: { select: { name: true } } },
  });

  return (
    <div>
      <PageHeader
        title={model.name}
        breadcrumbs={[{ label: "Settings", href: "/settings?tab=models" }, { label: "Asset Models", href: "/settings?tab=models" }, { label: model.name }]}
        description={[model.manufacturer?.name, `${assets.length} asset(s)`].filter(Boolean).join(" · ")}
      />
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5">
          <Card>
            <CardHeader><CardTitle>Image</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {model.imagePath ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={`/api/asset-models/${model.id}/image`} alt={model.name} className="max-h-48 w-full rounded-md border object-contain" />
              ) : (
                <p className="text-sm text-muted-foreground">No image set. Assets of this model show no default image.</p>
              )}
              {canManage ? <ModelImageControl modelId={model.id} hasImage={!!model.imagePath} /> : null}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Fieldset</CardTitle></CardHeader>
            <CardContent>
              {model.fieldSet ? (
                <div className="space-y-2 text-sm">
                  <p className="font-medium">{model.fieldSet.name}</p>
                  <ul className="space-y-1">
                    {model.fieldSet.fields.map((field) => (
                      <li key={field.id} className="flex items-center justify-between">
                        <span>{field.customField.name}{field.required ? <span className="text-destructive"> *</span> : null}</span>
                        <span className="text-xs text-muted-foreground">{CUSTOM_FIELD_FORMAT_LABELS[field.customField.format as CustomFieldFormat]}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No fieldset attached. Assets collect only the standard fields.</p>
              )}
            </CardContent>
          </Card>
        </div>
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
