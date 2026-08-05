import { db } from "@/shared/db";
import { recordAudit, diffRecords, type AuditContext } from "@/shared/audit/audit";
import { BusinessRuleError, NotFoundError, ValidationError } from "@/shared/errors";
import { provisionCompanyDefaults } from "./provisioning";
import type {
  CompanyInput,
  DepartmentInput,
  LocationInput,
  PositionInput,
  ApprovalRoleInput,
  ApprovalRoleAssignmentInput,
  DepartmentHeadInput,
} from "./validators";

/**
 * Organization module business logic (SDS Doc 06).
 * Companies, departments, locations, positions, approval roles, approval role
 * assignments and department head assignments. Records are disabled rather
 * than deleted while referenced; every change is audited with before/after.
 */

const MODULE = "organization";

// ---------------------------------------------------------------------------
// Companies (Doc 06 Ch2) - System Administrator only (enforced by actions).
// ---------------------------------------------------------------------------

export async function createCompany(context: AuditContext, input: CompanyInput) {
  return db.$transaction(async (tx) => {
    const company = await tx.company.create({
      data: { ...input, createdById: context.actorUserId ?? null },
    });
    // Standard request types and document categories are provisioned
    // automatically so forms can be built and documents filed without extra
    // setup. Shared with the first-run setup so the two never drift.
    await provisionCompanyDefaults(tx, company.id);
    await recordAudit(
      { ...context, companyId: company.id },
      {
        module: MODULE,
        eventType: "company.created",
        action: `Created company "${company.name}"`,
        targetType: "company",
        targetId: company.id,
        targetLabel: company.name,
      },
      tx,
    );
    return company;
  });
}

export async function updateCompany(context: AuditContext, id: string, input: CompanyInput) {
  const existing = await db.company.findFirst({ where: { id, deletedAt: null } });
  if (!existing) throw new NotFoundError("Company not found.");
  return db.$transaction(async (tx) => {
    const company = await tx.company.update({
      where: { id },
      data: { ...input, updatedById: context.actorUserId ?? null },
    });
    await recordAudit(
      { ...context, companyId: id },
      {
        module: MODULE,
        eventType: "company.updated",
        action: `Updated company "${company.name}"`,
        targetType: "company",
        targetId: id,
        targetLabel: company.name,
        fieldChanges: diffRecords(
          existing as unknown as Record<string, unknown>,
          company as unknown as Record<string, unknown>,
          ["name", "description", "timezone", "currency"],
        ),
      },
      tx,
    );
    return company;
  });
}

export async function setCompanyActive(context: AuditContext, id: string, isActive: boolean) {
  const existing = await db.company.findFirst({ where: { id, deletedAt: null } });
  if (!existing) throw new NotFoundError("Company not found.");
  return db.$transaction(async (tx) => {
    const company = await tx.company.update({
      where: { id },
      data: { isActive, updatedById: context.actorUserId ?? null },
    });
    await recordAudit(
      { ...context, companyId: id },
      {
        module: MODULE,
        eventType: isActive ? "company.enabled" : "company.disabled",
        action: `${isActive ? "Enabled" : "Disabled"} company "${company.name}"`,
        targetType: "company",
        targetId: id,
        targetLabel: company.name,
      },
      tx,
    );
    return company;
  });
}

// ---------------------------------------------------------------------------
// Departments (Doc 06 Ch3)
// ---------------------------------------------------------------------------

async function assertCompanyActive(companyId: string): Promise<void> {
  const company = await db.company.findFirst({ where: { id: companyId, deletedAt: null } });
  if (!company) throw new NotFoundError("Company not found.");
  if (!company.isActive) {
    throw new BusinessRuleError("Disabled companies cannot receive new records.");
  }
}

async function assertHeadsInCompany(personIds: string[], companyId: string): Promise<void> {
  if (personIds.length === 0) return;
  const count = await db.person.count({
    where: { id: { in: personIds }, companyId, deletedAt: null, isActive: true },
  });
  if (count !== personIds.length) {
    throw new BusinessRuleError("Department Heads must be active people of the same company.");
  }
}

