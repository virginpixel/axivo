import { db, type DbClient } from "@/shared/db";
import { recordAudit, diffRecords, type AuditContext } from "@/shared/audit/audit";
import { BusinessRuleError, NotFoundError, ValidationError } from "@/shared/errors";
import type { LicenseStatus } from "@prisma/client";
import type { LicenseInput, LicensePurchaseInput, LicenseAssignmentInput } from "./validators";

/**
 * Licenses module business logic (SDS Doc 10).
 * Availability = purchased quantity − active assignments; over-allocation is
 * prevented atomically. Subscription licenses require start/expiry dates;
 * perpetual licenses never expire. History is immutable.
 */

const MODULE = "licenses";

export interface LicenseAvailability {
  purchased: number;
  assigned: number;
  available: number;
}

export async function getLicenseAvailability(
  licenseId: string,
  client: DbClient = db,
): Promise<LicenseAvailability> {
  const [purchases, assigned] = await Promise.all([
    client.licensePurchase.aggregate({
      where: { licenseId, deletedAt: null },
      _sum: { quantity: true },
    }),
    client.licenseAssignment.count({
      where: { licenseId, status: { in: ["PENDING", "ACTIVE", "SUSPENDED"] }, deletedAt: null },
    }),
  ]);
  const purchased = purchases._sum.quantity ?? 0;
  return { purchased, assigned, available: purchased - assigned };
}

/** How a licence's cover reads once every purchase is taken into account. */
export type LicenseCoverageState = "none" | "valid" | "expiring" | "expired";

export interface LicenseCoverage {
  /** Furthest-out expiry across all purchases: when cover actually ends. */
  expiresAt: Date | null;
  state: LicenseCoverageState;
}

/** Days before expiry at which a licence starts being called out as expiring. */
export const LICENSE_EXPIRY_WARNING_DAYS = 60;

/**
 * Resolve licence cover from its purchases (SDS Doc 10 Ch4). A licence renewed
 * every year carries several purchases, and it is the latest one that says
 * whether cover has actually lapsed - the earlier ones are meant to be expired.
 * Perpetual licences carry no expiry at all, which is "none", not "expired".
 */
export function getLicenseCoverage(
  purchases: { expiryDate: Date | null }[],
  now: Date = new Date(),
): LicenseCoverage {
  const dates = purchases
    .map((purchase) => purchase.expiryDate)
    .filter((date): date is Date => date !== null);
  if (dates.length === 0) return { expiresAt: null, state: "none" };

  const expiresAt = dates.reduce((latest, date) => (date > latest ? date : latest));
  if (expiresAt < now) return { expiresAt, state: "expired" };
  const warnFrom = new Date(now.getTime() + LICENSE_EXPIRY_WARNING_DAYS * 86_400_000);
  return { expiresAt, state: expiresAt <= warnFrom ? "expiring" : "valid" };
}

export async function createLicense(context: AuditContext, input: LicenseInput) {
  if (input.applicationId) {
    const application = await db.application.findFirst({
      where: { id: input.applicationId, companyId: input.companyId, deletedAt: null },
    });
    if (!application) {
      throw new BusinessRuleError("The linked application must belong to the same company.");
    }
  }
  const duplicate = await db.license.findFirst({
    where: {
      companyId: input.companyId,
      name: { equals: input.name, mode: "insensitive" },
      deletedAt: null,
    },
  });
  if (duplicate) {
    throw new ValidationError(undefined, {
      name: "A license with this name already exists in this company.",
    });
  }
  if (input.contractId) {
    const contract = await db.contract.findFirst({
      where: { id: input.contractId, companyId: input.companyId, deletedAt: null },
    });
    if (!contract) throw new BusinessRuleError("The linked contract must belong to the same company.");
  }
  return db.$transaction(async (tx) => {
    const license = await tx.license.create({
      data: { ...input, applicationId: input.applicationId ?? null, createdById: context.actorUserId ?? null },
    });
    await recordAudit(
      { ...context, companyId: input.companyId },
      {
        module: MODULE,
        eventType: "license.created",
        action: `Created license "${license.name}"`,
        targetType: "license",
        targetId: license.id,
        targetLabel: license.name,
      },
      tx,
    );
    return license;
  });
}

