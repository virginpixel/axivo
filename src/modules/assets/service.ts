import { db, type DbClient } from "@/shared/db";
import { formatDateTimeWithZone } from "@/shared/utils";
import { recordAudit, diffRecords, type AuditContext } from "@/shared/audit/audit";
import { BusinessRuleError, NotFoundError, ValidationError } from "@/shared/errors";
import { createGeneratedPdf } from "@/modules/documents/service";
import { queueNotification } from "@/modules/notifications/service";
import { issueToken, tokenActionUrl, revokeTokensForTarget } from "@/shared/tokens/secure-tokens";
import { validateCustomFieldValue, type CustomFieldFormat } from "@/modules/catalogs/format";
import type { AssetStatus } from "@prisma/client";
import type {
  AssetCategoryInput,
  AssetInput,
  AssetAssignmentInput,
  MaintenanceInput,
  DisposalInput,
  AssetTransferInput,
  ClearanceVerifyInput,
} from "./validators";

/**
 * Assets module business logic (SDS Doc 11).
 * Lifecycle: Available → Assigned → Returned → ... → Discarded. One active
 * assignment per asset; handover acknowledgement via secure email link when
 * the category requires it; clearance recovers all assigned assets; disposal
 * requires a linked disposal document. All history immutable.
 */

const MODULE = "assets";

// ---------------------------------------------------------------------------
// Categories (Doc 11 Ch3)
// ---------------------------------------------------------------------------

export async function createAssetCategory(context: AuditContext, input: AssetCategoryInput) {
  const duplicate = await db.assetCategory.findFirst({
    where: {
      name: { equals: input.name, mode: "insensitive" },
      deletedAt: null,
    },
  });
  if (duplicate) {
    throw new ValidationError(undefined, { name: "A category with this name already exists." });
  }
  return db.$transaction(async (tx) => {
    const category = await tx.assetCategory.create({
      data: { ...input, createdById: context.actorUserId ?? null },
    });
    await recordAudit(
      context,
      {
        module: MODULE,
        eventType: "category.created",
        action: `Created asset category "${category.name}"`,
        targetType: "asset_category",
        targetId: category.id,
        targetLabel: category.name,
      },
      tx,
    );
    return category;
  });
}

export async function updateAssetCategory(context: AuditContext, id: string, input: AssetCategoryInput) {
  const existing = await db.assetCategory.findFirst({ where: { id, deletedAt: null } });
  if (!existing) throw new NotFoundError("Asset category not found.");
  const duplicate = await db.assetCategory.findFirst({
    where: {
      name: { equals: input.name, mode: "insensitive" },
      deletedAt: null,
      id: { not: id },
    },
  });
  if (duplicate) {
    throw new ValidationError(undefined, { name: "A category with this name already exists." });
  }
  return db.$transaction(async (tx) => {
    const category = await tx.assetCategory.update({
      where: { id },
      data: { ...input, updatedById: context.actorUserId ?? null },
    });
    await recordAudit(
      context,
      {
        module: MODULE,
        eventType: "category.updated",
        action: `Updated asset category "${category.name}"`,
        targetType: "asset_category",
        targetId: id,
        targetLabel: category.name,
        fieldChanges: diffRecords(
          existing as unknown as Record<string, unknown>,
          category as unknown as Record<string, unknown>,
          ["name", "description", "requireHandoverAcceptance", "requireClearanceRecovery"],
        ),
      },
      tx,
    );
    return category;
  });
}

export async function setAssetCategoryActive(context: AuditContext, id: string, isActive: boolean) {
  const existing = await db.assetCategory.findFirst({ where: { id, deletedAt: null } });
  if (!existing) throw new NotFoundError("Asset category not found.");
  return db.$transaction(async (tx) => {
    const category = await tx.assetCategory.update({ where: { id }, data: { isActive } });
    await recordAudit(
      context,
      {
        module: MODULE,
        eventType: isActive ? "category.enabled" : "category.disabled",
        action: `${isActive ? "Enabled" : "Disabled"} asset category "${category.name}"`,
        targetType: "asset_category",
        targetId: id,
        targetLabel: category.name,
      },
      tx,
    );
    return category;
  });
}

// ---------------------------------------------------------------------------
// Assets (Doc 11 Ch2/4)
// ---------------------------------------------------------------------------

/**
 * Validate and clean custom field values against the asset model's fieldset.
 * Enforces required fields and per-field formats; returns only recognised keys.
 */
async function normalizeAssetCustomFields(
  modelName: string | null | undefined,
  values: Record<string, string> | undefined,
): Promise<Record<string, string> | undefined> {
  if (!modelName) return undefined;
  const model = await db.assetModel.findFirst({
    where: { name: modelName, deletedAt: null },
    include: { fieldSet: { include: { fields: { orderBy: { sortOrder: "asc" }, include: { customField: true } } } } },
  });
  const fields = model?.fieldSet?.fields ?? [];
  if (fields.length === 0) return undefined;
  const clean: Record<string, string> = {};
  for (const field of fields) {
    const raw = (values?.[field.customFieldId] ?? "").trim();
    if (!raw) {
      if (field.required) {
        throw new ValidationError(undefined, { [`cf_${field.customFieldId}`]: `${field.customField.name} is required.` });
      }
      continue;
    }
    const error = validateCustomFieldValue(field.customField.format as CustomFieldFormat, raw);
    if (error) throw new ValidationError(undefined, { [`cf_${field.customFieldId}`]: error });
    clean[field.customFieldId] = raw;
  }
  return clean;
}

