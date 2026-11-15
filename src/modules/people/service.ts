import { db, type DbClient } from "@/shared/db";
import { recordAudit, diffRecords, type AuditContext } from "@/shared/audit/audit";
import { BusinessRuleError, NotFoundError, ValidationError } from "@/shared/errors";
import { hashPassword, validatePasswordAgainstPolicy, type PasswordPolicy } from "@/shared/crypto/password";
import { getSetting, SETTING_KEYS } from "@/shared/settings/settings";
import { nextCounterValue } from "@/shared/counters";
import type { EmploymentStatus } from "@prisma/client";
import type { PersonInput, SystemUserInput, TransferCompanyInput } from "./validators";

/**
 * People module business logic (SDS Doc 07).
 * People are the central identity records; organizational placement is
 * mirrored on the person and versioned in person_org_assignments. System user
 * accounts (portal access) are optional and 1:1 with a person.
 */

const MODULE = "people";

const INACTIVE_EMPLOYMENT_STATUSES: EmploymentStatus[] = ["RESIGNED", "TERMINATED"];

async function validateOrgReferences(input: PersonInput): Promise<void> {
  const fieldErrors: Record<string, string> = {};
  const company = await db.company.findFirst({ where: { id: input.companyId, deletedAt: null } });
  if (!company) throw new NotFoundError("Company not found.");
  if (!company.isActive) throw new BusinessRuleError("Disabled companies cannot receive new records.");

  if (input.departmentId) {
    const department = await db.department.findFirst({
      where: { id: input.departmentId, companyId: input.companyId, deletedAt: null },
    });
    if (!department) fieldErrors.departmentId = "Department must belong to the selected company.";
    else if (!department.isActive) fieldErrors.departmentId = "This department is disabled.";
  }
  if (input.positionId) {
    const position = await db.position.findFirst({
      where: { id: input.positionId, companyId: input.companyId, deletedAt: null },
    });
    if (!position) fieldErrors.positionId = "Position must belong to the selected company.";
    else if (!position.isActive) fieldErrors.positionId = "This position is disabled.";
  }
  if (input.locationId) {
    const location = await db.location.findFirst({
      where: { id: input.locationId, companyId: input.companyId, deletedAt: null },
    });
    if (!location) fieldErrors.locationId = "Location must belong to the selected company.";
    else if (!location.isActive) fieldErrors.locationId = "This location is disabled.";
  }
  if (Object.keys(fieldErrors).length > 0) {
    throw new ValidationError(undefined, fieldErrors);
  }
}

/**
 * A third-party contact has no employee number to enter, so one is issued for
 * them. The reference still has to exist and be unique: it identifies the
 * person in pickers, handover documents and clearance, and the column is part
 * of the per-company unique key.
 */
async function issueThirdPartyReference(client: DbClient): Promise<string> {
  const value = await nextCounterValue("third-party-contact", client);
  return `TP-${String(value).padStart(4, "0")}`;
}

/** The person's own fields, with a cleared optional field written as null. */
function personFields(input: PersonInput, employeeId: string) {
  return {
    companyId: input.companyId,
    isThirdParty: input.isThirdParty,
    // Only meaningful for a third party; a contact converted to an employee
    // must not keep their old employer on the record.
    externalCompanyName: input.isThirdParty ? input.externalCompanyName : null,
    departmentId: input.departmentId,
    positionId: input.positionId,
    locationId: input.locationId,
    employeeId,
    firstName: input.firstName,
    lastName: input.lastName,
    email: input.email,
    personalEmail: input.personalEmail,
    phone: input.phone,
    extension: input.extension,
    employmentStatus: input.employmentStatus,
    isActive: !INACTIVE_EMPLOYMENT_STATUSES.includes(input.employmentStatus),
  };
}

/** How a person is described in audit entries and error messages. */
function personNoun(isThirdParty: boolean) {
  return isThirdParty ? "third-party contact" : "employee";
}

