import { db } from "@/shared/db";
import { recordAudit, type AuditContext } from "@/shared/audit/audit";
import { BusinessRuleError, NotFoundError, ValidationError } from "@/shared/errors";
import { slugify } from "@/shared/utils";
import { randomToken } from "@/shared/crypto/encryption";
import type { FormInput, RequestTypeInput } from "./validators";

/**
 * Forms & Form Builder business logic (SDS Doc 22).
 * Draft → Published → Archived lifecycle; published versions are immutable;
 * exactly one workflow per form; public request links via unguessable slug.
 */

const MODULE = "forms";

export async function createRequestType(context: AuditContext, input: RequestTypeInput) {
  const duplicate = await db.requestType.findFirst({
    where: {
      companyId: input.companyId,
      name: { equals: input.name, mode: "insensitive" },
      deletedAt: null,
    },
  });
  if (duplicate) {
    throw new ValidationError(undefined, { name: "A request type with this name already exists." });
  }
  return db.$transaction(async (tx) => {
    const requestType = await tx.requestType.create({
      data: { ...input, createdById: context.actorUserId ?? null },
    });
    await recordAudit(
      { ...context, companyId: input.companyId },
      {
        module: MODULE,
        eventType: "request_type.created",
        action: `Created request type "${requestType.name}"`,
        targetType: "request_type",
        targetId: requestType.id,
        targetLabel: requestType.name,
      },
      tx,
    );
    return requestType;
  });
}

export async function setRequestTypeActive(context: AuditContext, id: string, isActive: boolean) {
  const existing = await db.requestType.findFirst({ where: { id, deletedAt: null } });
  if (!existing) throw new NotFoundError("Request type not found.");
  return db.$transaction(async (tx) => {
    const requestType = await tx.requestType.update({ where: { id }, data: { isActive } });
    await recordAudit(
      { ...context, companyId: requestType.companyId },
      {
        module: MODULE,
        eventType: isActive ? "request_type.enabled" : "request_type.disabled",
        action: `${isActive ? "Enabled" : "Disabled"} request type "${requestType.name}"`,
        targetType: "request_type",
        targetId: id,
        targetLabel: requestType.name,
      },
      tx,
    );
    return requestType;
  });
}

async function validateFormReferences(input: FormInput): Promise<void> {
  // An all-company form has no company to match against, so its request type
  // and fallback workflow may come from any company. A company-bound form must
  // still keep everything inside its own company.
  const companyScope = input.companyId ? { companyId: input.companyId } : {};
  const [requestType, workflow] = await Promise.all([
    db.requestType.findFirst({
      where: { id: input.requestTypeId, ...companyScope, deletedAt: null, isActive: true },
    }),
    db.workflow.findFirst({
      where: { id: input.workflowId, ...companyScope, deletedAt: null, isActive: true },
    }),
  ]);
  if (!requestType) throw new BusinessRuleError("The request type must be active and belong to the same company.");
  if (!workflow) throw new BusinessRuleError("The workflow must be active and belong to the same company.");
}

export async function createForm(context: AuditContext, input: FormInput) {
  if (input.companyId) {
    const company = await db.company.findFirst({
      where: { id: input.companyId, deletedAt: null, isActive: true },
    });
    if (!company) throw new BusinessRuleError("Company not found or disabled.");
  }
  await validateFormReferences(input);
  // Postgres treats NULLs as distinct, so the database unique index cannot keep
  // all-company form names unique on its own; that case is checked here.
  const duplicate = await db.form.findFirst({
    where: {
      companyId: input.companyId ?? null,
      name: { equals: input.name, mode: "insensitive" },
      deletedAt: null,
    },
  });
  if (duplicate) {
    throw new ValidationError(undefined, {
      name: input.companyId
        ? "A form with this name already exists in this company."
        : "An all-company form with this name already exists.",
    });
  }
  // Unguessable public slug: readable prefix + random suffix.
  const slug = `${slugify(input.name)}-${randomToken(6)}`;

  return db.$transaction(async (tx) => {
    const form = await tx.form.create({
      data: {
        companyId: input.companyId ?? null,
        requestTypeId: input.requestTypeId,
        workflowId: input.workflowId,
        name: input.name,
        description: input.description,
        confirmationMessage: input.confirmationMessage,
        allowedAssetCategoryIds: input.allowedAssetCategoryIds,
        applicationId: input.applicationId ?? null,
        assetCategoryId: input.assetCategoryId ?? null,
        allowsMixedItems: input.allowsMixedItems,
        slug,
        status: "DRAFT",
        createdById: context.actorUserId ?? null,
      },
    });
    const version = await tx.formVersion.create({
      data: {
        formId: form.id,
        versionNumber: 1,
        fields: {
          create: input.fields.map((field, index) => ({
            fieldKey: field.fieldKey,
            label: field.label,
            fieldType: field.fieldType,
            placeholder: field.placeholder,
            helpText: field.helpText,
            isRequired: field.isRequired,
            defaultValue: field.defaultValue,
            options: field.options ?? undefined,
            validation: field.validation ?? undefined,
            visibilityRules: field.visibilityRules ?? undefined,
            displayOrder: index,
          })),
        },
      },
    });
    await tx.form.update({ where: { id: form.id }, data: { currentVersionId: version.id } });
    await recordAudit(
      { ...context, companyId: input.companyId },
      {
        module: MODULE,
        eventType: "form.created",
        action: `Created form "${form.name}" (draft v1)`,
        targetType: "form",
        targetId: form.id,
        targetLabel: form.name,
      },
      tx,
    );
    return form;
  });
}