export async function createAsset(context: AuditContext, input: AssetInput) {
  const category = await db.assetCategory.findFirst({
    where: { id: input.categoryId, deletedAt: null },
  });
  if (!category) throw new BusinessRuleError("Asset category not found.");
  if (!category.isActive) throw new BusinessRuleError("Disabled categories cannot receive new assets.");
  if (input.assetTag) {
    const duplicateTag = await db.asset.findFirst({
      where: {
        companyId: input.companyId,
        assetTag: { equals: input.assetTag, mode: "insensitive" },
        deletedAt: null,
      },
    });
    if (duplicateTag) {
      throw new ValidationError(undefined, { assetTag: "This asset tag already exists in this company." });
    }
  }
  if (input.locationId) {
    const location = await db.location.findFirst({
      where: { id: input.locationId, companyId: input.companyId, deletedAt: null },
    });
    if (!location) throw new BusinessRuleError("The location must belong to the same company.");
  }
  const customFields = await normalizeAssetCustomFields(input.model, input.customFields);
  return db.$transaction(async (tx) => {
    const asset = await tx.asset.create({
      data: { ...input, customFields: customFields ?? undefined, assetTag: input.assetTag ?? null, createdById: context.actorUserId ?? null },
    });
    await recordAudit(
      { ...context, companyId: input.companyId },
      {
        module: MODULE,
        eventType: "asset.created",
        action: `Created asset "${asset.name}"${asset.assetTag ? ` (${asset.assetTag})` : ""}`,
        targetType: "asset",
        targetId: asset.id,
        targetLabel: asset.name,
      },
      tx,
    );
    return asset;
  });
}

export async function updateAsset(context: AuditContext, id: string, input: AssetInput) {
  const existing = await db.asset.findFirst({ where: { id, deletedAt: null } });
  if (!existing) throw new NotFoundError("Asset not found.");
  if (existing.companyId !== input.companyId) {
    throw new BusinessRuleError("Assets cannot be moved between companies unless explicitly transferred.");
  }
  if (input.assetTag) {
    const duplicateTag = await db.asset.findFirst({
      where: {
        companyId: input.companyId,
        assetTag: { equals: input.assetTag, mode: "insensitive" },
        deletedAt: null,
        id: { not: id },
      },
    });
    if (duplicateTag) {
      throw new ValidationError(undefined, { assetTag: "This asset tag already exists in this company." });
    }
  }
  const customFields = await normalizeAssetCustomFields(input.model, input.customFields);
  return db.$transaction(async (tx) => {
    const asset = await tx.asset.update({
      where: { id },
      data: { ...input, customFields: customFields ?? undefined, assetTag: input.assetTag ?? null, updatedById: context.actorUserId ?? null },
    });
    await recordAudit(
      { ...context, companyId: input.companyId },
      {
        module: MODULE,
        eventType: "asset.updated",
        action: `Updated asset "${asset.name}"`,
        targetType: "asset",
        targetId: id,
        targetLabel: asset.name,
        fieldChanges: diffRecords(
          existing as unknown as Record<string, unknown>,
          asset as unknown as Record<string, unknown>,
          ["name", "assetTag", "serialNumber", "manufacturer", "model", "categoryId", "locationId", "supplier", "warrantyExpiry", "notes"],
        ),
      },
      tx,
    );
    return asset;
  });
}

const MANUAL_STATUS_TRANSITIONS: Record<AssetStatus, AssetStatus[]> = {
  AVAILABLE: ["RESERVED", "OUT_OF_ORDER", "UNDER_REPAIR"],
  ASSIGNED: [], // leave via return / clearance only
  UNDER_REPAIR: ["AVAILABLE", "OUT_OF_ORDER"],
  OUT_OF_ORDER: ["AVAILABLE", "UNDER_REPAIR"],
  RESERVED: ["AVAILABLE"],
  DISCARDED: [], // permanent (Doc 11 Ch4)
};

export async function setAssetStatus(context: AuditContext, id: string, status: AssetStatus) {
  const existing = await db.asset.findFirst({ where: { id, deletedAt: null } });
  if (!existing) throw new NotFoundError("Asset not found.");
  if (existing.status === status) return existing;
  if (status === "DISCARDED") {
    throw new BusinessRuleError("Assets are discarded through the disposal process.");
  }
  if (status === "ASSIGNED") {
    throw new BusinessRuleError("Assets become Assigned through the assignment process.");
  }
  if (!MANUAL_STATUS_TRANSITIONS[existing.status].includes(status)) {
    throw new BusinessRuleError(`An asset cannot move from ${existing.status} to ${status}.`);
  }
  return db.$transaction(async (tx) => {
    const asset = await tx.asset.update({
      where: { id },
      data: { status, updatedById: context.actorUserId ?? null },
    });
    await recordAudit(
      { ...context, companyId: asset.companyId },
      {
        module: MODULE,
        eventType: "asset.status_changed",
        action: `Changed asset "${asset.name}" status to ${status}`,
        targetType: "asset",
        targetId: id,
        targetLabel: asset.name,
        fieldChanges: [{ field: "status", previousValue: existing.status, newValue: status }],
      },
      tx,
    );
    return asset;
  });
}

// ---------------------------------------------------------------------------
// Assignments & returns (Doc 11 Ch5)
// ---------------------------------------------------------------------------

