import { notFound } from "next/navigation";
import { requirePermission } from "@/shared/auth/guard";
import { db } from "@/shared/db";
import { PageHeader } from "@/shared/ui/page";
import { FormBuilder } from "./form-builder";

export const metadata = { title: "Form builder" };
export const dynamic = "force-dynamic";

/** Form builder (SDS Doc 22): create/edit draft; published versions immutable. */
export default async function FormBuilderPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  const { user } = await requirePermission("forms.manage");
  const { id } = await searchParams;
  const isGlobalAdmin = user.systemRoleKey === "SYSTEM_ADMINISTRATOR";
  const companyScope = isGlobalAdmin ? {} : { companyId: user.companyId };

  const [companies, requestTypes, workflows, assetCategories, applications] = await Promise.all([
    db.company.findMany({
      where: { deletedAt: null, isActive: true, ...(isGlobalAdmin ? {} : { id: user.companyId }) },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    db.requestType.findMany({
      // The public-facing request types, provisioned per company automatically.
      // (Handover/clearance/general are internal and not built as public forms.)
      where: {
        deletedAt: null,
        isActive: true,
        kind: { in: ["APPLICATION_ACCESS", "ASSET_REQUEST", "ASSET_CHECKOUT", "ROLE_CHANGE"] },
        ...companyScope,
      },
      orderBy: { name: "asc" },
      select: { id: true, name: true, kind: true, companyId: true },
    }),
    db.workflow.findMany({
      where: { deletedAt: null, isActive: true, ...companyScope },
      orderBy: { name: "asc" },
      select: { id: true, name: true, companyId: true },
    }),
    db.assetCategory.findMany({
      where: { deletedAt: null, isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    // Offered when a form is dedicated to a single application.
    db.application.findMany({
      where: { deletedAt: null, isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, companyId: true, isShared: true },
    }),
  ]);

  let existing = null;
  if (id) {
    const form = await db.form.findFirst({
      where: { id, deletedAt: null, ...companyScope },
      include: { currentVersion: { include: { fields: { orderBy: { displayOrder: "asc" } } } } },
    });
    if (!form) notFound();
    existing = {
      id: form.id,
      companyId: form.companyId,
      requestTypeId: form.requestTypeId,
      workflowId: form.workflowId,
      name: form.name,
      description: form.description,
      confirmationMessage: form.confirmationMessage,
      allowedAssetCategoryIds: (form.allowedAssetCategoryIds as string[] | null) ?? [],
      applicationId: form.applicationId,
      assetCategoryId: form.assetCategoryId,
      allowsMixedItems: form.allowsMixedItems,
      status: form.status,
      fields: (form.currentVersion?.fields ?? []).map((field) => ({
        fieldKey: field.fieldKey,
        label: field.label,
        fieldType: field.fieldType,
        placeholder: field.placeholder ?? "",
        helpText: field.helpText ?? "",
        isRequired: field.isRequired,
        defaultValue: field.defaultValue ?? "",
        options: (field.options as string[] | null) ?? [],
        visibilityRules: field.visibilityRules as never,
      })),
    };
  }

  return (
    <div>
      <PageHeader
        title={existing ? `Edit form: ${existing.name}` : "New form"}
        breadcrumbs={[{ label: "Forms", href: "/forms" }, { label: existing ? "Edit" : "New" }]}
        description={
          existing?.status === "PUBLISHED"
            ? "This form is published. Saving creates a new draft version; the published version stays live until you publish again."
            : "Design the public request form and its fields."
        }
      />
      <FormBuilder
        companies={companies}
        requestTypes={requestTypes}
        workflows={workflows}
        assetCategories={assetCategories}
        applications={applications}
        existing={existing}
      />
    </div>
  );
}
