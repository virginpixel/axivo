import { db } from "@/shared/db";
import { recordAudit, type AuditContext } from "@/shared/audit/audit";
import { BusinessRuleError, NotFoundError, ValidationError } from "@/shared/errors";
import type { RequestFieldInput } from "./validators";
import { isChoiceType } from "./validators";

/**
 * Request fields owned by an application or an asset category (SDS Doc 08/11).
 * Answers are captured per request item, so one all-in-one form can ask the
 * right questions for whatever target the requester picks.
 */

const MODULE = "requests";

/** Stable machine key derived from the label, unique within the owner. */
function slugify(label: string): string {
  return (
    label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 50) || "field"
  );
}

async function resolveOwner(input: { applicationId?: string; assetCategoryId?: string }) {
  if (input.applicationId) {
    const application = await db.application.findFirst({
      where: { id: input.applicationId, deletedAt: null },
      select: { id: true, name: true, companyId: true },
    });
    if (!application) throw new NotFoundError("Application not found.");
    return { label: application.name, companyId: application.companyId };
  }
  if (input.assetCategoryId) {
    const category = await db.assetCategory.findFirst({
      where: { id: input.assetCategoryId, deletedAt: null },
      select: { id: true, name: true },
    });
    if (!category) throw new NotFoundError("Asset category not found.");
    // Categories are global, so there is no company to scope the audit entry to.
    return { label: category.name, companyId: undefined };
  }
  throw new BusinessRuleError("A request field needs an application or an asset category.");
}

/** Fields for one owner, ordered as they should appear on the form. */
export function listRequestFields(owner: { applicationId?: string; assetCategoryId?: string }) {
  return db.requestField.findMany({
    where: {
      deletedAt: null,
      ...(owner.applicationId ? { applicationId: owner.applicationId } : {}),
      ...(owner.assetCategoryId ? { assetCategoryId: owner.assetCategoryId } : {}),
    },
    orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }],
  });
}

/** Active fields for several owners at once, for rendering a public form. */
export async function listActiveRequestFieldsFor(
  applicationIds: string[],
  assetCategoryIds: string[],
) {
  if (applicationIds.length === 0 && assetCategoryIds.length === 0) return [];
  return db.requestField.findMany({
    where: {
      deletedAt: null,
      isActive: true,
      OR: [
        ...(applicationIds.length > 0 ? [{ applicationId: { in: applicationIds } }] : []),
        ...(assetCategoryIds.length > 0 ? [{ assetCategoryId: { in: assetCategoryIds } }] : []),
      ],
    },
    orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }],
  });
}

export async function createRequestField(context: AuditContext, input: RequestFieldInput) {
  const owner = await resolveOwner(input);
  const base = slugify(input.label);
  // Keys must be stable and unique per owner; existing answers key off them.
  const existing = await db.requestField.findMany({
    where: {
      ...(input.applicationId ? { applicationId: input.applicationId } : {}),
      ...(input.assetCategoryId ? { assetCategoryId: input.assetCategoryId } : {}),
    },
    select: { fieldKey: true, label: true, deletedAt: true },
  });
  if (existing.some((field) => !field.deletedAt && field.label.toLowerCase() === input.label.toLowerCase())) {
    throw new ValidationError(undefined, { label: "A field with this label already exists here." });
  }
  const taken = new Set(existing.map((field) => field.fieldKey));
  let fieldKey = base;
  let suffix = 2;
  while (taken.has(fieldKey)) {
    fieldKey = `${base}_${suffix}`;
    suffix += 1;
  }

  return db.$transaction(async (tx) => {
    const field = await tx.requestField.create({
      data: {
        applicationId: input.applicationId ?? null,
        assetCategoryId: input.assetCategoryId ?? null,
        fieldKey,
        label: input.label,
        fieldType: input.fieldType,
        placeholder: input.placeholder ?? null,
        helpText: input.helpText ?? null,
        isRequired: input.isRequired,
        options: isChoiceType(input.fieldType) ? input.options : undefined,
        displayOrder: input.displayOrder,
        createdById: context.actorUserId ?? null,
      },
    });
    await recordAudit(
      { ...context, ...(owner.companyId ? { companyId: owner.companyId } : {}) },
      {
        module: MODULE,
        eventType: "request_field.created",
        action: `Added request field "${field.label}" to ${owner.label}`,
        targetType: "request_field",
        targetId: field.id,
        targetLabel: field.label,
      },
      tx,
    );
    return field;
  });
}