export async function assignAsset(
  context: AuditContext,
  input: AssetAssignmentInput,
  options: { requestItemId?: string; skipHandover?: boolean; allowCrossCompany?: boolean } = {},
  client?: DbClient,
) {
  const run = async (tx: DbClient) => {
    const [asset, person] = await Promise.all([
      tx.asset.findFirst({ where: { id: input.assetId, deletedAt: null }, include: { category: true } }),
      tx.person.findFirst({ where: { id: input.personId, deletedAt: null } }),
    ]);
    if (!asset) throw new NotFoundError("Asset not found.");
    if (!person) throw new NotFoundError("Employee not found.");
    if (!person.isActive) throw new BusinessRuleError("Only active employees may receive assets.");
    if (asset.companyId !== person.companyId && !options.allowCrossCompany) {
      throw new BusinessRuleError("Assets cannot be assigned across companies unless explicitly transferred.");
    }
    if (asset.status !== "AVAILABLE" && asset.status !== "RESERVED") {
      throw new BusinessRuleError(`Only Available assets may be assigned (current status: ${asset.status}).`);
    }
    const activeAssignment = await tx.assetAssignment.findFirst({
      where: { assetId: input.assetId, status: { in: ["PENDING", "ASSIGNED"] }, deletedAt: null },
    });
    if (activeAssignment) {
      throw new BusinessRuleError("This asset already has an active assignment.");
    }

    const assignment = await tx.assetAssignment.create({
      data: {
        assetId: input.assetId,
        personId: input.personId,
        requestItemId: options.requestItemId ?? null,
        status: "ASSIGNED",
        assignedById: context.actorUserId ?? null,
        assignedByLabel: context.actorName ?? context.actorLabel,
        notes: input.notes ?? null,
      },
    });
    await tx.asset.update({ where: { id: input.assetId }, data: { status: "ASSIGNED" } });
    await recordAudit(
      { ...context, companyId: asset.companyId },
      {
        module: MODULE,
        eventType: "asset.assigned",
        action: `Assigned asset "${asset.name}" to ${person.firstName} ${person.lastName}`,
        targetType: "asset_assignment",
        targetId: assignment.id,
        targetLabel: asset.name,
      },
      tx,
    );
    return { assignment, requiresHandover: asset.category.requireHandoverAcceptance && !options.skipHandover };
  };

  if (client) return run(client);
  const result = await db.$transaction(async (tx) => run(tx));
  // Handover generation happens after the assignment transaction commits so a
  // PDF/email failure never rolls back the assignment (Doc 02 Ch13). A failure
  // here must not surface as an error - the assignment already succeeded.
  if (result.requiresHandover) {
    try {
      await createHandoverForAssignments(context, result.assignment.personId, [result.assignment.id]);
    } catch (error) {
      console.error("[axivo] Asset assigned but handover generation failed:", error);
    }
  }
  return result;
}

export async function returnAsset(context: AuditContext, assignmentId: string, notes?: string) {
  const existing = await db.assetAssignment.findFirst({
    where: { id: assignmentId, deletedAt: null },
    include: { asset: true, person: true },
  });
  if (!existing) throw new NotFoundError("Asset assignment not found.");
  if (existing.status !== "ASSIGNED" && existing.status !== "PENDING") {
    throw new BusinessRuleError("Only active assignments can be returned.");
  }
  return db.$transaction(async (tx) => {
    const assignment = await tx.assetAssignment.update({
      where: { id: assignmentId },
      data: {
        status: "RETURNED",
        returnedAt: new Date(),
        returnedById: context.actorUserId ?? null,
        notes: notes ?? existing.notes,
      },
    });
    // Returning restores Available unless another operational status applies (Doc 11 Ch5).
    await tx.asset.update({ where: { id: existing.assetId }, data: { status: "AVAILABLE" } });
    await recordAudit(
      { ...context, companyId: existing.asset.companyId },
      {
        module: MODULE,
        eventType: "asset.returned",
        action: `Returned asset "${existing.asset.name}" from ${existing.person.firstName} ${existing.person.lastName}`,
        targetType: "asset_assignment",
        targetId: assignmentId,
        targetLabel: existing.asset.name,
      },
      tx,
    );
    return assignment;
  });
}

// ---------------------------------------------------------------------------
// Handover (Doc 11 Ch6)
// ---------------------------------------------------------------------------

/**
 * Build and store the handover PDF for one handover, reflecting its current
 * acknowledgement state. Passing an existing document id regenerates that same
 * document as a new version rather than creating a second one: once the
 * employee acknowledges, the single form on file is replaced by the signed
 * version so no stale "Not yet acknowledged" copy is left behind.
 */
async function generateHandoverDocument(
  context: AuditContext,
  handoverId: string,
  existingDocumentId?: string,
) {
  const handover = await db.handover.findFirstOrThrow({
    where: { id: handoverId },
    include: {
      person: { include: { company: true, department: true, position: true } },
      assets: { include: { assetAssignment: { include: { asset: true } } } },
    },
  });
  const person = handover.person;
  const assignments = handover.assets.map((entry) => entry.assetAssignment);
  const licenseAssignments = await db.licenseAssignment.findMany({
    where: { personId: person.id, status: { in: ["ACTIVE", "PENDING"] }, deletedAt: null },
    include: { license: { include: { application: true } } },
  });

  return createGeneratedPdf(context, {
    companyId: person.companyId,
    ...(existingDocumentId ? { existingDocumentId, changeSummary: "Acknowledged" } : {}),
    name: `Asset Handover - ${person.firstName} ${person.lastName} - ${new Date().toISOString().slice(0, 10)}`,
    categoryName: "Asset Handover",
    links: [
      { entityType: "handover", entityId: handover.id },
      { entityType: "person", entityId: person.id },
      ...assignments.map((a) => ({ entityType: "asset", entityId: a.assetId })),
    ],
    definition: {
      title: "Asset Handover Form",
      branding: { systemName: "Axivo", companyName: person.company.name },
      sections: [
        {
          heading: "Employee",
          fields: [
            { label: "Name", value: `${person.firstName} ${person.lastName}` },
            { label: "Employee ID", value: person.employeeId },
            { label: "Company", value: person.company.name },
            { label: "Department", value: person.department?.name ?? "None" },
            { label: "Position", value: person.position?.name ?? "None" },
            { label: "Email", value: person.email },
          ],
        },
        {
          heading: "Assets",
          table: {
            headers: ["Asset", "Tag", "Serial Number", "Model", "Assigned"],
            rows: assignments.map((a) => [
              a.asset.name,
              a.asset.assetTag ?? "None",
              a.asset.serialNumber ?? "None",
              a.asset.model ?? "None",
              a.assignedAt.toISOString().slice(0, 10),
            ]),
          },
        },
        ...(licenseAssignments.length > 0
          ? [
              {
                heading: "Software Licenses",
                table: {
                  headers: ["License", "Application", "Assigned"],
                  rows: licenseAssignments.map((la) => [
                    la.license.name,
                    la.license.application?.name ?? "None",
                    la.assignedAt.toISOString().slice(0, 10),
                  ]),
                },
              },
            ]
          : []),
        {
          heading: "Terms of Responsibility",
          paragraphs: [
            "I hereby acknowledge that I have received the above mentioned asset/s. I understand that this/these asset/s belong to Dream Islands Development 2 Pvt. Ltd and is/are under my possession for carrying out my office work. I hereby assure that I will take care of the assets of the company to the best possible extent. Also, I am bound to return the specific asset/s when required by the company or at the termination of my employment.",
          ],
        },
        {
          // Filled in once the employee acknowledges through the secure link.
          // Present but blank beforehand, so a printed copy has a place for it.
          heading: "Acknowledgement",
          fields: [
            {
              label: "Acknowledged on",
              value: handover.acknowledgedAt
                ? formatDateTimeWithZone(handover.acknowledgedAt)
                : "Not yet acknowledged",
            },
          ],
        },
      ],
      footerNote:
        "Electronic acknowledgement is recorded with a timestamp and is legally binding within company policy.",
    },
  });
}

