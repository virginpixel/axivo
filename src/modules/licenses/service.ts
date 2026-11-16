import { db, type DbClient } from "@/shared/db";
import { recordAudit, diffRecords, withVendorName, type AuditContext } from "@/shared/audit/audit";
import { BusinessRuleError, NotFoundError, ValidationError } from "@/shared/errors";
import type { LicenseStatus } from "@prisma/client";
import { hasDatePassed, startOfDayUtc } from "@/shared/utils";
import type { LicenseInput, LicensePurchaseInput, LicenseAssignmentInput } from "./validators";

/**
 * Licenses module business logic (SDS Doc 10).
 * Availability = purchased quantity − active assignments; over-allocation is
 * prevented atomically. Subscription licenses require start/expiry dates;
 * perpetual licenses never expire. History is immutable.
 */

const MODULE = "licenses";

export interface LicenseAvailability {
  /** Seats from purchases in force today, not every purchase ever made. */
  purchased: number;
  assigned: number;
  /** Never negative; see {@link LicenseAvailability.over} for the shortfall. */
  available: number;
  /** Seats assigned beyond the ones currently paid for. */
  over: number;
}

export async function getLicenseAvailability(
  licenseId: string,
  client: DbClient = db,
): Promise<LicenseAvailability> {
  // Only purchases in force today count. Summing every purchase ever recorded
  // made a renewal ADD to the seats it replaced - a licence cut from 300 seats
  // to 240 read as 540, and grew again every year it was renewed. A term that
  // has ended is history, not capacity.
  //
  // Terms that overlap still add up, which is what "Additional seats" bought
  // mid-term are for.
  const now = new Date();
  const today = startOfDayUtc(now);
  const [purchases, assigned] = await Promise.all([
    client.licensePurchase.aggregate({
      where: {
        licenseId,
        deletedAt: null,
        AND: [
          { OR: [{ startDate: null }, { startDate: { lte: now } }] },
          // Cover runs through the end of the expiry date, so a term expiring
          // today is still in force today.
          { OR: [{ expiryDate: null }, { expiryDate: { gte: today } }] },
        ],
      },
      _sum: { quantity: true },
    }),
    client.licenseAssignment.count({
      where: { licenseId, status: { in: ["PENDING", "ACTIVE", "SUSPENDED"] }, deletedAt: null },
    }),
  ]);
  const purchased = purchases._sum.quantity ?? 0;
  return {
    purchased,
    assigned,
    available: Math.max(0, purchased - assigned),
    over: Math.max(0, assigned - purchased),
  };
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
  // Dated through: a licence expiring today is covered for the whole of today.
  if (hasDatePassed(expiresAt, now)) return { expiresAt, state: "expired" };
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
    // Free the [companyId, name] unique slot from any soft-deleted license with
    // the same name (e.g. one deleted before name-freeing was added), so it can
    // be re-created without hitting the database unique constraint.
    const archived = await tx.license.findFirst({
      where: { companyId: input.companyId, name: { equals: input.name, mode: "insensitive" }, deletedAt: { not: null } },
    });
    if (archived) {
      await tx.license.update({
        where: { id: archived.id },
        data: { name: `${archived.name} (deleted ${archived.id.slice(0, 8)})` },
      });
    }
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
      // Free the [companyId, name] unique slot so the same name can be re-created;
      // the archived row keeps a traceable name.
      data: {
        deletedAt: new Date(),
        isActive: false,
        deletedById: context.actorUserId ?? null,
        name: `${license.name} (deleted ${id.slice(0, 8)})`,
      },
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

/**
 * Keep a subscription licence's status in step with the cover its purchases
 * actually provide, in both directions.
 *
 * Expiry used to be a one-way door: the nightly job marked a licence expired
 * and nothing brought it back, so a licence renewed afterwards sat marked
 * Expired beside its own future cover date. Correcting a mistyped expiry has
 * the same problem in reverse. Draft, Suspended and Retired are left alone -
 * somebody chose those, and a date must not override a decision.
 */
async function syncStatusToCover(
  context: AuditContext,
  license: { id: string; name: string; companyId: string; status: LicenseStatus; licenseType: string },
  tx: DbClient,
) {
  if (license.licenseType !== "SUBSCRIPTION") return;
  if (license.status !== "ACTIVE" && license.status !== "EXPIRED") return;
  const purchases = await tx.licensePurchase.findMany({
    where: { licenseId: license.id, deletedAt: null },
    select: { expiryDate: true },
  });
  if (purchases.length === 0) return;
  const coverage = getLicenseCoverage(purchases);
  if (coverage.state === "none") return;
  const target: LicenseStatus = coverage.state === "expired" ? "EXPIRED" : "ACTIVE";
  if (target === license.status) return;
  await tx.license.update({ where: { id: license.id }, data: { status: target } });
  await recordAudit(
    { ...context, companyId: license.companyId },
    {
      module: MODULE,
      eventType: target === "ACTIVE" ? "license.reactivated" : "license.expired",
      action:
        target === "ACTIVE"
          ? `License "${license.name}" returned to active: cover now runs to ${
              coverage.expiresAt?.toISOString().slice(0, 10) ?? "no expiry"
            }`
          : `License "${license.name}" expired: cover ended ${
              coverage.expiresAt?.toISOString().slice(0, 10) ?? "unknown"
            }`,
      targetType: "license",
      targetId: license.id,
      targetLabel: license.name,
    },
    tx,
  );
}

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
        vendorId: input.vendorId,
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
    await syncStatusToCover(context, license, tx);
    return purchase;
  });
}