/** Reconcile department_heads with the selected people (history preserved via soft delete). */
async function syncDepartmentHeads(
  context: AuditContext,
  tx: Parameters<Parameters<typeof db.$transaction>[0]>[0],
  departmentId: string,
  personIds: string[],
): Promise<void> {
  const existing = await tx.departmentHead.findMany({ where: { departmentId } });
  const wanted = new Set(personIds);
  for (const head of existing) {
    const shouldBeActive = wanted.has(head.personId);
    if (shouldBeActive && (!head.isActive || head.deletedAt)) {
      await tx.departmentHead.update({
        where: { id: head.id },
        data: { isActive: true, deletedAt: null, updatedById: context.actorUserId ?? null },
      });
    } else if (!shouldBeActive && head.isActive && !head.deletedAt) {
      await tx.departmentHead.update({
        where: { id: head.id },
        data: { isActive: false, deletedAt: new Date(), updatedById: context.actorUserId ?? null },
      });
    }
    wanted.delete(head.personId);
  }
  for (const personId of wanted) {
    await tx.departmentHead.create({
      data: { departmentId, personId, createdById: context.actorUserId ?? null },
    });
  }
}

export async function createDepartment(context: AuditContext, input: DepartmentInput) {
  await assertCompanyActive(input.companyId);
  await assertUniqueInCompany("department", input.companyId, input.name);
  await assertHeadsInCompany(input.headPersonIds, input.companyId);
  return db.$transaction(async (tx) => {
    const department = await tx.department.create({
      data: {
        companyId: input.companyId,
        name: input.name,
        description: input.description,
        createdById: context.actorUserId ?? null,
      },
    });
    await syncDepartmentHeads(context, tx, department.id, input.headPersonIds);
    await recordAudit(
      { ...context, companyId: input.companyId },
      {
        module: MODULE,
        eventType: "department.created",
        action: `Created department "${department.name}" (${input.headPersonIds.length} head(s))`,
        targetType: "department",
        targetId: department.id,
        targetLabel: department.name,
      },
      tx,
    );
    return department;
  });
}

export async function updateDepartment(context: AuditContext, id: string, input: DepartmentInput) {
  const existing = await db.department.findFirst({ where: { id, deletedAt: null } });
  if (!existing) throw new NotFoundError("Department not found.");
  if (existing.companyId !== input.companyId) {
    throw new BusinessRuleError("Departments cannot be moved between companies.");
  }
  await assertUniqueInCompany("department", input.companyId, input.name, id);
  await assertHeadsInCompany(input.headPersonIds, input.companyId);
  return db.$transaction(async (tx) => {
    const department = await tx.department.update({
      where: { id },
      data: {
        name: input.name,
        description: input.description,
        updatedById: context.actorUserId ?? null,
      },
    });
    await syncDepartmentHeads(context, tx, id, input.headPersonIds);
    await recordAudit(
      { ...context, companyId: input.companyId },
      {
        module: MODULE,
        eventType: "department.updated",
        action: `Updated department "${department.name}"`,
        targetType: "department",
        targetId: id,
        targetLabel: department.name,
        fieldChanges: diffRecords(
          existing as unknown as Record<string, unknown>,
          department as unknown as Record<string, unknown>,
          ["name", "description"],
        ),
      },
      tx,
    );
    return department;
  });
}

export async function setDepartmentActive(context: AuditContext, id: string, isActive: boolean) {
  const existing = await db.department.findFirst({ where: { id, deletedAt: null } });
  if (!existing) throw new NotFoundError("Department not found.");
  return db.$transaction(async (tx) => {
    const department = await tx.department.update({ where: { id }, data: { isActive } });
    await recordAudit(
      { ...context, companyId: department.companyId },
      {
        module: MODULE,
        eventType: isActive ? "department.enabled" : "department.disabled",
        action: `${isActive ? "Enabled" : "Disabled"} department "${department.name}"`,
        targetType: "department",
        targetId: id,
        targetLabel: department.name,
      },
      tx,
    );
    return department;
  });
}

// ---------------------------------------------------------------------------
// Locations (Doc 06 Ch4)
// ---------------------------------------------------------------------------

export async function createLocation(context: AuditContext, input: LocationInput) {
  await assertCompanyActive(input.companyId);
  await assertUniqueInCompany("location", input.companyId, input.name);
  return db.$transaction(async (tx) => {
    const location = await tx.location.create({
      data: { ...input, createdById: context.actorUserId ?? null },
    });
    await recordAudit(
      { ...context, companyId: input.companyId },
      {
        module: MODULE,
        eventType: "location.created",
        action: `Created location "${location.name}"`,
        targetType: "location",
        targetId: location.id,
        targetLabel: location.name,
      },
      tx,
    );
    return location;
  });
}