/**
 * Generate a handover document covering one or more assignments and email a
 * secure acknowledgement link to the employee.
 */
export async function createHandoverForAssignments(
  context: AuditContext,
  personId: string,
  assignmentIds: string[],
  send = true,
) {
  const person = await db.person.findFirst({
    where: { id: personId, deletedAt: null },
  });
  if (!person) throw new NotFoundError("Employee not found.");
  const assignments = await db.assetAssignment.findMany({
    where: { id: { in: assignmentIds }, personId, status: "ASSIGNED", deletedAt: null },
  });
  if (assignments.length === 0) {
    throw new BusinessRuleError("No eligible assignments for handover.");
  }

  const handover = await db.$transaction(async (tx) => {
    const created = await tx.handover.create({
      data: {
        companyId: person.companyId,
        personId,
        status: "PENDING",
        createdById: context.actorUserId ?? null,
        assets: { create: assignments.map((a) => ({ assetAssignmentId: a.id })) },
      },
    });
    await recordAudit(
      { ...context, companyId: person.companyId },
      {
        module: MODULE,
        eventType: "handover.generated",
        action: `Generated asset handover for ${person.firstName} ${person.lastName} (${assignments.length} asset(s))`,
        targetType: "handover",
        targetId: created.id,
      },
      tx,
    );
    return created;
  });

  // Generate the handover PDF and link it.
  const document = await generateHandoverDocument(context, handover.id);
  await db.handover.update({ where: { id: handover.id }, data: { documentId: document.id } });

  // When generated manually the form is previewed first, then sent explicitly
  // via sendHandover. Automatic (assignment-triggered) handovers send now.
  if (send) {
    await sendHandover(context, handover.id);
  }
  return db.handover.findUniqueOrThrow({ where: { id: handover.id } });
}

/** Send (or resend) the secure acknowledgement email for a generated handover. */
export async function sendHandover(
  context: AuditContext,
  handoverId: string,
  overrideEmail?: string,
) {
  const handover = await db.handover.findFirst({
    where: { id: handoverId },
    include: { person: true, assets: true },
  });
  if (!handover) throw new NotFoundError("Handover not found.");
  if (handover.status === "ACKNOWLEDGED") {
    throw new BusinessRuleError("This handover has already been acknowledged.");
  }
  const person = handover.person;
  // Resending invalidates any previous link and, when given, uses a one-off
  // address without touching the employee profile.
  const recipientEmail = overrideEmail?.trim() || person.email;
  await revokeTokensForTarget("handover", handover.id);
  const { token } = await issueToken({
    purpose: "ASSET_HANDOVER",
    email: recipientEmail,
    personId: person.id,
    targetType: "handover",
    targetId: handover.id,
  });
  const url = await tokenActionUrl("/action/handover", token);
  await queueNotification({
    companyId: handover.companyId,
    eventType: "ASSET_HANDOVER",
    templateKey: "asset_handover",
    variables: {
      employeeName: `${person.firstName} ${person.lastName}`,
      assetCount: String(handover.assets.length),
      actionUrl: url,
    },
    subject: "Asset handover acknowledgement required",
    body: `Dear ${person.firstName},<br/><br/>Company assets have been assigned to you. Please review and acknowledge receipt using the secure link below.<br/><br/><a href="${url}">Review and acknowledge asset handover</a>`,
    recipients: [{ email: recipientEmail, name: `${person.firstName} ${person.lastName}`, personId: person.id }],
    entityType: "handover",
    entityId: handover.id,
    dedupeKey: `handover:${handover.id}:sent:${Date.now()}`,
  });
  await db.handover.update({ where: { id: handover.id }, data: { sentAt: new Date() } });
  await recordAudit(
    { ...context, companyId: handover.companyId },
    {
      module: MODULE,
      eventType: "handover.sent",
      action: `Sent handover acknowledgement to ${person.firstName} ${person.lastName}${overrideEmail ? ` at ${recipientEmail}` : ""}`,
      targetType: "handover",
      targetId: handover.id,
    },
  );
  return handover;
}