/**
 * Update a form. Draft versions are edited in place; editing a published form
 * creates a new draft version while the published version remains live and
 * immutable (Doc 22: version changes never affect previous submissions).
 */
export async function updateForm(context: AuditContext, id: string, input: FormInput) {
  const existing = await db.form.findFirst({
    where: { id, deletedAt: null },
    include: { currentVersion: true },
  });
  if (!existing) throw new NotFoundError("Form not found.");
  if (existing.companyId !== input.companyId) {
    throw new BusinessRuleError("Forms cannot be moved between companies.");
  }
  if (existing.status === "ARCHIVED") {
    throw new BusinessRuleError("Archived forms cannot be edited.");
  }
  await validateFormReferences(input);
  const duplicate = await db.form.findFirst({
    where: {
      companyId: input.companyId,
      name: { equals: input.name, mode: "insensitive" },
      deletedAt: null,
      id: { not: id },
    },
  });
  if (duplicate) {
    throw new ValidationError(undefined, { name: "A form with this name already exists in this company." });
  }

  return db.$transaction(async (tx) => {
    await tx.form.update({
      where: { id },
      data: {
        name: input.name,
        description: input.description,
        requestTypeId: input.requestTypeId,
        workflowId: input.workflowId,
        confirmationMessage: input.confirmationMessage,
        allowedAssetCategoryIds: input.allowedAssetCategoryIds,
        applicationId: input.applicationId ?? null,
        assetCategoryId: input.assetCategoryId ?? null,
        allowsMixedItems: input.allowsMixedItems,
        updatedById: context.actorUserId ?? null,
      },
    });

    const currentVersion = existing.currentVersion;
    let versionId: string;
    if (currentVersion && !currentVersion.publishedAt) {
      // Draft version: replace fields in place.
      await tx.formField.deleteMany({ where: { formVersionId: currentVersion.id } });
      versionId = currentVersion.id;
      await tx.formVersion.update({
        where: { id: versionId },
        data: {
          fields: {
            create: input.fields.map((field, index) => ({
              fieldKey: field.fieldKey,
              label: field.label,
              fieldType: field.fieldType,
              placeholder: field.placeholder,
              helpText: field.helpText,
              isRequired: field.isRequired,
              defaultValue: field.defaultValue,
              options: field.options ?? undefined,
              validation: field.validation ?? undefined,
              visibilityRules: field.visibilityRules ?? undefined,
              displayOrder: index,
            })),
          },
        },
      });
    } else {
      // Published (immutable): create the next draft version.
      const latest = await tx.formVersion.findFirst({
        where: { formId: id },
        orderBy: { versionNumber: "desc" },
      });
      const version = await tx.formVersion.create({
        data: {
          formId: id,
          versionNumber: (latest?.versionNumber ?? 0) + 1,
          fields: {
            create: input.fields.map((field, index) => ({
              fieldKey: field.fieldKey,
              label: field.label,
              fieldType: field.fieldType,
              placeholder: field.placeholder,
              helpText: field.helpText,
              isRequired: field.isRequired,
              defaultValue: field.defaultValue,
              options: field.options ?? undefined,
              validation: field.validation ?? undefined,
              visibilityRules: field.visibilityRules ?? undefined,
              displayOrder: index,
            })),
          },
        },
      });
      versionId = version.id;
      await tx.form.update({ where: { id }, data: { currentVersionId: versionId } });
    }
    await recordAudit(
      { ...context, companyId: input.companyId },
      {
        module: MODULE,
        eventType: "form.updated",
        action: `Updated form "${input.name}"`,
        targetType: "form",
        targetId: id,
        targetLabel: input.name,
      },
      tx,
    );
    return { formId: id, versionId };
  });
}