export async function updateLocation(context: AuditContext, id: string, input: LocationInput) {
  const existing = await db.location.findFirst({ where: { id, deletedAt: null } });
  if (!existing) throw new NotFoundError("Location not found.");
  if (existing.companyId !== input.companyId) {
    throw new BusinessRuleError("Locations cannot be moved between companies.");
  }
  await assertUniqueInCompany("location", input.companyId, input.name, id);
  return db.$transaction(async (tx) => {
    const location = await tx.location.update({
      where: { id },
      data: { ...input, updatedById: context.actorUserId ?? null },
    });
    await recordAudit(
      { ...context, companyId: input.companyId },
      {
        module: MODULE,
        eventType: "location.updated",
        action: `Updated location "${location.name}"`,
        targetType: "location",
        targetId: id,
        targetLabel: location.name,
        fieldChanges: diffRecords(
          existing as unknown as Record<string, unknown>,
          location as unknown as Record<string, unknown>,
          ["name", "code", "description"],
        ),
      },
      tx,
    );
    return location;
  });
}

export async function setLocationActive(context: AuditContext, id: string, isActive: boolean) {
  const existing = await db.location.findFirst({ where: { id, deletedAt: null } });
  if (!existing) throw new NotFoundError("Location not found.");
  return db.$transaction(async (tx) => {
    const location = await tx.location.update({ where: { id }, data: { isActive } });
    await recordAudit(
      { ...context, companyId: location.companyId },
      {
        module: MODULE,
        eventType: isActive ? "location.enabled" : "location.disabled",
        action: `${isActive ? "Enabled" : "Disabled"} location "${location.name}"`,
        targetType: "location",
        targetId: id,
        targetLabel: location.name,
      },
      tx,
    );
    return location;
  });
}

// ---------------------------------------------------------------------------
// Positions (Doc 06 Ch5)
// ---------------------------------------------------------------------------

export async function createPosition(context: AuditContext, input: PositionInput) {
  await assertCompanyActive(input.companyId);
  await assertUniqueInCompany("position", input.companyId, input.name);
  return db.$transaction(async (tx) => {
    const position = await tx.position.create({
      data: { ...input, createdById: context.actorUserId ?? null },
    });
    await recordAudit(
      { ...context, companyId: input.companyId },
      {
        module: MODULE,
        eventType: "position.created",
        action: `Created position "${position.name}"`,
        targetType: "position",
        targetId: position.id,
        targetLabel: position.name,
      },
      tx,
    );
    return position;
  });
}

export async function updatePosition(context: AuditContext, id: string, input: PositionInput) {
  const existing = await db.position.findFirst({ where: { id, deletedAt: null } });
  if (!existing) throw new NotFoundError("Position not found.");
  if (existing.companyId !== input.companyId) {
    throw new BusinessRuleError("Positions cannot be moved between companies.");
  }
  await assertUniqueInCompany("position", input.companyId, input.name, id);
  return db.$transaction(async (tx) => {
    const position = await tx.position.update({
      where: { id },
      data: { ...input, updatedById: context.actorUserId ?? null },
    });
    await recordAudit(
      { ...context, companyId: input.companyId },
      {
        module: MODULE,
        eventType: "position.updated",
        action: `Updated position "${position.name}"`,
        targetType: "position",
        targetId: id,
        targetLabel: position.name,
        fieldChanges: diffRecords(
          existing as unknown as Record<string, unknown>,
          position as unknown as Record<string, unknown>,
          ["name", "code", "description"],
        ),
      },
      tx,
    );
    return position;
  });
}

export async function setPositionActive(context: AuditContext, id: string, isActive: boolean) {
  const existing = await db.position.findFirst({ where: { id, deletedAt: null } });
  if (!existing) throw new NotFoundError("Position not found.");
  return db.$transaction(async (tx) => {
    const position = await tx.position.update({ where: { id }, data: { isActive } });
    await recordAudit(
      { ...context, companyId: position.companyId },
      {
        module: MODULE,
        eventType: isActive ? "position.enabled" : "position.disabled",
        action: `${isActive ? "Enabled" : "Disabled"} position "${position.name}"`,
        targetType: "position",
        targetId: id,
        targetLabel: position.name,
      },
      tx,
    );
    return position;
  });
}

// ---------------------------------------------------------------------------
// Approval Roles (Doc 06 Ch6) - global definitions.
// ---------------------------------------------------------------------------