export async function updateLicense(context: AuditContext, id: string, input: LicenseInput) {
  const existing = await db.license.findFirst({ where: { id, deletedAt: null } });
  if (!existing) throw new NotFoundError("License not found.");
  if (existing.companyId !== input.companyId) {
    throw new BusinessRuleError("Licenses cannot be moved between companies.");
  }
  const duplicate = await db.license.findFirst({
    where: {
      companyId: input.companyId,
      name: { equals: input.name, mode: "insensitive" },
      deletedAt: null,
      id: { not: id },
    },
  });
  if (duplicate) {
    throw new ValidationError(undefined, {
      name: "A license with this name already exists in this company.",
    });
  }
  if (input.contractId) {
    const contract = await db.contract.findFirst({
      where: { id: input.contractId, companyId: input.companyId, deletedAt: null },
    });
    if (!contract) throw new BusinessRuleError("The linked contract must belong to the same company.");
  }
  if (input.applicationId) {
    const application = await db.application.findFirst({
      where: { id: input.applicationId, companyId: input.companyId, deletedAt: null },
    });
    if (!application) {
      throw new BusinessRuleError("The linked application must belong to the same company.");
    }
  }
  return db.$transaction(async (tx) => {
    const license = await tx.license.update({
      where: { id },
      data: { ...input, applicationId: input.applicationId ?? null, updatedById: context.actorUserId ?? null },
    });
    const contractChanged = existing.contractId !== (input.contractId ?? null);
    await recordAudit(
      { ...context, companyId: input.companyId },
      {
        module: MODULE,
        eventType: contractChanged
          ? input.contractId
            ? "license.contract_linked"
            : "license.contract_unlinked"
          : "license.updated",
        action: `Updated license "${license.name}"`,
        targetType: "license",
        targetId: id,
        targetLabel: license.name,
        fieldChanges: diffRecords(
          existing as unknown as Record<string, unknown>,
          license as unknown as Record<string, unknown>,
          ["name", "licenseType", "vendor", "contractId", "notes"],
        ),
      },
      tx,
    );
    return license;
  });
}

export async function deleteLicense(context: AuditContext, id: string) {
  const license = await db.license.findFirst({
    where: { id, deletedAt: null },
    include: {
      _count: {
        select: { assignments: { where: { status: { in: ["ACTIVE", "PENDING", "SUSPENDED"] }, deletedAt: null } } },
      },
    },
  });
  if (!license) throw new NotFoundError("License not found.");
  if (license._count.assignments > 0) {
    throw new BusinessRuleError(
      `"${license.name}" still has ${license._count.assignments} active assignment(s). Remove them before deleting it.`,
    );
  }
  return db.$transaction(async (tx) => {
    await tx.license.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false, deletedById: context.actorUserId ?? null },
    });
    await recordAudit(
      { ...context, companyId: license.companyId },
      {
        module: MODULE,
        eventType: "license.deleted",
        action: `Deleted license "${license.name}"`,
        targetType: "license",
        targetId: id,
        targetLabel: license.name,
      },
      tx,
    );
  });
}

export async function setLicenseStatus(context: AuditContext, id: string, status: LicenseStatus) {
  const existing = await db.license.findFirst({ where: { id, deletedAt: null } });
  if (!existing) throw new NotFoundError("License not found.");
  if (existing.status === "RETIRED" && status !== "RETIRED") {
    // Reactivation of retired licenses requires administrative approval; the
    // permission gate on the action provides it (Doc 10 Ch11).
  }
  return db.$transaction(async (tx) => {
    const license = await tx.license.update({
      where: { id },
      data: { status, isActive: status === "ACTIVE", updatedById: context.actorUserId ?? null },
    });
    await recordAudit(
      { ...context, companyId: license.companyId },
      {
        module: MODULE,
        eventType: `license.${status.toLowerCase()}`,
        action: `Changed license "${license.name}" status to ${status}`,
        targetType: "license",
        targetId: id,
        targetLabel: license.name,
        fieldChanges: [{ field: "status", previousValue: existing.status, newValue: status }],
      },
      tx,
    );
    return license;
  });
}

// ---------------------------------------------------------------------------
// Purchases & renewals (Doc 10 Ch3/5)
// ---------------------------------------------------------------------------

export async function recordPurchase(context: AuditContext, input: LicensePurchaseInput) {
  const license = await db.license.findFirst({ where: { id: input.licenseId, deletedAt: null } });
  if (!license) throw new NotFoundError("License not found.");
  if (license.status === "RETIRED") {
    throw new BusinessRuleError("Retired licenses cannot receive new purchases.");
  }
  // Subscription licenses require start and expiry dates (Doc 10 Ch3).
  if (license.licenseType === "SUBSCRIPTION") {
    const fieldErrors: Record<string, string> = {};
    if (!input.startDate) fieldErrors.startDate = "Start date is required for subscription licenses.";
    if (!input.expiryDate) fieldErrors.expiryDate = "Expiry date is required for subscription licenses.";
    if (Object.keys(fieldErrors).length > 0) throw new ValidationError(undefined, fieldErrors);
  }
  return db.$transaction(async (tx) => {
    const purchase = await tx.licensePurchase.create({
      data: {
        licenseId: input.licenseId,
        purchaseType: input.purchaseType,
        quantity: input.quantity,
        purchaseDate: input.purchaseDate,
        startDate: input.startDate ?? null,
        expiryDate: input.expiryDate ?? null,
        price: input.price ?? null,
        currency: input.currency ?? null,
        supplier: input.supplier ?? null,
        purchaseReference: input.purchaseReference ?? null,
        notes: input.notes ?? null,
        createdById: context.actorUserId ?? null,
      },
    });
    await recordAudit(
      { ...context, companyId: license.companyId },
      {
        module: MODULE,
        eventType: input.purchaseType === "RENEWAL" ? "license.renewal_recorded" : "license.purchase_created",
        action: `Recorded ${input.purchaseType.toLowerCase().replace("_", " ")} of ${input.quantity} seat(s) for "${license.name}"`,
        targetType: "license_purchase",
        targetId: purchase.id,
        targetLabel: license.name,
      },
      tx,
    );
    return purchase;
  });
}

