import { db, type DbClient } from "@/shared/db";
import { recordAudit, diffRecords, type AuditContext } from "@/shared/audit/audit";
import { BusinessRuleError, NotFoundError, ValidationError } from "@/shared/errors";
import type {
  ApplicationInput,
  ApplicationRoleInput,
  CredentialFieldInput,
  AssignmentInput,
  UpdateAssignmentInput,
} from "./validators";

/**
 * Applications module business logic (SDS Doc 08).
 * Application catalogue, role templates, custom credential fields and
 * assignment lifecycle. Passwords are never stored here - credential delivery
 * handles temporary secrets separately.
 */

const MODULE = "applications";

export async function createApplication(context: AuditContext, input: ApplicationInput) {
  const company = await db.company.findFirst({
    where: { id: input.companyId, deletedAt: null, isActive: true },
  });
  if (!company) throw new BusinessRuleError("Company not found or disabled.");
  const duplicate = await db.application.findFirst({
    where: {
      companyId: input.companyId,
      name: { equals: input.name, mode: "insensitive" },
      deletedAt: null,
    },
  });
  if (duplicate) {
    throw new ValidationError(undefined, {
      name: "An application with this name already exists in this company.",
    });
  }
  return db.$transaction(async (tx) => {
    const application = await tx.application.create({
      data: { ...input, workflowId: input.workflowId ?? null, createdById: context.actorUserId ?? null },
    });
    await recordAudit(
      { ...context, companyId: input.companyId },
      {
        module: MODULE,
        eventType: "application.created",
        action: `Created application "${application.name}"`,
        targetType: "application",
        targetId: application.id,
        targetLabel: application.name,
      },
      tx,
    );
    return application;
  });
}

export async function updateApplication(context: AuditContext, id: string, input: ApplicationInput) {
  const existing = await db.application.findFirst({ where: { id, deletedAt: null } });
  if (!existing) throw new NotFoundError("Application not found.");
  if (existing.companyId !== input.companyId) {
    throw new BusinessRuleError("Applications cannot be moved between companies.");
  }
  const duplicate = await db.application.findFirst({
    where: {
      companyId: input.companyId,
      name: { equals: input.name, mode: "insensitive" },
      deletedAt: null,
      id: { not: id },
    },
  });
  if (duplicate) {
    throw new ValidationError(undefined, {
      name: "An application with this name already exists in this company.",
    });
  }
  return db.$transaction(async (tx) => {
    const application = await tx.application.update({
      where: { id },
      data: { ...input, updatedById: context.actorUserId ?? null },
    });
    await recordAudit(
      { ...context, companyId: input.companyId },
      {
        module: MODULE,
        eventType: "application.updated",
        action: `Updated application "${application.name}"`,
        targetType: "application",
        targetId: id,
        targetLabel: application.name,
        fieldChanges: diffRecords(
          existing as unknown as Record<string, unknown>,
          application as unknown as Record<string, unknown>,
          ["name", "description", "allowMultipleAssignments", "requiresLicense", "isShared"],
        ),
      },
      tx,
    );
    return application;
  });
}

export async function setApplicationActive(context: AuditContext, id: string, isActive: boolean) {
  const existing = await db.application.findFirst({ where: { id, deletedAt: null } });
  if (!existing) throw new NotFoundError("Application not found.");
  return db.$transaction(async (tx) => {
    const application = await tx.application.update({ where: { id }, data: { isActive } });
    await recordAudit(
      { ...context, companyId: application.companyId },
      {
        module: MODULE,
        eventType: isActive ? "application.enabled" : "application.disabled",
        action: `${isActive ? "Enabled" : "Disabled"} application "${application.name}"`,
        targetType: "application",
        targetId: id,
        targetLabel: application.name,
      },
      tx,
    );
    return application;
  });
}

// ---------------------------------------------------------------------------
// Application roles (Doc 08 Ch3)
// ---------------------------------------------------------------------------