export async function createApprovalRole(context: AuditContext, input: ApprovalRoleInput) {
  const duplicate = await db.approvalRole.findFirst({
    where: { name: { equals: input.name, mode: "insensitive" }, deletedAt: null },
  });
  if (duplicate) {
    throw new ValidationError("Please correct the highlighted fields.", {
      name: "An approval role with this name already exists.",
    });
  }
  const key = input.name.toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return db.$transaction(async (tx) => {
    const role = await tx.approvalRole.create({
      data: {
        name: input.name,
        key,
        description: input.description,
        createdById: context.actorUserId ?? null,
      },
    });
    await recordAudit(
      context,
      {
        module: MODULE,
        eventType: "approval_role.created",
        action: `Created approval role "${role.name}"`,
        targetType: "approval_role",
        targetId: role.id,
        targetLabel: role.name,
      },
      tx,
    );
    return role;
  });
}

export async function updateApprovalRole(context: AuditContext, id: string, input: ApprovalRoleInput) {
  const existing = await db.approvalRole.findFirst({ where: { id, deletedAt: null } });
  if (!existing) throw new NotFoundError("Approval role not found.");
  if (existing.isSystem && existing.name !== input.name) {
    throw new BusinessRuleError("Built-in approval roles cannot be renamed.");
  }
  return db.$transaction(async (tx) => {
    const role = await tx.approvalRole.update({
      where: { id },
      data: {
        name: input.name,
        description: input.description,
        updatedById: context.actorUserId ?? null,
      },
    });
    await recordAudit(
      context,
      {
        module: MODULE,
        eventType: "approval_role.updated",
        action: `Updated approval role "${role.name}"`,
        targetType: "approval_role",
        targetId: id,
        targetLabel: role.name,
        fieldChanges: diffRecords(
          existing as unknown as Record<string, unknown>,
          role as unknown as Record<string, unknown>,
          ["name", "description"],
        ),
      },
      tx,
    );
    return role;
  });
}

export async function setApprovalRoleActive(context: AuditContext, id: string, isActive: boolean) {
  const existing = await db.approvalRole.findFirst({ where: { id, deletedAt: null } });
  if (!existing) throw new NotFoundError("Approval role not found.");
  if (existing.isSystem && !isActive) {
    throw new BusinessRuleError("Built-in approval roles cannot be disabled.");
  }
  return db.$transaction(async (tx) => {
    const role = await tx.approvalRole.update({ where: { id }, data: { isActive } });
    await recordAudit(
      context,
      {
        module: MODULE,
        eventType: isActive ? "approval_role.enabled" : "approval_role.disabled",
        action: `${isActive ? "Enabled" : "Disabled"} approval role "${role.name}"`,
        targetType: "approval_role",
        targetId: id,
        targetLabel: role.name,
      },
      tx,
    );
    return role;
  });
}

// ---------------------------------------------------------------------------
// Approval Role Assignments (Doc 06 Ch11) - person-based per Doc 00 §5.
// ---------------------------------------------------------------------------

export async function assignApprovalRole(context: AuditContext, input: ApprovalRoleAssignmentInput) {
  const [role, person] = await Promise.all([
    db.approvalRole.findFirst({ where: { id: input.approvalRoleId, deletedAt: null, isActive: true } }),
    db.person.findFirst({ where: { id: input.personId, deletedAt: null } }),
  ]);
  if (!role) throw new NotFoundError("Approval role not found or inactive.");
  if (!person) throw new NotFoundError("Person not found.");
  if (!person.isActive) {
    throw new BusinessRuleError("Inactive people cannot be assigned to approval roles.");
  }
  if (person.companyId !== input.companyId) {
    throw new BusinessRuleError("Assigned people must belong to the same company.");
  }
  const existing = await db.approvalRoleAssignment.findUnique({
    where: {
      companyId_approvalRoleId_personId: {
        companyId: input.companyId,
        approvalRoleId: input.approvalRoleId,
        personId: input.personId,
      },
    },
  });
  return db.$transaction(async (tx) => {
    const assignment = existing
      ? await tx.approvalRoleAssignment.update({
          where: { id: existing.id },
          data: { isActive: true, deletedAt: null, updatedById: context.actorUserId ?? null },
        })
      : await tx.approvalRoleAssignment.create({
          data: { ...input, createdById: context.actorUserId ?? null },
        });
    await recordAudit(
      { ...context, companyId: input.companyId },
      {
        module: MODULE,
        eventType: "approval_role_assignment.created",
        action: `Assigned ${person.firstName} ${person.lastName} to approval role "${role.name}"`,
        targetType: "approval_role_assignment",
        targetId: assignment.id,
        targetLabel: role.name,
      },
      tx,
    );
    return assignment;
  });
}

/** Assign several people to one approval role in a single step. */
export async function assignApprovalRolePeople(
  context: AuditContext,
  input: { companyId: string; approvalRoleId: string; personIds: string[] },
) {
  let count = 0;
  for (const personId of input.personIds) {
    await assignApprovalRole(context, {
      companyId: input.companyId,
      approvalRoleId: input.approvalRoleId,
      personId,
    });
    count += 1;
  }
  return { count };
}