export async function updateRequestField(context: AuditContext, id: string, input: RequestFieldInput) {
  const existing = await db.requestField.findFirst({ where: { id, deletedAt: null } });
  if (!existing) throw new NotFoundError("Request field not found.");
  const owner = await resolveOwner({
    applicationId: existing.applicationId ?? undefined,
    assetCategoryId: existing.assetCategoryId ?? undefined,
  });
  const duplicate = await db.requestField.findFirst({
    where: {
      id: { not: id },
      deletedAt: null,
      applicationId: existing.applicationId,
      assetCategoryId: existing.assetCategoryId,
      label: { equals: input.label, mode: "insensitive" },
    },
  });
  if (duplicate) throw new ValidationError(undefined, { label: "A field with this label already exists here." });

  return db.$transaction(async (tx) => {
    // fieldKey is deliberately left alone: answers already stored on submitted
    // requests are keyed by it.
    const field = await tx.requestField.update({
      where: { id },
      data: {
        label: input.label,
        fieldType: input.fieldType,
        placeholder: input.placeholder ?? null,
        helpText: input.helpText ?? null,
        isRequired: input.isRequired,
        options: isChoiceType(input.fieldType) ? input.options : undefined,
        displayOrder: input.displayOrder,
        updatedById: context.actorUserId ?? null,
      },
    });
    await recordAudit(
      { ...context, ...(owner.companyId ? { companyId: owner.companyId } : {}) },
      {
        module: MODULE,
        eventType: "request_field.updated",
        action: `Updated request field "${field.label}" on ${owner.label}`,
        targetType: "request_field",
        targetId: id,
        targetLabel: field.label,
      },
      tx,
    );
    return field;
  });
}

export async function setRequestFieldActive(context: AuditContext, id: string, isActive: boolean) {
  const existing = await db.requestField.findFirst({ where: { id, deletedAt: null } });
  if (!existing) throw new NotFoundError("Request field not found.");
  const owner = await resolveOwner({
    applicationId: existing.applicationId ?? undefined,
    assetCategoryId: existing.assetCategoryId ?? undefined,
  });
  return db.$transaction(async (tx) => {
    const field = await tx.requestField.update({ where: { id }, data: { isActive } });
    await recordAudit(
      { ...context, ...(owner.companyId ? { companyId: owner.companyId } : {}) },
      {
        module: MODULE,
        eventType: isActive ? "request_field.enabled" : "request_field.disabled",
        action: `${isActive ? "Enabled" : "Disabled"} request field "${field.label}" on ${owner.label}`,
        targetType: "request_field",
        targetId: id,
        targetLabel: field.label,
      },
      tx,
    );
    return field;
  });
}

export async function deleteRequestField(context: AuditContext, id: string) {
  const existing = await db.requestField.findFirst({ where: { id, deletedAt: null } });
  if (!existing) throw new NotFoundError("Request field not found.");
  const owner = await resolveOwner({
    applicationId: existing.applicationId ?? undefined,
    assetCategoryId: existing.assetCategoryId ?? undefined,
  });
  return db.$transaction(async (tx) => {
    // Soft delete: answers on historic requests keep their meaning.
    await tx.requestField.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false, updatedById: context.actorUserId ?? null },
    });
    await recordAudit(
      { ...context, ...(owner.companyId ? { companyId: owner.companyId } : {}) },
      {
        module: MODULE,
        eventType: "request_field.deleted",
        action: `Removed request field "${existing.label}" from ${owner.label}`,
        targetType: "request_field",
        targetId: id,
        targetLabel: existing.label,
      },
      tx,
    );
    return { id };
  });
}