/** Acknowledge a handover through its secure token (public action). */
export async function acknowledgeHandover(context: AuditContext, handoverId: string) {
  const handover = await db.handover.findFirst({
    where: { id: handoverId },
    include: { person: true, assets: true },
  });
  if (!handover) throw new NotFoundError("Handover not found.");
  if (handover.status === "ACKNOWLEDGED") {
    throw new BusinessRuleError("This handover has already been acknowledged.");
  }
  const now = new Date();
  await db.$transaction(async (tx) => {
    await tx.handover.update({
      where: { id: handoverId },
      data: { status: "ACKNOWLEDGED", acknowledgedAt: now },
    });
    await tx.assetAssignment.updateMany({
      where: { id: { in: handover.assets.map((a) => a.assetAssignmentId) } },
      data: { acknowledgedAt: now },
    });
    await recordAudit(
      { ...context, companyId: handover.companyId },
      {
        module: MODULE,
        eventType: "handover.acknowledged",
        action: `Handover acknowledged by ${handover.person.firstName} ${handover.person.lastName}`,
        targetType: "handover",
        targetId: handoverId,
      },
      tx,
    );
  });

  // Replace the stored form with its acknowledged version, so the document on
  // file carries the signature timestamp instead of "Not yet acknowledged".
  // Regenerating the same document (rather than adding a second one) means the
  // pending copy does not linger in the employee's document list.
  if (handover.documentId) {
    await generateHandoverDocument(context, handoverId, handover.documentId);
  } else {
    const document = await generateHandoverDocument(context, handoverId);
    await db.handover.update({ where: { id: handoverId }, data: { documentId: document.id } });
  }
}

// ---------------------------------------------------------------------------
// Clearance (Doc 11 Ch7)
// ---------------------------------------------------------------------------

export async function startClearance(context: AuditContext, personId: string, notes?: string) {
  const person = await db.person.findFirst({ where: { id: personId, deletedAt: null } });
  if (!person) throw new NotFoundError("Employee not found.");
  const openClearance = await db.clearance.findFirst({
    where: { personId, status: "IN_PROGRESS" },
  });
  if (openClearance) {
    throw new BusinessRuleError("A clearance is already in progress for this employee.");
  }
  // Every open assignment is identified automatically: assets, application
  // access and license seats (Doc 11 Ch7). Each becomes a clearance item.
  const [assetAssignments, appAssignments, licenseAssignments] = await Promise.all([
    db.assetAssignment.findMany({ where: { personId, status: "ASSIGNED", deletedAt: null }, include: { asset: true } }),
    db.applicationAssignment.findMany({ where: { personId, status: "ACTIVE", deletedAt: null }, include: { application: true } }),
    db.licenseAssignment.findMany({ where: { personId, status: "ACTIVE", deletedAt: null }, include: { license: true } }),
  ]);
  const totalItems = assetAssignments.length + appAssignments.length + licenseAssignments.length;

  return db.$transaction(async (tx) => {
    const clearance = await tx.clearance.create({
      data: {
        companyId: person.companyId,
        personId,
        status: "IN_PROGRESS",
        notes,
        itRepresentativeId: context.actorUserId ?? null,
        createdById: context.actorUserId ?? null,
        items: {
          create: [
            ...assetAssignments.map((assignment) => ({ kind: "ASSET" as const, assetAssignmentId: assignment.id })),
            ...appAssignments.map((assignment) => ({ kind: "APPLICATION" as const, applicationAssignmentId: assignment.id })),
            ...licenseAssignments.map((assignment) => ({ kind: "LICENSE" as const, licenseAssignmentId: assignment.id })),
          ],
        },
      },
    });
    await recordAudit(
      { ...context, companyId: person.companyId },
      {
        module: MODULE,
        eventType: "clearance.started",
        action: `Started clearance for ${person.firstName} ${person.lastName} (${totalItems} item(s))`,
        targetType: "clearance",
        targetId: clearance.id,
      },
      tx,
    );
    return clearance;
  });
}

/** Cancel an in-progress clearance without changing any assignments (Doc 11 Ch7). */
export async function cancelClearance(context: AuditContext, clearanceId: string) {
  const clearance = await db.clearance.findFirst({ where: { id: clearanceId }, include: { person: true } });
  if (!clearance) throw new NotFoundError("Clearance not found.");
  if (clearance.status !== "IN_PROGRESS") throw new BusinessRuleError("This clearance is no longer in progress.");
  await db.clearance.update({ where: { id: clearanceId }, data: { status: "CANCELLED" } });
  await recordAudit(
    { ...context, companyId: clearance.companyId },
    {
      module: MODULE,
      eventType: "clearance.cancelled",
      action: `Cancelled clearance for ${clearance.person.firstName} ${clearance.person.lastName}`,
      targetType: "clearance",
      targetId: clearanceId,
    },
  );
  return clearance.id;
}

/** Remove a single item from an in-progress clearance (e.g. handled separately). */
export async function removeClearanceItem(context: AuditContext, clearanceItemId: string) {
  const item = await db.clearanceItem.findFirst({ where: { id: clearanceItemId }, include: { clearance: true } });
  if (!item) throw new NotFoundError("Clearance item not found.");
  if (item.clearance.status !== "IN_PROGRESS") throw new BusinessRuleError("This clearance is no longer in progress.");
  await db.clearanceItem.delete({ where: { id: clearanceItemId } });
  await recordAudit(
    { ...context, companyId: item.clearance.companyId },
    {
      module: MODULE,
      eventType: "clearance.item_removed",
      action: `Removed an item from clearance`,
      targetType: "clearance",
      targetId: item.clearanceId,
    },
  );
  return item.clearanceId;
}

