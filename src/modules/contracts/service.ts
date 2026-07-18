import { db } from "@/shared/db";
import { recordAudit, diffRecords, type AuditContext } from "@/shared/audit/audit";
import { BusinessRuleError, NotFoundError, ValidationError } from "@/shared/errors";
import type { ContractStatus } from "@prisma/client";
import type { ContractInput, ContractRenewalInput, ContractLinkInput } from "./validators";

/**
 * Contracts module business logic (SDS Doc 23).
 * Standalone business records with optional links to applications, licenses
 * and assets (Doc 00 §9). Renewals preserve history; expired contracts are
 * archived, never deleted.
 */

const MODULE = "contracts";

export async function createContract(context: AuditContext, input: ContractInput) {
  const company = await db.company.findFirst({
    where: { id: input.companyId, deletedAt: null, isActive: true },
  });
  if (!company) throw new BusinessRuleError("Company not found or disabled.");
  const duplicate = await db.contract.findFirst({
    where: {
      companyId: input.companyId,
      contractNumber: { equals: input.contractNumber, mode: "insensitive" },
      deletedAt: null,
    },
  });
  if (duplicate) {
    throw new ValidationError(undefined, { contractNumber: "This contract number already exists." });
  }
  if (input.ownerPersonId) {
    const owner = await db.person.findFirst({
      where: { id: input.ownerPersonId, companyId: input.companyId, deletedAt: null },
    });
    if (!owner) throw new BusinessRuleError("The contract owner must belong to the same company.");
  }
  return db.$transaction(async (tx) => {
    const contract = await tx.contract.create({
      data: {
        ...input,
        reminderDays: input.reminderDays ?? undefined,
        status: "DRAFT",
        createdById: context.actorUserId ?? null,
      },
    });
    await recordAudit(
      { ...context, companyId: input.companyId },
      {
        module: MODULE,
        eventType: "contract.created",
        action: `Created contract ${contract.contractNumber} "${contract.name}"`,
        targetType: "contract",
        targetId: contract.id,
        targetLabel: contract.contractNumber,
      },
      tx,
    );
    return contract;
  });
}

export async function updateContract(context: AuditContext, id: string, input: ContractInput) {
  const existing = await db.contract.findFirst({ where: { id, deletedAt: null } });
  if (!existing) throw new NotFoundError("Contract not found.");
  if (existing.companyId !== input.companyId) {
    throw new BusinessRuleError("Contracts cannot be moved between companies.");
  }
  const duplicate = await db.contract.findFirst({
    where: {
      companyId: input.companyId,
      contractNumber: { equals: input.contractNumber, mode: "insensitive" },
      deletedAt: null,
      id: { not: id },
    },
  });
  if (duplicate) {
    throw new ValidationError(undefined, { contractNumber: "This contract number already exists." });
  }
  return db.$transaction(async (tx) => {
    const contract = await tx.contract.update({
      where: { id },
      data: {
        ...input,
        reminderDays: input.reminderDays ?? undefined,
        updatedById: context.actorUserId ?? null,
      },
    });
    await recordAudit(
      { ...context, companyId: input.companyId },
      {
        module: MODULE,
        eventType: "contract.updated",
        action: `Updated contract ${contract.contractNumber}`,
        targetType: "contract",
        targetId: id,
        targetLabel: contract.contractNumber,
        fieldChanges: diffRecords(
          existing as unknown as Record<string, unknown>,
          contract as unknown as Record<string, unknown>,
          ["name", "vendor", "category", "startDate", "endDate", "renewalDate", "renewalType", "cost", "currency", "ownerPersonId", "notes"],
        ),
      },
      tx,
    );
    return contract;
  });
}

const STATUS_TRANSITIONS: Record<ContractStatus, ContractStatus[]> = {
  DRAFT: ["ACTIVE", "TERMINATED"],
  ACTIVE: ["EXPIRING", "EXPIRED", "RENEWED", "TERMINATED"],
  EXPIRING: ["ACTIVE", "EXPIRED", "RENEWED", "TERMINATED"],
  EXPIRED: ["RENEWED", "TERMINATED"],
  RENEWED: ["ACTIVE", "EXPIRING", "EXPIRED", "TERMINATED"],
  TERMINATED: [],
};