export async function publishForm(context: AuditContext, id: string) {
  const form = await db.form.findFirst({
    where: { id, deletedAt: null },
    include: { currentVersion: { include: { fields: true } }, workflow: { include: { versions: { where: { isActive: true } } } } },
  });
  if (!form) throw new NotFoundError("Form not found.");
  if (!form.currentVersion) throw new BusinessRuleError("The form has no version to publish.");
  if (form.currentVersion.publishedAt) {
    throw new BusinessRuleError("This version is already published.");
  }
  if (!form.workflow.isActive || form.workflow.versions.length === 0) {
    throw new BusinessRuleError("The assigned workflow must be active before publishing.");
  }
  return db.$transaction(async (tx) => {
    await tx.formVersion.update({
      where: { id: form.currentVersionId! },
      data: { publishedAt: new Date(), publishedById: context.actorUserId ?? null },
    });
    const published = await tx.form.update({
      where: { id },
      data: { status: "PUBLISHED", updatedById: context.actorUserId ?? null },
    });
    await recordAudit(
      { ...context, companyId: form.companyId },
      {
        module: MODULE,
        eventType: "form.published",
        action: `Published form "${form.name}" v${form.currentVersion!.versionNumber}`,
        targetType: "form",
        targetId: id,
        targetLabel: form.name,
      },
      tx,
    );
    return published;
  });
}

export async function archiveForm(context: AuditContext, id: string) {
  const form = await db.form.findFirst({ where: { id, deletedAt: null } });
  if (!form) throw new NotFoundError("Form not found.");
  return db.$transaction(async (tx) => {
    const archived = await tx.form.update({
      where: { id },
      data: { status: "ARCHIVED", isActive: false, updatedById: context.actorUserId ?? null },
    });
    await recordAudit(
      { ...context, companyId: form.companyId },
      {
        module: MODULE,
        eventType: "form.archived",
        action: `Archived form "${form.name}"`,
        targetType: "form",
        targetId: id,
        targetLabel: form.name,
      },
      tx,
    );
    return archived;
  });
}

/**
 * Delete a form. Forms with submitted requests are preserved for audit and can
 * only be archived; unused forms are soft-deleted and disappear from the list.
 */
export async function deleteForm(context: AuditContext, id: string) {
  const form = await db.form.findFirst({
    where: { id, deletedAt: null },
    include: { _count: { select: { requests: true } } },
  });
  if (!form) throw new NotFoundError("Form not found.");
  // Requests snapshot the form name at submission, so deleting the form no
  // longer takes the history with it.
  await db.form.update({
    where: { id },
    data: { deletedAt: new Date(), isActive: false, status: "ARCHIVED", deletedById: context.actorUserId ?? null },
  });
  await recordAudit(
    { ...context, companyId: form.companyId },
    {
      module: MODULE,
      eventType: "form.deleted",
      action: `Deleted form "${form.name}"`,
      targetType: "form",
      targetId: id,
      targetLabel: form.name,
    },
  );
  return { id };
}

export async function duplicateForm(context: AuditContext, id: string) {
  const form = await db.form.findFirst({
    where: { id, deletedAt: null },
    include: { currentVersion: { include: { fields: { orderBy: { displayOrder: "asc" } } } } },
  });
  if (!form || !form.currentVersion) throw new NotFoundError("Form not found.");
  const copyName = `${form.name} (Copy)`;
  const slug = `${slugify(copyName)}-${randomToken(6)}`;
  return db.$transaction(async (tx) => {
    const copy = await tx.form.create({
      data: {
        companyId: form.companyId,
        requestTypeId: form.requestTypeId,
        workflowId: form.workflowId,
        name: copyName,
        description: form.description,
        confirmationMessage: form.confirmationMessage,
        slug,
        status: "DRAFT",
        createdById: context.actorUserId ?? null,
      },
    });
    const version = await tx.formVersion.create({
      data: {
        formId: copy.id,
        versionNumber: 1,
        fields: {
          create: form.currentVersion!.fields.map((field) => ({
            fieldKey: field.fieldKey,
            label: field.label,
            fieldType: field.fieldType,
            placeholder: field.placeholder,
            helpText: field.helpText,
            isRequired: field.isRequired,
            defaultValue: field.defaultValue,
            options: field.options ?? undefined,
            validation: field.validation ?? undefined,
            visibilityRules: field.visibilityRules ?? undefined,
            displayOrder: field.displayOrder,
          })),
        },
      },
    });
    await tx.form.update({ where: { id: copy.id }, data: { currentVersionId: version.id } });
    await recordAudit(
      { ...context, companyId: form.companyId },
      {
        module: MODULE,
        eventType: "form.duplicated",
        action: `Duplicated form "${form.name}" as "${copyName}"`,
        targetType: "form",
        targetId: copy.id,
        targetLabel: copyName,
      },
      tx,
    );
    return copy;
  });
}

/** Load the live published form for the public request page. */
export async function getPublicForm(slug: string) {
  return db.form.findFirst({
    // An all-company form has no company (companyId null); a company-bound one
    // must belong to an active company.
    where: {
      slug,
      status: "PUBLISHED",
      isActive: true,
      deletedAt: null,
      OR: [{ companyId: null }, { company: { isActive: true } }],
    },
    include: {
      company: { select: { id: true, name: true } },
      requestType: true,
      currentVersion: { include: { fields: { orderBy: { displayOrder: "asc" } } } },
    },
  });
}
