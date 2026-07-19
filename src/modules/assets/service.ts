import { db, type DbClient } from "@/shared/db";
import { recordAudit, diffRecords, type AuditContext } from "@/shared/audit/audit";
import { BusinessRuleError, NotFoundError, ValidationError } from "@/shared/errors";
import { createGeneratedPdf } from "@/modules/documents/service";
import { queueNotification } from "@/modules/notifications/service";
import { issueToken, tokenActionUrl } from "@/shared/tokens/secure-tokens";
import type { AssetStatus } from "@prisma/client";
import type {
  AssetCategoryInput,
  AssetInput,
  AssetAssignmentInput,
  MaintenanceInput,
  DisposalInput,
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
      companyId: input.companyId,
      name: { equals: input.name, mode: "insensitive" },
      deletedAt: null,
    },
  });
  if (duplicate) {
    throw new ValidationError(undefined, { name: "A category with this name already exists in this company." });
  }
  return db.$transaction(async (tx) => {
    const category = await tx.assetCategory.create({
      data: { ...input, createdById: context.actorUserId ?? null },
    });
    await recordAudit(
      { ...context, companyId: input.companyId },
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
  if (existing.companyId !== input.companyId) {
    throw new BusinessRuleError("Categories cannot be moved between companies.");
  }
  const duplicate = await db.assetCategory.findFirst({
    where: {
      companyId: input.companyId,
      name: { equals: input.name, mode: "insensitive" },
      deletedAt: null,
      id: { not: id },
    },
  });
  if (duplicate) {
    throw new ValidationError(undefined, { name: "A category with this name already exists in this company." });
  }
  return db.$transaction(async (tx) => {
    const category = await tx.assetCategory.update({
      where: { id },
      data: { ...input, updatedById: context.actorUserId ?? null },
    });
    await recordAudit(
      { ...context, companyId: input.companyId },
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
      { ...context, companyId: category.companyId },
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

export async function createAsset(context: AuditContext, input: AssetInput) {
  const category = await db.assetCategory.findFirst({
    where: { id: input.categoryId, companyId: input.companyId, deletedAt: null },
  });
  if (!category) throw new BusinessRuleError("Asset category must belong to the same company.");
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
  return db.$transaction(async (tx) => {
    const asset = await tx.asset.create({
      data: { ...input, assetTag: input.assetTag ?? null, createdById: context.actorUserId ?? null },
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
  return db.$transaction(async (tx) => {
    const asset = await tx.asset.update({
      where: { id },
      data: { ...input, assetTag: input.assetTag ?? null, updatedById: context.actorUserId ?? null },
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
  options: { requestItemId?: string; skipHandover?: boolean } = {},
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
    if (asset.companyId !== person.companyId) {
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
  // PDF/email failure never rolls back the assignment (Doc 02 Ch13).
  if (result.requiresHandover) {
    await createHandoverForAssignments(context, result.assignment.personId, [result.assignment.id]);
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
 * Generate a handover document covering one or more assignments and email a
 * secure acknowledgement link to the employee.
 */
export async function createHandoverForAssignments(
  context: AuditContext,
  personId: string,
  assignmentIds: string[],
) {
  const person = await db.person.findFirst({
    where: { id: personId, deletedAt: null },
    include: { company: true, department: true },
  });
  if (!person) throw new NotFoundError("Employee not found.");
  const assignments = await db.assetAssignment.findMany({
    where: { id: { in: assignmentIds }, personId, status: "ASSIGNED", deletedAt: null },
    include: { asset: true },
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
  const document = await createGeneratedPdf(context, {
    companyId: person.companyId,
    name: `Asset Handover - ${person.firstName} ${person.lastName} - ${new Date().toISOString().slice(0, 10)}`,
    categoryName: "Asset Handover",
    links: [
      { entityType: "handover", entityId: handover.id },
      { entityType: "person", entityId: personId },
      ...assignments.map((a) => ({ entityType: "asset", entityId: a.assetId })),
    ],
    definition: {
      title: "Asset Handover Form",
      subtitle: `Handover reference ${handover.id}`,
      branding: { systemName: "Axivo", companyName: person.company.name },
      sections: [
        {
          heading: "Employee",
          fields: [
            { label: "Name", value: `${person.firstName} ${person.lastName}` },
            { label: "Employee ID", value: person.employeeId },
            { label: "Department", value: person.department?.name ?? "—" },
            { label: "Email", value: person.email },
          ],
        },
        {
          heading: "Assets",
          table: {
            headers: ["Asset", "Tag", "Serial Number", "Model", "Assigned"],
            rows: assignments.map((a) => [
              a.asset.name,
              a.asset.assetTag ?? "—",
              a.asset.serialNumber ?? "—",
              a.asset.model ?? "—",
              a.assignedAt.toISOString().slice(0, 10),
            ]),
          },
        },
        {
          heading: "Terms of Responsibility",
          paragraphs: [
            "I acknowledge receipt of the company assets listed above. I agree to use them for business purposes, keep them in good condition, and return them upon request or at the end of my employment. I will report loss, theft or damage to the IT department immediately.",
          ],
        },
      ],
      footerNote: "Electronic acknowledgement is recorded with a timestamp and is legally binding within company policy.",
    },
  });

  await db.handover.update({ where: { id: handover.id }, data: { documentId: document.id } });

  // Secure acknowledgement email (Doc 05 Ch8).
  const { token } = await issueToken({
    purpose: "ASSET_HANDOVER",
    email: person.email,
    personId,
    targetType: "handover",
    targetId: handover.id,
  });
  const url = tokenActionUrl("/action/handover", token);
  await queueNotification({
    companyId: person.companyId,
    eventType: "ASSET_HANDOVER",
    templateKey: "asset_handover",
    variables: {
      employeeName: `${person.firstName} ${person.lastName}`,
      assetCount: String(assignments.length),
      actionUrl: url,
    },
    subject: "Asset handover acknowledgement required",
    body: `Dear ${person.firstName},<br/><br/>Company assets have been assigned to you. Please review and acknowledge receipt using the secure link below.<br/><br/><a href="${url}">Review and acknowledge asset handover</a>`,
    recipients: [{ email: person.email, name: `${person.firstName} ${person.lastName}`, personId }],
    entityType: "handover",
    entityId: handover.id,
    dedupeKey: `handover:${handover.id}:sent`,
  });
  await db.handover.update({ where: { id: handover.id }, data: { sentAt: new Date() } });
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
  return db.$transaction(async (tx) => {
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
  // All actively assigned assets are identified automatically (Doc 11 Ch7).
  const activeAssignments = await db.assetAssignment.findMany({
    where: { personId, status: "ASSIGNED", deletedAt: null },
    include: { asset: true },
  });

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
          create: activeAssignments.map((assignment) => ({
            assetAssignmentId: assignment.id,
          })),
        },
      },
    });
    await recordAudit(
      { ...context, companyId: person.companyId },
      {
        module: MODULE,
        eventType: "clearance.started",
        action: `Started clearance for ${person.firstName} ${person.lastName} (${activeAssignments.length} asset(s))`,
        targetType: "clearance",
        targetId: clearance.id,
      },
      tx,
    );
    return clearance;
  });
}

export async function verifyClearanceItem(context: AuditContext, input: ClearanceVerifyInput) {
  const item = await db.clearanceItem.findFirst({
    where: { id: input.clearanceItemId },
    include: {
      clearance: true,
      assetAssignment: { include: { asset: true } },
    },
  });
  if (!item) throw new NotFoundError("Clearance item not found.");
  if (item.clearance.status !== "IN_PROGRESS") {
    throw new BusinessRuleError("This clearance is no longer in progress.");
  }
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
        eventType: "clearance.asset_verified",
        action: `Verified asset "${item.assetAssignment.asset.name}" as ${input.status}`,
        targetType: "clearance_item",
        targetId: item.id,
        targetLabel: item.assetAssignment.asset.name,
        details: input.comments ? { comments: input.comments } : undefined,
      },
      tx,
    );
  });
}

export async function completeClearance(context: AuditContext, clearanceId: string) {
  const clearance = await db.clearance.findFirst({
    where: { id: clearanceId },
    include: {
      person: { include: { company: true, department: true } },
      items: { include: { assetAssignment: { include: { asset: true } } } },
    },
  });
  if (!clearance) throw new NotFoundError("Clearance not found.");
  if (clearance.status !== "IN_PROGRESS") {
    throw new BusinessRuleError("This clearance is not in progress.");
  }
  const unverified = clearance.items.filter((item) => item.status === "PENDING");
  if (unverified.length > 0) {
    throw new BusinessRuleError(
      `${unverified.length} asset(s) have not been verified yet. Verify every asset before completing clearance.`,
    );
  }

  const now = new Date();
  await db.$transaction(async (tx) => {
    await tx.clearance.update({
      where: { id: clearanceId },
      data: { status: "COMPLETED", completedAt: now, completedById: context.actorUserId ?? null },
    });
    for (const item of clearance.items) {
      // Received assets are returned to the pool; missing/damaged get an
      // operational status. Historical assignments remain unchanged.
      await tx.assetAssignment.update({
        where: { id: item.assetAssignmentId },
        data: { status: "RETURNED", returnedAt: now, returnedById: context.actorUserId ?? null },
      });
      const newStatus: AssetStatus = item.status === "RECEIVED" ? "AVAILABLE" : "OUT_OF_ORDER";
      await tx.asset.update({
        where: { id: item.assetAssignment.assetId },
        data: { status: newStatus },
      });
    }
    await recordAudit(
      { ...context, companyId: clearance.companyId },
      {
        module: MODULE,
        eventType: "clearance.completed",
        action: `Completed clearance for ${clearance.person.firstName} ${clearance.person.lastName}`,
        targetType: "clearance",
        targetId: clearanceId,
      },
      tx,
    );
  });

  // Generate the permanent clearance document after commit.
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
      subtitle: `Clearance reference ${clearance.id}`,
      branding: { systemName: "Axivo", companyName: clearance.person.company.name },
      sections: [
        {
          heading: "Employee",
          fields: [
            { label: "Name", value: `${clearance.person.firstName} ${clearance.person.lastName}` },
            { label: "Employee ID", value: clearance.person.employeeId },
            { label: "Department", value: clearance.person.department?.name ?? "—" },
          ],
        },
        {
          heading: "Asset Inventory",
          table: {
            headers: ["Asset", "Tag", "Status", "Comments"],
            rows: clearance.items.map((item) => [
              item.assetAssignment.asset.name,
              item.assetAssignment.asset.assetTag ?? "—",
              item.status,
              item.comments ?? "—",
            ]),
          },
        },
        {
          heading: "Completion",
          fields: [
            { label: "Completed at", value: now.toISOString().replace("T", " ").slice(0, 16) + " UTC" },
            { label: "IT representative", value: context.actorLabel },
          ],
        },
      ],
      footerNote: "This clearance record is part of the employee's permanent history.",
    },
  });
  await db.clearance.update({ where: { id: clearanceId }, data: { documentId: document.id } });
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

export async function disposeAsset(context: AuditContext, input: DisposalInput) {
  const asset = await db.asset.findFirst({ where: { id: input.assetId, deletedAt: null } });
  if (!asset) throw new NotFoundError("Asset not found.");
  if (asset.status === "ASSIGNED") {
    throw new BusinessRuleError("Assets cannot be discarded while actively assigned.");
  }
  if (asset.status === "DISCARDED") {
    throw new BusinessRuleError("This asset has already been discarded.");
  }
  // A completed disposal document is required (Doc 11 Ch9).
  const document = await db.document.findFirst({
    where: { id: input.documentId, companyId: asset.companyId },
  });
  if (!document) {
    throw new BusinessRuleError("A disposal document belonging to the same company is required.");
  }

  return db.$transaction(async (tx) => {
    const disposal = await tx.assetDisposal.create({
      data: {
        assetId: input.assetId,
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
    await tx.asset.update({ where: { id: input.assetId }, data: { status: "DISCARDED" } });
    await tx.documentLink.create({
      data: {
        documentId: input.documentId,
        entityType: "asset",
        entityId: input.assetId,
        createdById: context.actorUserId ?? null,
      },
    });
    await recordAudit(
      { ...context, companyId: asset.companyId },
      {
        module: MODULE,
        eventType: "asset.discarded",
        action: `Discarded asset "${asset.name}" (${input.method})`,
        targetType: "asset",
        targetId: input.assetId,
        targetLabel: asset.name,
        details: { reason: input.reason, method: input.method },
      },
      tx,
    );
    return disposal;
  });
}