export async function setContractStatus(context: AuditContext, id: string, status: ContractStatus) {
  const existing = await db.contract.findFirst({ where: { id, deletedAt: null } });
  if (!existing) throw new NotFoundError("Contract not found.");
  if (existing.status === status) return existing;
  if (!STATUS_TRANSITIONS[existing.status].includes(status)) {
    throw new BusinessRuleError(`A contract cannot move from ${existing.status} to ${status}.`);
  }
  return db.$transaction(async (tx) => {
    const contract = await tx.contract.update({
      where: { id },
      data: { status, updatedById: context.actorUserId ?? null },
    });
    await recordAudit(
      { ...context, companyId: contract.companyId },
      {
        module: MODULE,
        eventType: `contract.${status.toLowerCase()}`,
        action: `Changed contract ${contract.contractNumber} status to ${status}`,
        targetType: "contract",
        targetId: id,
        targetLabel: contract.contractNumber,
        fieldChanges: [{ field: "status", previousValue: existing.status, newValue: status }],
      },
      tx,
    );
    return contract;
  });
}

/** Record a renewal; history is preserved and the contract window advances (Doc 23). */
export async function renewContract(context: AuditContext, input: ContractRenewalInput) {
  const contract = await db.contract.findFirst({ where: { id: input.contractId, deletedAt: null } });
  if (!contract) throw new NotFoundError("Contract not found.");
  if (contract.status === "TERMINATED") {
    throw new BusinessRuleError("Terminated contracts cannot be renewed.");
  }
  return db.$transaction(async (tx) => {
    const renewal = await tx.contractRenewal.create({
      data: {
        contractId: input.contractId,
        renewalDate: input.renewalDate,
        newStartDate: input.newStartDate ?? null,
        newEndDate: input.newEndDate ?? null,
        cost: input.cost ?? null,
        currency: input.currency ?? null,
        notes: input.notes ?? null,
        createdById: context.actorUserId ?? null,
      },
    });
    await tx.contract.update({
      where: { id: input.contractId },
      data: {
        status: "ACTIVE",
        startDate: input.newStartDate ?? contract.startDate,
        endDate: input.newEndDate ?? contract.endDate,
        renewalDate: input.renewalDate,
        cost: input.cost ?? contract.cost,
        updatedById: context.actorUserId ?? null,
      },
    });
    await recordAudit(
      { ...context, companyId: contract.companyId },
      {
        module: MODULE,
        eventType: "contract.renewed",
        action: `Renewed contract ${contract.contractNumber}`,
        targetType: "contract_renewal",
        targetId: renewal.id,
        targetLabel: contract.contractNumber,
      },
      tx,
    );
    return renewal;
  });
}

export async function linkContract(context: AuditContext, input: ContractLinkInput) {
  const contract = await db.contract.findFirst({ where: { id: input.contractId, deletedAt: null } });
  if (!contract) throw new NotFoundError("Contract not found.");

  // Verify the target exists and belongs to the same company.
  const target =
    input.entityType === "application"
      ? await db.application.findFirst({ where: { id: input.entityId, companyId: contract.companyId, deletedAt: null } })
      : input.entityType === "license"
        ? await db.license.findFirst({ where: { id: input.entityId, companyId: contract.companyId, deletedAt: null } })
        : await db.asset.findFirst({ where: { id: input.entityId, companyId: contract.companyId, deletedAt: null } });
  if (!target) {
    throw new BusinessRuleError(`The linked ${input.entityType} must exist in the same company.`);
  }
  const existing = await db.contractLink.findFirst({
    where: { contractId: input.contractId, entityType: input.entityType, entityId: input.entityId },
  });
  if (existing) return existing;
  return db.$transaction(async (tx) => {
    const link = await tx.contractLink.create({
      data: { ...input, createdById: context.actorUserId ?? null },
    });
    await recordAudit(
      { ...context, companyId: contract.companyId },
      {
        module: MODULE,
        eventType: "contract.linked",
        action: `Linked contract ${contract.contractNumber} to ${input.entityType}`,
        targetType: "contract",
        targetId: contract.id,
        targetLabel: contract.contractNumber,
        details: { entityType: input.entityType, entityId: input.entityId },
      },
      tx,
    );
    return link;
  });
}

export async function unlinkContract(context: AuditContext, linkId: string) {
  const link = await db.contractLink.findUnique({
    where: { id: linkId },
    include: { contract: true },
  });
  if (!link) throw new NotFoundError("Contract link not found.");
  return db.$transaction(async (tx) => {
    await tx.contractLink.delete({ where: { id: linkId } });
    await recordAudit(
      { ...context, companyId: link.contract.companyId },
      {
        module: MODULE,
        eventType: "contract.unlinked",
        action: `Removed contract link to ${link.entityType}`,
        targetType: "contract",
        targetId: link.contractId,
        targetLabel: link.contract.contractNumber,
        details: { entityType: link.entityType, entityId: link.entityId },
      },
      tx,
    );
  });
}