export async function createPerson(context: AuditContext, input: PersonInput) {
  await validateOrgReferences(input);

  if (input.employeeId) {
    const duplicateEmployeeId = await db.person.findFirst({
      where: {
        companyId: input.companyId,
        employeeId: { equals: input.employeeId, mode: "insensitive" },
        deletedAt: null,
      },
    });
    if (duplicateEmployeeId) {
      throw new ValidationError(undefined, {
        employeeId: "This Employee ID already exists in this company.",
      });
    }
  }
  const duplicateEmail = await db.person.findFirst({
    where: {
      companyId: input.companyId,
      email: { equals: input.email, mode: "insensitive" },
      deletedAt: null,
    },
  });
  if (duplicateEmail) {
    throw new ValidationError(undefined, {
      email: "This work email is already used by another person in this company.",
    });
  }

  return db.$transaction(async (tx) => {
    const employeeId = input.employeeId ?? (await issueThirdPartyReference(tx));
    const person = await tx.person.create({
      data: {
        ...personFields(input, employeeId),
        createdById: context.actorUserId ?? null,
      },
    });
    await tx.personOrgAssignment.create({
      data: {
        personId: person.id,
        companyId: person.companyId,
        departmentId: person.departmentId,
        positionId: person.positionId,
        locationId: person.locationId,
        createdById: context.actorUserId ?? null,
      },
    });
    await recordAudit(
      { ...context, companyId: input.companyId },
      {
        module: MODULE,
        eventType: "person.created",
        action:
          `Created ${personNoun(person.isThirdParty)} ${person.firstName} ${person.lastName} ` +
          `(${person.employeeId})` +
          (person.externalCompanyName ? ` of ${person.externalCompanyName}` : ""),
        targetType: "person",
        targetId: person.id,
        targetLabel: `${person.firstName} ${person.lastName}`,
      },
      tx,
    );
    return person;
  });
}

export async function updatePerson(context: AuditContext, id: string, input: PersonInput) {
  const existing = await db.person.findFirst({ where: { id, deletedAt: null } });
  if (!existing) throw new NotFoundError("Employee not found.");
  if (existing.companyId !== input.companyId) {
    throw new BusinessRuleError("Use the company transfer function to move employees between companies.");
  }
  await validateOrgReferences(input);

  // A third-party contact's form leaves the reference blank, so an edit keeps
  // the one already issued rather than trying to clear a column that cannot be
  // null and is half of the per-company unique key.
  const employeeId = input.employeeId ?? existing.employeeId;
  const duplicateEmployeeId = await db.person.findFirst({
    where: {
      companyId: input.companyId,
      employeeId: { equals: employeeId, mode: "insensitive" },
      deletedAt: null,
      id: { not: id },
    },
  });
  if (duplicateEmployeeId) {
    throw new ValidationError(undefined, {
      employeeId: "This Employee ID already exists in this company.",
    });
  }
  const duplicateEmail = await db.person.findFirst({
    where: {
      companyId: input.companyId,
      email: { equals: input.email, mode: "insensitive" },
      deletedAt: null,
      id: { not: id },
    },
  });
  if (duplicateEmail) {
    throw new ValidationError(undefined, {
      email: "This work email is already used by another person in this company.",
    });
  }

  const orgChanged =
    existing.departmentId !== (input.departmentId ?? null) ||
    existing.positionId !== (input.positionId ?? null) ||
    existing.locationId !== (input.locationId ?? null);

  return db.$transaction(async (tx) => {
    const person = await tx.person.update({
      where: { id },
      data: {
        ...personFields(input, employeeId),
        updatedById: context.actorUserId ?? null,
      },
    });
    // Organizational change creates a new history entry (Doc 07 Ch6).
    if (orgChanged) {
      await tx.personOrgAssignment.updateMany({
        where: { personId: id, endedAt: null },
        data: { endedAt: new Date() },
      });
      await tx.personOrgAssignment.create({
        data: {
          personId: id,
          companyId: person.companyId,
          departmentId: person.departmentId,
          positionId: person.positionId,
          locationId: person.locationId,
          createdById: context.actorUserId ?? null,
        },
      });
    }
    await recordAudit(
      { ...context, companyId: input.companyId },
      {
        module: MODULE,
        eventType: "person.updated",
        action: `Updated ${personNoun(person.isThirdParty)} ${person.firstName} ${person.lastName} (${person.employeeId})`,
        targetType: "person",
        targetId: id,
        targetLabel: `${person.firstName} ${person.lastName}`,
        fieldChanges: diffRecords(
          existing as unknown as Record<string, unknown>,
          person as unknown as Record<string, unknown>,
          [
            "employeeId", "firstName", "lastName", "email", "personalEmail", "phone",
            "extension", "employmentStatus", "departmentId", "positionId", "locationId",
            "isThirdParty", "externalCompanyName",
          ],
        ),
      },
      tx,
    );
    return person;
  });
}

