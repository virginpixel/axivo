import { notFound } from "next/navigation";
import { db } from "@/shared/db";
import { getPublicForm } from "@/modules/forms/service";
import { PublicRequestForm, type PublicField as PublicRequestField } from "./request-form";
import { listActiveRequestFieldsFor } from "@/modules/request-fields/service";
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
  const allowedCategoryIds = (form.allowedAssetCategoryIds as string[] | null) ?? null;
  const [applications, assetCategories, departments, positions] = await Promise.all([
    kind === "APPLICATION_ACCESS" || kind === "ROLE_CHANGE" || form.allowsMixedItems
      ? db.application.findMany({
          // Include the company's own applications plus any shared ones. A form
          // dedicated to one application offers only that one.
          where: {
            isActive: true,
            deletedAt: null,
            ...(form.applicationId ? { id: form.applicationId } : {}),
            // A company-bound form filters here. An all-company form carries
            // every company's applications and the browser narrows them once
            // the requested-for employee's company is chosen.
            ...(form.companyId
              ? { OR: [{ companyId: form.companyId }, { isShared: true }] }
              : {}),
          },
          orderBy: { name: "asc" },
          include: {
            roles: { where: { isActive: true, deletedAt: null }, orderBy: { name: "asc" } },
          },
        })
      : Promise.resolve([]),
    kind === "ASSET_REQUEST" || form.allowsMixedItems
      ? db.assetCategory.findMany({
          where: {
            isActive: true,
            deletedAt: null,
            ...(form.assetCategoryId ? { id: form.assetCategoryId } : {}),
            // Forms may restrict which asset categories can be requested.
            ...(allowedCategoryIds && allowedCategoryIds.length > 0
              ? { id: { in: allowedCategoryIds } }
              : {}),
          },
          orderBy: { name: "asc" },
        })
      : Promise.resolve([]),
    // Departments and positions for every active company: the requested-for
    // employee may belong to a different company when a form is shared.
    db.department.findMany({
      where: { isActive: true, deletedAt: null, company: { isActive: true, deletedAt: null } },
      orderBy: { name: "asc" },
      select: { id: true, name: true, companyId: true },
    }),
    db.position.findMany({
      where: { isActive: true, deletedAt: null, company: { isActive: true, deletedAt: null } },
      orderBy: { name: "asc" },
      select: { id: true, name: true, companyId: true },
    }),
  ]);

  const companies = await db.company.findMany({
    where: { isActive: true, deletedAt: null },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  // Extra questions defined on each application and asset category this form
  // offers, keyed by target id so the form reveals them once one is chosen.
  const targetFields = await listActiveRequestFieldsFor(
    applications.map((application) => application.id),
    assetCategories.map((category) => category.id),
  );
  const requestFieldsByTarget: Record<string, PublicRequestField[]> = {};
  for (const field of targetFields) {
    const targetId = field.applicationId ?? field.assetCategoryId;
    if (!targetId) continue;
    (requestFieldsByTarget[targetId] ??= []).push({
      fieldKey: field.fieldKey,
      label: field.label,
      fieldType: field.fieldType,
      placeholder: field.placeholder,
      helpText: field.helpText,
      isRequired: field.isRequired,
      defaultValue: null,
      options: Array.isArray(field.options) ? (field.options as string[]) : [],
      visibilityRules: null,
    });
  }

  const { getSetting, SETTING_KEYS } = await import("@/shared/settings/settings");
  const logoSet = await getSetting<Record<string, { storageKey?: string } | null>>(SETTING_KEYS.REQUEST_FORM_LOGOS);
  const formLogos = {
    left: !!logoSet.left?.storageKey,
    center: !!logoSet.center?.storageKey,
    right: !!logoSet.right?.storageKey,
  };

  return (
    <ToastProvider>
      <main className="min-h-screen bg-background py-8">
        <div className="mx-auto w-full max-w-2xl px-4">
          <div className="mb-6 text-center">
            {(formLogos.left || formLogos.center || formLogos.right) ? (
              <div className="mb-4 flex items-center justify-between gap-3">
                <div className="flex h-14 flex-1 items-center justify-start">
                  {formLogos.left ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src="/api/branding/form-logo/left" alt="" className="max-h-14 max-w-full object-contain" />
                  ) : null}
                </div>
                <div className="flex h-14 flex-1 items-center justify-center">
                  {formLogos.center ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src="/api/branding/form-logo/center" alt="" className="max-h-14 max-w-full object-contain" />
                  ) : null}
                </div>
                <div className="flex h-14 flex-1 items-center justify-end">
                  {formLogos.right ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src="/api/branding/form-logo/right" alt="" className="max-h-14 max-w-full object-contain" />
                  ) : null}
                </div>
              </div>
            ) : null}
            <p className="label-caps text-primary">
              {form.company?.name ?? "All companies"}
            </p>
            <h1 className="mt-1.5 text-3xl font-semibold">{form.name}</h1>
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
              companyId: application.companyId,
              isShared: application.isShared,
              roles: application.roles.map((role) => ({ id: role.id, name: role.name, description: role.description })),
            }))}
            assetCategories={assetCategories.map((category) => ({
              id: category.id,
              name: category.name,
            }))}
            departments={departments}
            positions={positions}
            companies={companies}
            formCompanyId={form.companyId}
            requestFieldsByTarget={requestFieldsByTarget}
            allowsMixedItems={form.allowsMixedItems}
            fixedApplicationId={form.applicationId}
            fixedAssetCategoryId={form.assetCategoryId}
          />
          <p className="mt-6 text-center text-xs text-muted-foreground">
            Your submission will be routed automatically for approval.
          </p>
        </div>
      </main>
    </ToastProvider>
  );
}