export async function createApplicationRole(context: AuditContext, input: ApplicationRoleInput) {
  const application = await db.application.findFirst({
    where: { id: input.applicationId, deletedAt: null },
  });
  if (!application) throw new NotFoundError("Application not found.");
  const duplicate = await db.applicationRole.findFirst({
    where: {
      applicationId: input.applicationId,
      name: { equals: input.name, mode: "insensitive" },
      deletedAt: null,
    },
  });
  if (duplicate) {
    throw new ValidationError(undefined, {
      name: "A role with this name already exists for this application.",
    });
  }
  return db.$transaction(async (tx) => {
    const role = await tx.applicationRole.create({
      data: { ...input, createdById: context.actorUserId ?? null },
    });
    await recordAudit(
      { ...context, companyId: application.companyId },
      {
        module: MODULE,
        eventType: "application_role.created",
        action: `Created role "${role.name}" for application "${application.name}"`,
        targetType: "application_role",
        targetId: role.id,
        targetLabel: role.name,
      },
      tx,
    );
    return role;
  });
}

export async function updateApplicationRole(context: AuditContext, id: string, input: ApplicationRoleInput) {
  const existing = await db.applicationRole.findFirst({
    where: { id, deletedAt: null },
    include: { application: true },
  });
  if (!existing) throw new NotFoundError("Application role not found.");
  if (existing.applicationId !== input.applicationId) {
    throw new BusinessRuleError("Roles cannot be moved between applications.");
  }
  const duplicate = await db.applicationRole.findFirst({
    where: {
      applicationId: input.applicationId,
      name: { equals: input.name, mode: "insensitive" },
      deletedAt: null,
      id: { not: id },
    },
  });
  if (duplicate) {
    throw new ValidationError(undefined, {
      name: "A role with this name already exists for this application.",
    });
  }
  return db.$transaction(async (tx) => {
    const role = await tx.applicationRole.update({
      where: { id },
      data: { name: input.name, description: input.description, updatedById: context.actorUserId ?? null },
    });
    await recordAudit(
      { ...context, companyId: existing.application.companyId },
      {
        module: MODULE,
        eventType: "application_role.updated",
        action: `Updated role "${role.name}"`,
        targetType: "application_role",
        targetId: id,
        targetLabel: role.name,
      },
      tx,
    );
    return role;
  });
}

export async function setApplicationRoleActive(context: AuditContext, id: string, isActive: boolean) {
  const existing = await db.applicationRole.findFirst({
    where: { id, deletedAt: null },
    include: { application: true },
  });
  if (!existing) throw new NotFoundError("Application role not found.");
  return db.$transaction(async (tx) => {
    const role = await tx.applicationRole.update({ where: { id }, data: { isActive } });
    await recordAudit(
      { ...context, companyId: existing.application.companyId },
      {
        module: MODULE,
        eventType: isActive ? "application_role.enabled" : "application_role.disabled",
        action: `${isActive ? "Enabled" : "Disabled"} role "${role.name}"`,
        targetType: "application_role",
        targetId: id,
        targetLabel: role.name,
      },
      tx,
    );
    return role;
  });
}

// ---------------------------------------------------------------------------
// Custom credential fields (Doc 08 Ch4)
// ---------------------------------------------------------------------------

export async function saveCredentialField(
  context: AuditContext,
  input: CredentialFieldInput,
  fieldId?: string,
) {
  const application = await db.application.findFirst({
    where: { id: input.applicationId, deletedAt: null },
  });
  if (!application) throw new NotFoundError("Application not found.");
  const duplicate = await db.applicationCredentialField.findFirst({
    where: {
      applicationId: input.applicationId,
      fieldName: { equals: input.fieldName, mode: "insensitive" },
      deletedAt: null,
      ...(fieldId ? { id: { not: fieldId } } : {}),
    },
  });
  if (duplicate) {
    throw new ValidationError(undefined, {
      fieldName: "A credential field with this name already exists for this application.",
    });
  }
  return db.$transaction(async (tx) => {
    const field = fieldId
      ? await tx.applicationCredentialField.update({ where: { id: fieldId }, data: input })
      : await tx.applicationCredentialField.create({ data: input });
    await recordAudit(
      { ...context, companyId: application.companyId },
      {
        module: MODULE,
        eventType: fieldId ? "credential_field.updated" : "credential_field.created",
        action: `${fieldId ? "Updated" : "Created"} credential field "${field.fieldName}" for "${application.name}"`,
        targetType: "application_credential_field",
        targetId: field.id,
        targetLabel: field.fieldName,
      },
      tx,
    );
    return field;
  });
}