export async function setEmploymentStatus(
  context: AuditContext,
  id: string,
  status: EmploymentStatus,
) {
  const existing = await db.person.findFirst({ where: { id, deletedAt: null } });
  if (!existing) throw new NotFoundError("Employee not found.");
  const isActive = !INACTIVE_EMPLOYMENT_STATUSES.includes(status);
  return db.$transaction(async (tx) => {
    const person = await tx.person.update({
      where: { id },
      data: { employmentStatus: status, isActive, updatedById: context.actorUserId ?? null },
    });
    // Deactivation disables portal access as well (history preserved).
    if (!isActive) {
      await tx.systemUser.updateMany({
        where: { personId: id },
        data: { isEnabled: false },
      });
      await tx.session.updateMany({
        where: { systemUser: { personId: id }, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    await recordAudit(
      { ...context, companyId: person.companyId },
      {
        module: MODULE,
        eventType: "person.status_changed",
        action: `Changed employment status of ${person.firstName} ${person.lastName} to ${status}`,
        targetType: "person",
        targetId: id,
        targetLabel: `${person.firstName} ${person.lastName}`,
        fieldChanges: [
          { field: "employmentStatus", previousValue: existing.employmentStatus, newValue: status },
        ],
      },
      tx,
    );
    return person;
  });
}

/**
 * Company transfer (Doc 06 Ch10 / Doc 07 Ch6): creates a new organizational
 * assignment while historical records remain linked to the original company
 * context.
 */
export async function transferCompany(context: AuditContext, input: TransferCompanyInput) {
  const person = await db.person.findFirst({ where: { id: input.personId, deletedAt: null } });
  if (!person) throw new NotFoundError("Employee not found.");
  if (person.companyId === input.newCompanyId) {
    throw new BusinessRuleError("The employee already belongs to this company.");
  }
  const company = await db.company.findFirst({
    where: { id: input.newCompanyId, deletedAt: null, isActive: true },
  });
  if (!company) throw new BusinessRuleError("Target company not found or disabled.");

  // Employee ID must remain unique within the target company.
  const duplicate = await db.person.findFirst({
    where: {
      companyId: input.newCompanyId,
      employeeId: { equals: person.employeeId, mode: "insensitive" },
      deletedAt: null,
    },
  });
  if (duplicate) {
    throw new BusinessRuleError(
      `Employee ID "${person.employeeId}" already exists in ${company.name}. Update the Employee ID after transfer coordination.`,
    );
  }

  // Guard: application access the target company cannot offer must be resolved
  // first. Shared applications (available to all companies) move with the person;
  // a company-specific application belonging to another company does not.
  const blockingAccess = await db.applicationAssignment.findMany({
    where: {
      personId: person.id,
      status: { in: ["ACTIVE", "PENDING", "SUSPENDED"] },
      deletedAt: null,
      application: { isShared: false, companyId: { not: input.newCompanyId }, deletedAt: null },
    },
    include: { application: { select: { name: true } } },
  });
  if (blockingAccess.length > 0) {
    const names = [...new Set(blockingAccess.map((assignment) => assignment.application.name))].join(", ");
    throw new BusinessRuleError(
      `This employee holds application access ${company.name} cannot offer: ${names}. Change or disable that access before transferring.`,
    );
  }

  const verifyInCompany = async (
    label: string,
    id: string | undefined,
    finder: () => Promise<{ id: string } | null>,
  ) => {
    if (!id) return null;
    const found = await finder();
    if (!found) throw new BusinessRuleError(`${label} must belong to the target company.`);
    return id;
  };
  const departmentId = await verifyInCompany("Department", input.newDepartmentId, () =>
    db.department.findFirst({
      where: { id: input.newDepartmentId, companyId: input.newCompanyId, deletedAt: null, isActive: true },
    }),
  );
  const positionId = await verifyInCompany("Position", input.newPositionId, () =>
    db.position.findFirst({
      where: { id: input.newPositionId, companyId: input.newCompanyId, deletedAt: null, isActive: true },
    }),
  );
  const locationId = await verifyInCompany("Location", input.newLocationId, () =>
    db.location.findFirst({
      where: { id: input.newLocationId, companyId: input.newCompanyId, deletedAt: null, isActive: true },
    }),
  );

  return db.$transaction(async (tx) => {
    await tx.personOrgAssignment.updateMany({
      where: { personId: person.id, endedAt: null },
      data: { endedAt: new Date() },
    });
    const updated = await tx.person.update({
      where: { id: person.id },
      data: {
        companyId: input.newCompanyId,
        departmentId,
        positionId,
        locationId,
        updatedById: context.actorUserId ?? null,
      },
    });
    await tx.personOrgAssignment.create({
      data: {
        personId: person.id,
        companyId: input.newCompanyId,
        departmentId,
        positionId,
        locationId,
        createdById: context.actorUserId ?? null,
      },
    });
    await recordAudit(
      { ...context, companyId: input.newCompanyId },
      {
        module: MODULE,
        eventType: "person.company_transferred",
        action: `Transferred ${person.firstName} ${person.lastName} to ${company.name}`,
        targetType: "person",
        targetId: person.id,
        targetLabel: `${person.firstName} ${person.lastName}`,
        fieldChanges: [
          { field: "companyId", previousValue: person.companyId, newValue: input.newCompanyId },
        ],
      },
      tx,
    );
    return updated;
  });
}

// ---------------------------------------------------------------------------
// System user accounts (Doc 07 Ch3)
// ---------------------------------------------------------------------------

export async function createSystemUser(context: AuditContext, input: SystemUserInput) {
  const person = await db.person.findFirst({
    where: { id: input.personId, deletedAt: null },
    include: { systemUser: true },
  });
  if (!person) throw new NotFoundError("Employee not found.");
  if (!person.isActive) throw new BusinessRuleError("Inactive employees cannot receive portal accounts.");
  if (person.systemUser) throw new BusinessRuleError("This employee already has a portal account.");

  const role = await db.systemRole.findFirst({ where: { id: input.systemRoleId, isActive: true } });
  if (!role) throw new NotFoundError("System role not found.");

  const duplicateUsername = await db.systemUser.findFirst({
    where: { username: { equals: input.username, mode: "insensitive" } },
  });
  if (duplicateUsername) {
    throw new ValidationError(undefined, { username: "This username is already taken." });
  }

  const policy = await getSetting<PasswordPolicy>(SETTING_KEYS.PASSWORD_POLICY);
  const passwordProblems = validatePasswordAgainstPolicy(input.password, policy);
  if (passwordProblems.length > 0) {
    throw new ValidationError(undefined, { password: passwordProblems.join(" ") });
  }
  const passwordHash = await hashPassword(input.password);

  return db.$transaction(async (tx) => {
    const user = await tx.systemUser.create({
      data: {
        personId: input.personId,
        username: input.username,
        systemRoleId: input.systemRoleId,
        passwordHash,
        passwordChangedAt: new Date(),
        createdById: context.actorUserId ?? null,
      },
    });
    await recordAudit(
      { ...context, companyId: person.companyId },
      {
        module: MODULE,
        eventType: "system_user.created",
        action: `Created portal account "${input.username}" for ${person.firstName} ${person.lastName} with role ${role.name}`,
        targetType: "system_user",
        targetId: user.id,
        targetLabel: input.username,
      },
      tx,
    );
    return user;
  });
}

export async function resetSystemUserPassword(
  context: AuditContext,
  systemUserId: string,
  newPassword: string,
) {
  const user = await db.systemUser.findFirst({
    where: { id: systemUserId, deletedAt: null },
    include: { person: true },
  });
  if (!user) throw new NotFoundError("Account not found.");

  const policy = await getSetting<PasswordPolicy>(SETTING_KEYS.PASSWORD_POLICY);
  const problems = validatePasswordAgainstPolicy(newPassword, policy);
  if (problems.length > 0) {
    throw new ValidationError(undefined, { newPassword: problems.join(" ") });
  }
  const passwordHash = await hashPassword(newPassword);

  return db.$transaction(async (tx) => {
    await tx.systemUser.update({
      where: { id: systemUserId },
      data: { passwordHash, passwordChangedAt: new Date(), updatedById: context.actorUserId ?? null },
    });
    // Revoke existing sessions after an administrative password reset.
    await tx.session.updateMany({
      where: { systemUserId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await recordAudit(
      { ...context, companyId: user.person.companyId },
      {
        module: MODULE,
        eventType: "system_user.password_reset",
        action: `Reset password for "${user.username}"`,
        targetType: "system_user",
        targetId: systemUserId,
        targetLabel: user.username,
      },
      tx,
    );
  });
}

export async function changeSystemUserRole(
  context: AuditContext,
  systemUserId: string,
  systemRoleId: string,
) {
  const user = await db.systemUser.findFirst({
    where: { id: systemUserId, deletedAt: null },
    include: { person: true, systemRole: true },
  });
  if (!user) throw new NotFoundError("Account not found.");
  const role = await db.systemRole.findFirst({ where: { id: systemRoleId, isActive: true } });
  if (!role) throw new NotFoundError("System role not found.");

  return db.$transaction(async (tx) => {
    await tx.systemUser.update({
      where: { id: systemUserId },
      data: { systemRoleId, updatedById: context.actorUserId ?? null },
    });
    await recordAudit(
      { ...context, companyId: user.person.companyId },
      {
        module: MODULE,
        eventType: "system_user.role_changed",
        action: `Changed role of "${user.username}" from ${user.systemRole.name} to ${role.name}`,
        targetType: "system_user",
        targetId: systemUserId,
        targetLabel: user.username,
        fieldChanges: [
          { field: "systemRoleId", previousValue: user.systemRole.name, newValue: role.name },
        ],
      },
      tx,
    );
  });
}

export async function setSystemUserEnabled(
  context: AuditContext,
  systemUserId: string,
  isEnabled: boolean,
) {
  const user = await db.systemUser.findFirst({
    where: { id: systemUserId, deletedAt: null },
    include: { person: true },
  });
  if (!user) throw new NotFoundError("Account not found.");
  if (context.actorUserId === systemUserId && !isEnabled) {
    throw new BusinessRuleError("You cannot disable your own account.");
  }

  return db.$transaction(async (tx) => {
    await tx.systemUser.update({
      where: { id: systemUserId },
      data: { isEnabled, updatedById: context.actorUserId ?? null },
    });
    if (!isEnabled) {
      await tx.session.updateMany({
        where: { systemUserId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    await recordAudit(
      { ...context, companyId: user.person.companyId },
      {
        module: MODULE,
        eventType: isEnabled ? "system_user.enabled" : "system_user.disabled",
        action: `${isEnabled ? "Enabled" : "Disabled"} portal account "${user.username}"`,
        targetType: "system_user",
        targetId: systemUserId,
        targetLabel: user.username,
      },
      tx,
    );
  });
}

/**
 * Match a public request participant to a People record by work email
 * (Doc 00 §6: matching attempted where possible; requests proceed unmatched).
 */
export async function matchPersonByEmail(
  companyId: string,
  email: string,
  client: DbClient = db,
) {
  return client.person.findFirst({
    where: {
      companyId,
      email: { equals: email.trim().toLowerCase(), mode: "insensitive" },
      deletedAt: null,
    },
    include: { department: true },
  });
}

/**
 * Soft-delete an employee record. Refused while they still hold assets,
 * application access or licenses (run clearance first); the archived row keeps
 * history and frees the employee ID for reuse.
 */
export async function deletePerson(context: AuditContext, id: string) {
  const person = await db.person.findFirst({ where: { id, deletedAt: null } });
  if (!person) throw new NotFoundError("Person not found.");
  const [assets, apps, licenses] = await Promise.all([
    db.assetAssignment.count({ where: { personId: id, status: "ASSIGNED", deletedAt: null } }),
    db.applicationAssignment.count({ where: { personId: id, status: { not: "REMOVED" }, deletedAt: null } }),
    db.licenseAssignment.count({
      where: { personId: id, status: { in: ["ACTIVE", "PENDING", "SUSPENDED"] }, deletedAt: null },
    }),
  ]);
  if (assets > 0 || apps > 0 || licenses > 0) {
    throw new BusinessRuleError(
      `${person.firstName} ${person.lastName} still holds ${assets} asset(s), ${apps} application(s) and ${licenses} license(s). Run clearance or remove these before deleting the record.`,
    );
  }
  return db.$transaction(async (tx) => {
    await tx.person.update({
      where: { id },
      data: {
        isActive: false,
        deletedAt: new Date(),
        deletedById: context.actorUserId ?? null,
        employeeId: `${person.employeeId} (deleted ${id.slice(0, 8)})`,
      },
    });
    await recordAudit(
      { ...context, companyId: person.companyId },
      {
        module: MODULE,
        eventType: "person.deleted",
        action: `Deleted employee "${person.firstName} ${person.lastName}"`,
        targetType: "person",
        targetId: id,
        targetLabel: `${person.firstName} ${person.lastName}`,
      },
      tx,
    );
  });
}