export async function verifyClearanceItem(context: AuditContext, input: ClearanceVerifyInput) {
  const item = await db.clearanceItem.findFirst({
    where: { id: input.clearanceItemId },
    include: {
      clearance: true,
      assetAssignment: { include: { asset: true } },
      applicationAssignment: { include: { application: true } },
      licenseAssignment: { include: { license: true } },
    },
  });
  if (!item) throw new NotFoundError("Clearance item not found.");
  if (item.clearance.status !== "IN_PROGRESS") {
    throw new BusinessRuleError("This clearance is no longer in progress.");
  }
  const label =
    item.assetAssignment?.asset.name ??
    item.applicationAssignment?.application.name ??
    item.licenseAssignment?.license.name ??
    "item";
  return db.$transaction(async (tx) => {
    await tx.clearanceItem.update({
      where: { id: item.id },
      data: {
        status: input.status,
        comments: input.comments ?? null,
        verifiedAt: new Date(),
        verifiedById: context.actorUserId ?? null,
      },
    });
    await recordAudit(
      { ...context, companyId: item.clearance.companyId },
      {
        module: MODULE,
        eventType: "clearance.item_verified",
        action: `Verified ${item.kind.toLowerCase()} "${label}" as ${input.status}`,
        targetType: "clearance_item",
        targetId: item.id,
        targetLabel: label,
        details: input.comments ? { comments: input.comments } : undefined,
      },
      tx,
    );
  });
}

export async function completeClearance(
  context: AuditContext,
  clearanceId: string,
  finalStatus: "RESIGNED" | "TERMINATED" = "RESIGNED",
) {
  const clearance = await db.clearance.findFirst({
    where: { id: clearanceId },
    include: {
      person: { include: { company: true, department: true, position: true } },
      items: {
        include: {
          assetAssignment: { include: { asset: true } },
          applicationAssignment: { include: { application: true } },
          licenseAssignment: { include: { license: true } },
        },
      },
    },
  });
  if (!clearance) throw new NotFoundError("Clearance not found.");
  if (clearance.status !== "IN_PROGRESS") {
    throw new BusinessRuleError("This clearance is not in progress.");
  }
  const unverified = clearance.items.filter((item) => item.status === "PENDING");
  if (unverified.length > 0) {
    throw new BusinessRuleError(
      `${unverified.length} item(s) have not been verified yet. Verify every item before completing clearance.`,
    );
  }

  const now = new Date();
  await db.$transaction(async (tx) => {
    await tx.clearance.update({
      where: { id: clearanceId },
      data: { status: "COMPLETED", completedAt: now, completedById: context.actorUserId ?? null },
    });
    for (const item of clearance.items) {
      if (item.kind === "ASSET" && item.assetAssignment) {
        // Received assets return to the pool; missing/damaged go out of order.
        await tx.assetAssignment.update({
          where: { id: item.assetAssignment.id },
          data: { status: "RETURNED", returnedAt: now, returnedById: context.actorUserId ?? null },
        });
        const newStatus: AssetStatus = item.status === "RECEIVED" ? "AVAILABLE" : "OUT_OF_ORDER";
        await tx.asset.update({ where: { id: item.assetAssignment.assetId }, data: { status: newStatus } });
      } else if (item.kind === "APPLICATION" && item.applicationAssignment) {
        // Revoke application access as part of clearance.
        await tx.applicationAssignment.update({
          where: { id: item.applicationAssignment.id },
          data: { status: "REMOVED", removedAt: now, removalReason: "Employee clearance" },
        });
      } else if (item.kind === "LICENSE" && item.licenseAssignment) {
        // Return the license seat to the pool.
        await tx.licenseAssignment.update({
          where: { id: item.licenseAssignment.id },
          data: { status: "REMOVED", removedAt: now, removedById: context.actorUserId ?? null },
        });
      }
    }
    // The departing employee's status is set to the chosen outcome.
    await tx.person.update({
      where: { id: clearance.personId },
      data: { employmentStatus: finalStatus, isActive: false },
    });
    await recordAudit(
      { ...context, companyId: clearance.companyId },
      {
        module: MODULE,
        eventType: "clearance.completed",
        action: `Completed clearance for ${clearance.person.firstName} ${clearance.person.lastName} (${finalStatus.toLowerCase()})`,
        targetType: "clearance",
        targetId: clearanceId,
      },
      tx,
    );
  });

  // Generate the permanent clearance document after commit. A failure here must
  // not surface as an error - the clearance is already completed in the database.
  try {
  const document = await createGeneratedPdf(context, {
    companyId: clearance.companyId,
    name: `Clearance - ${clearance.person.firstName} ${clearance.person.lastName} - ${now.toISOString().slice(0, 10)}`,
    categoryName: "Clearance",
    links: [
      { entityType: "clearance", entityId: clearance.id },
      { entityType: "person", entityId: clearance.personId },
    ],
    definition: {
      title: "Asset Clearance Form",
      branding: { systemName: "Axivo", companyName: clearance.person.company.name },
      sections: [
        {
          heading: "Employee",
          fields: [
            { label: "Name", value: `${clearance.person.firstName} ${clearance.person.lastName}` },
            { label: "Employee ID", value: clearance.person.employeeId },
            { label: "Company", value: clearance.person.company.name },
            { label: "Department", value: clearance.person.department?.name ?? "None" },
            { label: "Position", value: clearance.person.position?.name ?? "None" },
          ],
        },
        {
          heading: "Recovered Items",
          table: {
            headers: ["Type", "Item", "Reference", "Status", "Comments"],
            rows: clearance.items.map((item) => {
              const type = item.kind.charAt(0) + item.kind.slice(1).toLowerCase();
              if (item.kind === "ASSET" && item.assetAssignment) {
                return [type, item.assetAssignment.asset.name, item.assetAssignment.asset.assetTag ?? "None", item.status, item.comments ?? "None"];
              }
              if (item.kind === "APPLICATION" && item.applicationAssignment) {
                return [type, item.applicationAssignment.application.name, item.applicationAssignment.username ?? "None", item.status, item.comments ?? "None"];
              }
              if (item.kind === "LICENSE" && item.licenseAssignment) {
                return [type, item.licenseAssignment.license.name, "seat", item.status, item.comments ?? "None"];
              }
              return [type, "None", "None", item.status, item.comments ?? "None"];
            }),
          },
        },
        {
          heading: "Completion",
          fields: [
            { label: "Completed at", value: formatDateTimeWithZone(now) },
            { label: "Outcome", value: finalStatus.charAt(0) + finalStatus.slice(1).toLowerCase() },
            { label: "IT representative", value: context.actorLabel },
          ],
        },
      ],
      footerNote: "This clearance record is part of the employee's permanent history.",
    },
  });
  await db.clearance.update({ where: { id: clearanceId }, data: { documentId: document.id } });
  } catch (error) {
    console.error("[axivo] Clearance completed but document generation failed:", error);
  }
  return clearance.id;
}