// ---------------------------------------------------------------------------
// Assignments (Doc 10 Ch4/7)
// ---------------------------------------------------------------------------

export async function assignLicense(
  context: AuditContext,
  input: LicenseAssignmentInput,
  options: { requestItemId?: string } = {},
  client?: DbClient,
) {
  const run = async (tx: DbClient) => {
    const [license, person] = await Promise.all([
      tx.license.findFirst({ where: { id: input.licenseId, deletedAt: null } }),
      tx.person.findFirst({ where: { id: input.personId, deletedAt: null } }),
    ]);
    if (!license) throw new NotFoundError("License not found.");
    if (!license.isActive || license.status !== "ACTIVE") {
      throw new BusinessRuleError("Only active licenses can be assigned.");
    }
    if (!person) throw new NotFoundError("Employee not found.");
    if (!person.isActive) throw new BusinessRuleError("Only active employees may receive licenses.");
    // A shared license can be assigned to any company's people; a company-scoped
    // one stays within its owning company.
    if (!license.isShared && person.companyId !== license.companyId) {
      throw new BusinessRuleError("The employee and license must belong to the same company.");
    }

    // Over-allocation prevention (Doc 10 Ch4): checked inside the transaction.
    const availability = await getLicenseAvailability(input.licenseId, tx);
    if (availability.available <= 0) {
      throw new BusinessRuleError(
        `No available seats for "${license.name}" (${availability.assigned}/${availability.purchased} assigned).`,
      );
    }

    const assignment = await tx.licenseAssignment.create({
      data: {
        licenseId: input.licenseId,
        personId: input.personId,
        requestItemId: options.requestItemId ?? null,
        status: "ACTIVE",
        assignedById: context.actorUserId ?? null,
        assignedByLabel: context.actorName ?? context.actorLabel,
        notes: input.notes ?? null,
      },
    });
    await recordAudit(
      { ...context, companyId: license.companyId },
      {
        module: MODULE,
        eventType: "license.assigned",
        action: `Assigned "${license.name}" to ${person.firstName} ${person.lastName}`,
        targetType: "license_assignment",
        targetId: assignment.id,
        targetLabel: license.name,
      },
      tx,
    );
    return assignment;
  };
  if (client) return run(client);
  return db.$transaction(async (tx) => run(tx));
}

export async function setLicenseAssignmentStatus(
  context: AuditContext,
  id: string,
  status: "ACTIVE" | "SUSPENDED",
) {
  const existing = await db.licenseAssignment.findFirst({
    where: { id, deletedAt: null },
    include: { license: true, person: true },
  });
  if (!existing) throw new NotFoundError("License assignment not found.");
  if (existing.status === "REMOVED") {
    throw new BusinessRuleError("Removed assignments cannot be changed.");
  }
  return db.$transaction(async (tx) => {
    const assignment = await tx.licenseAssignment.update({ where: { id }, data: { status } });
    await recordAudit(
      { ...context, companyId: existing.license.companyId },
      {
        module: MODULE,
        eventType: status === "SUSPENDED" ? "license_assignment.suspended" : "license_assignment.activated",
        action: `${status === "SUSPENDED" ? "Suspended" : "Activated"} "${existing.license.name}" assignment for ${existing.person.firstName} ${existing.person.lastName}`,
        targetType: "license_assignment",
        targetId: id,
        targetLabel: existing.license.name,
      },
      tx,
    );
    return assignment;
  });
}

/** Removal immediately returns the seat to the available pool (Doc 10 Ch4). */
export async function removeLicenseAssignment(context: AuditContext, id: string, notes?: string) {
  const existing = await db.licenseAssignment.findFirst({
    where: { id, deletedAt: null },
    include: { license: true, person: true },
  });
  if (!existing) throw new NotFoundError("License assignment not found.");
  if (existing.status === "REMOVED") return existing;
  return db.$transaction(async (tx) => {
    const assignment = await tx.licenseAssignment.update({
      where: { id },
      data: {
        status: "REMOVED",
        removedAt: new Date(),
        removedById: context.actorUserId ?? null,
        notes: notes ?? existing.notes,
      },
    });
    await recordAudit(
      { ...context, companyId: existing.license.companyId },
      {
        module: MODULE,
        eventType: "license_assignment.removed",
        action: `Removed "${existing.license.name}" from ${existing.person.firstName} ${existing.person.lastName}; seat returned to pool`,
        targetType: "license_assignment",
        targetId: id,
        targetLabel: existing.license.name,
      },
      tx,
    );
    return assignment;
  });
}