/**
 * Correct a purchase that was entered wrongly. Purchases drive seat counts and
 * cover dates, so a typo in a quantity or an expiry misstates both until it is
 * fixed - and the record is the evidence of what was actually bought, so the
 * change is diffed into the audit trail rather than quietly overwritten.
 *
 * A corrected date can end cover or restore it, so the licence's status is
 * re-derived afterwards. Reducing a quantity below what is already assigned is
 * allowed: that is a real situation, shown as an over-allocation, and refusing
 * the edit would leave the wrong number on screen instead.
 */
export async function updatePurchase(
  context: AuditContext,
  id: string,
  input: LicensePurchaseInput,
) {
  const existing = await db.licensePurchase.findFirst({
    where: { id, deletedAt: null },
    include: { license: true, vendor: { select: { name: true } } },
  });
  if (!existing) throw new NotFoundError("Purchase not found.");
  if (existing.licenseId !== input.licenseId) {
    throw new BusinessRuleError("A purchase cannot be moved to another licence.");
  }
  const license = existing.license;
  if (license.deletedAt) throw new NotFoundError("License not found.");
  if (license.status === "RETIRED") {
    throw new BusinessRuleError("Retired licenses cannot have their purchases changed.");
  }
  if (license.licenseType === "SUBSCRIPTION") {
    const fieldErrors: Record<string, string> = {};
    if (!input.startDate) fieldErrors.startDate = "Start date is required for subscription licenses.";
    if (!input.expiryDate) fieldErrors.expiryDate = "Expiry date is required for subscription licenses.";
    if (Object.keys(fieldErrors).length > 0) throw new ValidationError(undefined, fieldErrors);
  }

  return db.$transaction(async (tx) => {
    const purchase = await tx.licensePurchase.update({
      where: { id },
      data: {
        purchaseType: input.purchaseType,
        quantity: input.quantity,
        purchaseDate: input.purchaseDate,
        startDate: input.startDate ?? null,
        expiryDate: input.expiryDate ?? null,
        price: input.price ?? null,
        currency: input.currency,
        vendorId: input.vendorId,
        purchaseReference: input.purchaseReference,
        notes: input.notes,
        updatedById: context.actorUserId ?? null,
      },
      include: { vendor: { select: { name: true } } },
    });
    await recordAudit(
      { ...context, companyId: license.companyId },
      {
        module: MODULE,
        eventType: "license.purchase_updated",
        action: `Corrected a ${input.purchaseType.toLowerCase().replace("_", " ")} on "${license.name}"`,
        targetType: "license_purchase",
        targetId: purchase.id,
        targetLabel: license.name,
        fieldChanges: diffRecords(
          withVendorName(existing),
          withVendorName(purchase),
          [
            "purchaseType", "quantity", "purchaseDate", "startDate", "expiryDate",
            "price", "currency", "vendor", "purchaseReference", "notes",
          ],
        ),
      },
      tx,
    );
    await syncStatusToCover(context, license, tx);
    return purchase;
  });
}

/**
 * Remove a purchase recorded in error - the wrong licence, or entered twice.
 *
 * Soft-deleted, not erased: what was bought and when is the evidence behind a
 * seat count, and a deletion is itself worth being able to account for. The
 * seats it contributed stop counting immediately, which can leave the licence
 * over-allocated; that is shown rather than prevented, because the alternative
 * is leaving a purchase on the record that never happened.
 */
export async function deletePurchase(context: AuditContext, id: string) {
  const existing = await db.licensePurchase.findFirst({
    where: { id, deletedAt: null },
    include: { license: true },
  });
  if (!existing) throw new NotFoundError("Purchase not found.");
  const license = existing.license;
  if (license.status === "RETIRED") {
    throw new BusinessRuleError("Retired licenses cannot have their purchases changed.");
  }
  return db.$transaction(async (tx) => {
    await tx.licensePurchase.update({ where: { id }, data: { deletedAt: new Date() } });
    await recordAudit(
      { ...context, companyId: license.companyId },
      {
        module: MODULE,
        eventType: "license.purchase_deleted",
        action:
          `Deleted a ${existing.purchaseType.toLowerCase().replace("_", " ")} of ` +
          `${existing.quantity} seat(s) from "${license.name}"` +
          (existing.expiryDate ? ` (expiring ${existing.expiryDate.toISOString().slice(0, 10)})` : ""),
        targetType: "license_purchase",
        targetId: id,
        targetLabel: license.name,
      },
      tx,
    );
    await syncStatusToCover(context, license, tx);
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
        availability.over > 0
          ? `"${license.name}" has ${availability.purchased} seat(s) with ${availability.assigned} assigned - ` +
            `${availability.over} over. Release seats or record a purchase before assigning more.`
          : `No available seats for "${license.name}" (${availability.assigned}/${availability.purchased} assigned).`,
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