// ---------------------------------------------------------------------------
// Maintenance (Doc 11 Ch8)
// ---------------------------------------------------------------------------

export async function createMaintenance(context: AuditContext, input: MaintenanceInput) {
  const asset = await db.asset.findFirst({ where: { id: input.assetId, deletedAt: null } });
  if (!asset) throw new NotFoundError("Asset not found.");
  if (asset.status === "ASSIGNED") {
    throw new BusinessRuleError("Assigned assets must be returned before maintenance begins.");
  }
  if (asset.status === "DISCARDED") {
    throw new BusinessRuleError("Discarded assets cannot receive maintenance.");
  }
  return db.$transaction(async (tx) => {
    const maintenance = await tx.assetMaintenance.create({
      data: {
        assetId: input.assetId,
        maintenanceType: input.maintenanceType,
        description: input.description,
        serviceProvider: input.serviceProvider ?? null,
        startDate: input.startDate,
        completionDate: input.completionDate ?? null,
        cost: input.cost ?? null,
        currency: input.currency ?? null,
        notes: input.notes ?? null,
        status: "SCHEDULED",
        previousAssetStatus: asset.status,
        createdById: context.actorUserId ?? null,
      },
    });
    await recordAudit(
      { ...context, companyId: asset.companyId },
      {
        module: MODULE,
        eventType: "maintenance.created",
        action: `Scheduled ${input.maintenanceType} maintenance for "${asset.name}"`,
        targetType: "asset_maintenance",
        targetId: maintenance.id,
        targetLabel: asset.name,
      },
      tx,
    );
    return maintenance;
  });
}

export async function setMaintenanceStatus(
  context: AuditContext,
  id: string,
  status: "IN_PROGRESS" | "COMPLETED" | "CANCELLED",
) {
  const existing = await db.assetMaintenance.findFirst({
    where: { id, deletedAt: null },
    include: { asset: true },
  });
  if (!existing) throw new NotFoundError("Maintenance record not found.");
  if (existing.status === "COMPLETED" || existing.status === "CANCELLED") {
    throw new BusinessRuleError("Completed or cancelled maintenance cannot be changed.");
  }
  return db.$transaction(async (tx) => {
    await tx.assetMaintenance.update({
      where: { id },
      data: {
        status,
        completionDate: status === "COMPLETED" ? new Date() : existing.completionDate,
        updatedById: context.actorUserId ?? null,
      },
    });
    if (status === "IN_PROGRESS") {
      await tx.asset.update({ where: { id: existing.assetId }, data: { status: "UNDER_REPAIR" } });
    } else {
      // Completing restores the previous operational status (Doc 11 Ch8).
      const restored = existing.previousAssetStatus ?? "AVAILABLE";
      await tx.asset.update({ where: { id: existing.assetId }, data: { status: restored } });
    }
    await recordAudit(
      { ...context, companyId: existing.asset.companyId },
      {
        module: MODULE,
        eventType: `maintenance.${status.toLowerCase()}`,
        action: `Maintenance for "${existing.asset.name}" marked ${status}`,
        targetType: "asset_maintenance",
        targetId: id,
        targetLabel: existing.asset.name,
      },
      tx,
    );
  });
}

// ---------------------------------------------------------------------------
// Disposal (Doc 11 Ch9)
// ---------------------------------------------------------------------------

/**
 * Discard one or more assets against a single approved discard form (Doc 11
 * Ch9). One signed form routinely covers a whole batch, so the document is
 * linked to every asset in the batch and each asset keeps its own disposal
 * record.
 */