export async function setCredentialFieldActive(context: AuditContext, id: string, isActive: boolean) {
  const existing = await db.applicationCredentialField.findFirst({
    where: { id, deletedAt: null },
    include: { application: true },
  });
  if (!existing) throw new NotFoundError("Credential field not found.");
  return db.$transaction(async (tx) => {
    const field = await tx.applicationCredentialField.update({ where: { id }, data: { isActive } });
    await recordAudit(
      { ...context, companyId: existing.application.companyId },
      {
        module: MODULE,
        eventType: isActive ? "credential_field.enabled" : "credential_field.disabled",
        action: `${isActive ? "Enabled" : "Disabled"} credential field "${field.fieldName}"`,
        targetType: "application_credential_field",
        targetId: id,
        targetLabel: field.fieldName,
      },
      tx,
    );
    return field;
  });
}

// ---------------------------------------------------------------------------
// Assignments (Doc 08 Ch5/11)
// ---------------------------------------------------------------------------

export async function createAssignment(
  context: AuditContext,
  input: AssignmentInput,
  options: { requestItemId?: string; status?: "PENDING" | "ACTIVE"; implementedById?: string } = {},
  client: DbClient = db,
) {
  const [person, application] = await Promise.all([
    client.person.findFirst({ where: { id: input.personId, deletedAt: null } }),
    client.application.findFirst({ where: { id: input.applicationId, deletedAt: null } }),
  ]);
  if (!person) throw new NotFoundError("Employee not found.");
  if (!person.isActive) throw new BusinessRuleError("Only active employees may receive new assignments.");
  if (!application) throw new NotFoundError("Application not found.");
  if (!application.isActive) throw new BusinessRuleError("Disabled applications cannot be assigned.");
  // Shared applications (e.g. a group-wide system) may be assigned to anyone;
  // company-scoped applications must match the employee's company.
  if (!application.isShared && person.companyId !== application.companyId) {
    throw new BusinessRuleError("The employee and application must belong to the same company.");
  }
  if (input.applicationRoleId) {
    const role = await client.applicationRole.findFirst({
      where: { id: input.applicationRoleId, applicationId: input.applicationId, deletedAt: null, isActive: true },
    });
    if (!role) throw new BusinessRuleError("The selected application role is not available.");
  }
  if (!application.allowMultipleAssignments) {
    const existing = await client.applicationAssignment.findFirst({
      where: {
        personId: input.personId,
        applicationId: input.applicationId,
        status: { in: ["PENDING", "ACTIVE", "SUSPENDED"] },
        deletedAt: null,
      },
    });
    if (existing) {
      throw new BusinessRuleError(
        `${person.firstName} ${person.lastName} already has an assignment for "${application.name}".`,
      );
    }
  }

  const assignment = await client.applicationAssignment.create({
    data: {
      personId: input.personId,
      applicationId: input.applicationId,
      applicationRoleId: input.applicationRoleId ?? null,
      username: input.username ?? null,
      notes: input.notes ?? null,
      status: options.status ?? "ACTIVE",
      requestItemId: options.requestItemId ?? null,
      implementedById: options.implementedById ?? null,
      createdById: context.actorUserId ?? null,
    },
  });
  await recordAudit(
    { ...context, companyId: application.companyId },
    {
      module: MODULE,
      eventType: "assignment.created",
      action: `Assigned "${application.name}" to ${person.firstName} ${person.lastName}`,
      targetType: "application_assignment",
      targetId: assignment.id,
      targetLabel: application.name,
    },
    client,
  );
  return assignment;
}