export async function removeApprovalRoleAssignment(context: AuditContext, assignmentId: string) {
  const existing = await db.approvalRoleAssignment.findFirst({
    where: { id: assignmentId, deletedAt: null },
    include: { approvalRole: true, person: true },
  });
  if (!existing) throw new NotFoundError("Assignment not found.");
  // Removal affects future requests only; historical approvals stay intact (Doc 06 Ch11).
  return db.$transaction(async (tx) => {
    await tx.approvalRoleAssignment.update({
      where: { id: assignmentId },
      data: { isActive: false, deletedAt: new Date(), updatedById: context.actorUserId ?? null },
    });
    await recordAudit(
      { ...context, companyId: existing.companyId },
      {
        module: MODULE,
        eventType: "approval_role_assignment.removed",
        action: `Removed ${existing.person.firstName} ${existing.person.lastName} from approval role "${existing.approvalRole.name}"`,
        targetType: "approval_role_assignment",
        targetId: assignmentId,
        targetLabel: existing.approvalRole.name,
      },
      tx,
    );
  });
}

// ---------------------------------------------------------------------------
// Department Heads (Doc 06 Ch7)
// ---------------------------------------------------------------------------

export async function assignDepartmentHead(context: AuditContext, input: DepartmentHeadInput) {
  const [department, person] = await Promise.all([
    db.department.findFirst({ where: { id: input.departmentId, deletedAt: null } }),
    db.person.findFirst({ where: { id: input.personId, deletedAt: null } }),
  ]);
  if (!department) throw new NotFoundError("Department not found.");
  if (!person) throw new NotFoundError("Person not found.");
  if (!person.isActive) {
    throw new BusinessRuleError("Inactive people cannot be assigned as Department Heads.");
  }
  if (person.companyId !== department.companyId) {
    throw new BusinessRuleError("Department Heads must belong to the same company as the department.");
  }
  const existing = await db.departmentHead.findUnique({
    where: { departmentId_personId: { departmentId: input.departmentId, personId: input.personId } },
  });
  return db.$transaction(async (tx) => {
    const assignment = existing
      ? await tx.departmentHead.update({
          where: { id: existing.id },
          data: { isActive: true, deletedAt: null, updatedById: context.actorUserId ?? null },
        })
      : await tx.departmentHead.create({
          data: { ...input, createdById: context.actorUserId ?? null },
        });
    await recordAudit(
      { ...context, companyId: department.companyId },
      {
        module: MODULE,
        eventType: "department_head.assigned",
        action: `Assigned ${person.firstName} ${person.lastName} as Department Head of "${department.name}"`,
        targetType: "department_head",
        targetId: assignment.id,
        targetLabel: department.name,
      },
      tx,
    );
    return assignment;
  });
}

export async function removeDepartmentHead(context: AuditContext, assignmentId: string) {
  const existing = await db.departmentHead.findFirst({
    where: { id: assignmentId, deletedAt: null },
    include: { department: true, person: true },
  });
  if (!existing) throw new NotFoundError("Department Head assignment not found.");
  return db.$transaction(async (tx) => {
    await tx.departmentHead.update({
      where: { id: assignmentId },
      data: { isActive: false, deletedAt: new Date(), updatedById: context.actorUserId ?? null },
    });
    await recordAudit(
      { ...context, companyId: existing.department.companyId },
      {
        module: MODULE,
        eventType: "department_head.removed",
        action: `Removed ${existing.person.firstName} ${existing.person.lastName} as Department Head of "${existing.department.name}"`,
        targetType: "department_head",
        targetId: assignmentId,
        targetLabel: existing.department.name,
      },
      tx,
    );
  });
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

async function assertUniqueInCompany(
  entity: "department" | "location" | "position",
  companyId: string,
  name: string,
  excludeId?: string,
): Promise<void> {
  const where = {
    companyId,
    name: { equals: name, mode: "insensitive" as const },
    deletedAt: null,
    ...(excludeId ? { id: { not: excludeId } } : {}),
  };
  const duplicate =
    entity === "department"
      ? await db.department.findFirst({ where })
      : entity === "location"
        ? await db.location.findFirst({ where })
        : await db.position.findFirst({ where });
  if (duplicate) {
    throw new ValidationError("Please correct the highlighted fields.", {
      name: `A ${entity} with this name already exists in this company.`,
    });
  }
}