export async function discardAssets(context: AuditContext, input: DisposalInput) {
  const assets = await db.asset.findMany({ where: { id: { in: input.assetIds }, deletedAt: null } });
  if (assets.length !== input.assetIds.length) throw new NotFoundError("One of the selected assets was not found.");
  for (const asset of assets) {
    if (asset.status === "ASSIGNED") {
      throw new BusinessRuleError(`"${asset.name}" is still assigned. Return it before discarding.`);
    }
    if (asset.status === "DISCARDED") {
      throw new BusinessRuleError(`"${asset.name}" has already been discarded.`);
    }
  }
  // A completed disposal document is required (Doc 11 Ch9). Discard forms live
  // in the shared document repository so one form can cover several companies.
  const document = await db.document.findFirst({ where: { id: input.documentId } });
  if (!document) throw new BusinessRuleError("An approved discard form is required.");

  return db.$transaction(async (tx) => {
    for (const asset of assets) {
      await tx.assetDisposal.create({
        data: {
          assetId: asset.id,
          disposalDate: input.disposalDate,
          method: input.method,
          reason: input.reason,
          disposalValue: input.disposalValue ?? null,
          currency: input.currency ?? null,
          documentId: input.documentId,
          approvedById: context.actorUserId ?? null,
          notes: input.notes ?? null,
          createdById: context.actorUserId ?? null,
        },
      });
      await tx.asset.update({ where: { id: asset.id }, data: { status: "DISCARDED" } });
      const existingLink = await tx.documentLink.findFirst({
        where: { documentId: input.documentId, entityType: "asset", entityId: asset.id },
      });
      if (!existingLink) {
        await tx.documentLink.create({
          data: {
            documentId: input.documentId,
            entityType: "asset",
            entityId: asset.id,
            createdById: context.actorUserId ?? null,
          },
        });
      }
      await recordAudit(
        { ...context, companyId: asset.companyId },
        {
          module: MODULE,
          eventType: "asset.discarded",
          action: `Discarded asset "${asset.name}" (${input.method})`,
          targetType: "asset",
          targetId: asset.id,
          targetLabel: asset.name,
          details: { reason: input.reason, method: input.method, documentId: input.documentId },
        },
        tx,
      );
    }
    return { count: assets.length };
  });
}

/**
 * Permanently remove an asset record. Used for records created in error; real
 * end-of-life goes through the Discarded status so the disposal history stays.
 */
export async function deleteAsset(context: AuditContext, id: string) {
  const asset = await db.asset.findFirst({ where: { id, deletedAt: null } });
  if (!asset) throw new NotFoundError("Asset not found.");
  const activeAssignment = await db.assetAssignment.findFirst({
    where: { assetId: id, status: { in: ["PENDING", "ASSIGNED"] }, deletedAt: null },
  });
  if (activeAssignment) {
    throw new BusinessRuleError("Return the asset from its current holder before deleting the record.");
  }
  return db.$transaction(async (tx) => {
    await tx.asset.update({
      where: { id },
      data: { deletedAt: new Date(), updatedById: context.actorUserId ?? null },
    });
    await recordAudit(
      { ...context, companyId: asset.companyId },
      {
        module: MODULE,
        eventType: "asset.deleted",
        action: `Deleted asset record "${asset.name}"`,
        targetType: "asset",
        targetId: id,
        targetLabel: asset.name,
      },
      tx,
    );
    return { id };
  });
}

// ---------------------------------------------------------------------------
// Transfers
// ---------------------------------------------------------------------------

/**
 * Move an asset to another company, location and/or holder in one step, the way
 * it happens in practice when someone physically carries it somewhere else.
 * The current assignment is only closed when the caller asks for it: a person in
 * one company may legitimately keep holding an asset owned by another.
 */
export async function transferAsset(context: AuditContext, input: AssetTransferInput) {
  const asset = await db.asset.findFirst({ where: { id: input.assetId, deletedAt: null } });
  if (!asset) throw new NotFoundError("Asset not found.");
  if (asset.status === "DISCARDED") throw new BusinessRuleError("Discarded assets cannot be transferred.");

  const targetCompanyId = input.companyId ?? asset.companyId;
  if (input.companyId && input.companyId !== asset.companyId) {
    const company = await db.company.findFirst({ where: { id: input.companyId, deletedAt: null, isActive: true } });
    if (!company) throw new BusinessRuleError("The destination company is not available.");
  }
  if (input.locationId) {
    const location = await db.location.findFirst({
      where: { id: input.locationId, deletedAt: null, isActive: true, companyId: targetCompanyId },
    });
    if (!location) throw new BusinessRuleError("The destination location must belong to the destination company.");
  }

  const activeAssignment = await db.assetAssignment.findFirst({
    where: { assetId: input.assetId, status: { in: ["PENDING", "ASSIGNED"] }, deletedAt: null },
  });
  if (input.personId && activeAssignment && !input.returnCurrentAssignment) {
    throw new BusinessRuleError("Return the current assignment before handing the asset to someone else.");
  }
  if (activeAssignment && input.returnCurrentAssignment) {
    await returnAsset(context, activeAssignment.id, input.notes);
  }

  const changes: string[] = [];
  await db.$transaction(async (tx) => {
    const data: { companyId?: string; locationId?: string | null } = {};
    if (input.companyId && input.companyId !== asset.companyId) {
      data.companyId = input.companyId;
      changes.push("company");
      // A location belongs to a single company, so a stale one must not survive.
      data.locationId = input.locationId ?? null;
    }
    if (input.locationId && input.locationId !== asset.locationId) {
      data.locationId = input.locationId;
      if (!changes.includes("company")) changes.push("location");
    }
    if (Object.keys(data).length > 0) {
      await tx.asset.update({ where: { id: input.assetId }, data: { ...data, updatedById: context.actorUserId ?? null } });
    }
    await recordAudit(
      { ...context, companyId: targetCompanyId },
      {
        module: MODULE,
        eventType: "asset.transferred",
        action: `Transferred asset "${asset.name}"`,
        targetType: "asset",
        targetId: input.assetId,
        targetLabel: asset.name,
        details: {
          fromCompanyId: asset.companyId,
          toCompanyId: targetCompanyId,
          toLocationId: input.locationId ?? null,
          toPersonId: input.personId ?? null,
          returnedPreviousAssignment: !!(activeAssignment && input.returnCurrentAssignment),
        },
      },
      tx,
    );
  });

  if (input.personId) {
    // Cross-company holding is intentional here: the transfer is the explicit
    // approval that assignAsset's same-company rule normally asks for.
    await assignAsset(
      context,
      { assetId: input.assetId, personId: input.personId, notes: input.notes },
      { allowCrossCompany: true },
    );
    changes.push("holder");
  }
  return { id: input.assetId, changes };
}
