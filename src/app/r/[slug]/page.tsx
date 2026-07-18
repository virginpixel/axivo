import { notFound } from "next/navigation";
import { db } from "@/shared/db";
import { getPublicForm } from "@/modules/forms/service";
import { PublicRequestForm } from "./request-form";
import { ToastProvider } from "@/shared/ui/toast";

export const dynamic = "force-dynamic";

/**
 * Public single-page request form (SDS Doc 22, Doc 09 Ch3). No login required;
 * inline validation client-side, full validation server-side.
 */
export default async function PublicFormPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const form = await getPublicForm(slug);
  if (!form || !form.currentVersion) notFound();

  const kind = form.requestType.kind;
  const applications =
    kind === "APPLICATION_ACCESS" || kind === "ROLE_CHANGE"
      ? await db.application.findMany({
          where: { companyId: form.companyId, isActive: true, deletedAt: null },
          orderBy: { name: "asc" },
          include: {
            roles: { where: { isActive: true, deletedAt: null }, orderBy: { name: "asc" } },
          },
        })
      : [];
  const assetCategories =
    kind === "ASSET_REQUEST"
      ? await db.assetCategory.findMany({
          where: { companyId: form.companyId, isActive: true, deletedAt: null },
          orderBy: { name: "asc" },
        })
      : [];

  return (
    <ToastProvider>
      <main className="min-h-screen bg-background py-8">
        <div className="mx-auto w-full max-w-2xl px-4">
          <div className="mb-6 text-center">
            <p className="text-sm font-semibold uppercase tracking-wide text-primary">
              {form.company.name}
            </p>
            <h1 className="mt-1 text-2xl font-bold">{form.name}</h1>
            {form.description ? (
              <p className="mt-2 text-sm text-muted-foreground">{form.description}</p>
            ) : null}
          </div>
          <PublicRequestForm
            slug={form.slug}
            requestTypeKind={kind}
            fields={form.currentVersion.fields.map((field) => ({
              fieldKey: field.fieldKey,
              label: field.label,
              fieldType: field.fieldType,
              placeholder: field.placeholder,
              helpText: field.helpText,
              isRequired: field.isRequired,
              defaultValue: field.defaultValue,
              options: (field.options as string[] | null) ?? [],
              visibilityRules: field.visibilityRules as never,
            }))}
            applications={applications.map((application) => ({
              id: application.id,
              name: application.name,
              roles: application.roles.map((role) => ({ id: role.id, name: role.name })),
            }))}
            assetCategories={assetCategories.map((category) => ({
              id: category.id,
              name: category.name,
            }))}
          />
          <p className="mt-6 text-center text-xs text-muted-foreground">
            Powered by Axivo · Your submission is routed automatically for approval.
          </p>
        </div>
      </main>
    </ToastProvider>
  );
}