export async function updateAssignment(context: AuditContext, id: string, input: UpdateAssignmentInput) {
  const existing = await db.applicationAssignment.findFirst({
    where: { id, deletedAt: null },
    include: { application: true, person: true },
  });
  if (!existing) throw new NotFoundError("Assignment not found.");
  if (input.applicationRoleId) {
    const role = await db.applicationRole.findFirst({
      where: { id: input.applicationRoleId, applicationId: existing.applicationId, deletedAt: null },
    });
    if (!role) throw new BusinessRuleError("The selected role does not belong to this application.");
  }
  return db.$transaction(async (tx) => {
    const assignment = await tx.applicationAssignment.update({
      where: { id },
      data: {
        username: input.username ?? null,
        applicationRoleId: input.applicationRoleId ?? null,
        notes: input.notes ?? null,
        updatedById: context.actorUserId ?? null,
      },
    });
    const changes = diffRecords(
      existing as unknown as Record<string, unknown>,
      assignment as unknown as Record<string, unknown>,
      ["username", "applicationRoleId", "notes"],
    );
    await recordAudit(
      { ...context, companyId: existing.application.companyId },
      {
        module: MODULE,
        eventType: changes.some((c) => c.field === "username")
          ? "assignment.username_changed"
          : "assignment.updated",
        action: `Updated assignment of "${existing.application.name}" for ${existing.person.firstName} ${existing.person.lastName}`,
        targetType: "application_assignment",
        targetId: id,
        targetLabel: existing.application.name,
        fieldChanges: changes,
      },
      tx,
    );
    return assignment;
  });
}

export async function setAssignmentStatus(
  context: AuditContext,
  id: string,
  status: "ACTIVE" | "SUSPENDED",
) {
  const existing = await db.applicationAssignment.findFirst({
    where: { id, deletedAt: null },
    include: { application: true, person: true },
  });
  if (!existing) throw new NotFoundError("Assignment not found.");
  if (existing.status === "REMOVED") {
    throw new BusinessRuleError("Removed assignments cannot be changed. Historical records are preserved.");
  }
  return db.$transaction(async (tx) => {
    const assignment = await tx.applicationAssignment.update({
      where: { id },
      data: { status, updatedById: context.actorUserId ?? null },
    });
    await recordAudit(
      { ...context, companyId: existing.application.companyId },
      {
        module: MODULE,
        eventType: status === "SUSPENDED" ? "assignment.suspended" : "assignment.activated",
        action: `${status === "SUSPENDED" ? "Suspended" : "Activated"} "${existing.application.name}" assignment for ${existing.person.firstName} ${existing.person.lastName}`,
        targetType: "application_assignment",
        targetId: id,
        targetLabel: existing.application.name,
      },
      tx,
    );
    return assignment;
  });
}

export async function removeAssignment(context: AuditContext, id: string, reason: string) {
  const existing = await db.applicationAssignment.findFirst({
    where: { id, deletedAt: null },
    include: { application: true, person: true },
  });
  if (!existing) throw new NotFoundError("Assignment not found.");
  if (existing.status === "REMOVED") return existing;
  return db.$transaction(async (tx) => {
    const assignment = await tx.applicationAssignment.update({
      where: { id },
      data: {
        status: "REMOVED",
        removedAt: new Date(),
        removalReason: reason,
        updatedById: context.actorUserId ?? null,
      },
    });
    await recordAudit(
      { ...context, companyId: existing.application.companyId },
      {
        module: MODULE,
        eventType: "assignment.removed",
        action: `Removed "${existing.application.name}" access from ${existing.person.firstName} ${existing.person.lastName}`,
        targetType: "application_assignment",
        targetId: id,
        targetLabel: existing.application.name,
        details: { reason },
      },
      tx,
    );
    return assignment;
  });
}
