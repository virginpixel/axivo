import { db } from "@/shared/db";
import { recordAudit, diffRecords } from "@/shared/audit/audit";
import { encryptSecret, decryptSecret } from "@/shared/crypto/encryption";
import { BusinessRuleError, NotFoundError, ValidationError } from "@/shared/errors";
import { assertCompanyAccess, type Scope } from "./service";
import type { CredentialLinkInput, CredentialSetInput } from "./validators";

/**
 * Credential vault (SDS Doc 24). A credential set is one login that any number
 * of devices can share. The password is stored encrypted and leaves the server
 * only through {@link revealPassword}, which is permission-gated and audited.
 *
 * Nothing in this file returns `secretCiphertext` to a caller except the
 * reveal, and that returns the plaintext of one set, on purpose, once.
 */

const MODULE = "infrastructure";

/** Sets a user may see: their company's plus the shared ones. */
export function visibleSetsFilter(scope: Scope) {
  return scope.isGlobalAdmin ? {} : { OR: [{ companyId: scope.companyId }, { companyId: null }] };
}

async function loadSet(scope: Scope, id: string) {
  const set = await db.credentialSet.findFirst({ where: { id, deletedAt: null, ...visibleSetsFilter(scope) } });
  if (!set) throw new NotFoundError("Credential set not found.");
  return set;
}

async function assertNameFree(companyId: string | null, name: string, excludeId?: string) {
  const duplicate = await db.credentialSet.findFirst({
    where: {
      companyId,
      deletedAt: null,
      name: { equals: name, mode: "insensitive" },
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: { id: true },
  });
  if (duplicate) throw new ValidationError(undefined, { name: "A credential set with this name already exists." });
}

function auditContext(scope: Scope, companyId: string | null) {
  return { ...scope.audit, companyId: companyId ?? scope.audit.companyId ?? null };
}

export async function createCredentialSet(scope: Scope, input: CredentialSetInput) {
  assertCompanyAccess(scope, input.companyId);
  if (input.companyId) {
    const company = await db.company.findFirst({ where: { id: input.companyId, deletedAt: null } });
    if (!company) throw new BusinessRuleError("Company not found.");
  }
  await assertNameFree(input.companyId, input.name);
  const password = input.password ?? "";
  return db.$transaction(async (tx) => {
    const set = await tx.credentialSet.create({
      data: {
        companyId: input.companyId,
        name: input.name,
        username: input.username,
        notes: input.notes,
        secretCiphertext: password ? encryptSecret(password) : null,
        passwordChangedAt: password ? new Date() : null,
        createdById: scope.audit.actorUserId ?? null,
      },
      select: { id: true, name: true },
    });
    await recordAudit(
      auditContext(scope, input.companyId),
      {
        module: MODULE,
        eventType: "credential.created",
        action: `Created credential set "${set.name}"${password ? " with a password" : ""}`,
        targetType: "credential_set",
        targetId: set.id,
        targetLabel: set.name,
      },
      tx,
    );
    return set;
  });
}

export async function updateCredentialSet(scope: Scope, id: string, input: CredentialSetInput) {
  const existing = await loadSet(scope, id);
  assertCompanyAccess(scope, existing.companyId);
  assertCompanyAccess(scope, input.companyId);
  if (input.companyId !== existing.companyId) {
    // Narrowing a shared set to one company would cut it off from devices of
    // the others. Allow it only when no such device is linked.
    if (input.companyId) {
      const outside = await db.infraDeviceCredential.count({
        where: { credentialSetId: id, device: { companyId: { not: input.companyId }, deletedAt: null } },
      });
      if (outside > 0) {
        throw new ValidationError(undefined, {
          companyId: `${outside} device${outside === 1 ? "" : "s"} of another company use this set. Unlink ${outside === 1 ? "it" : "them"} first.`,
        });
      }
    }
  }
  await assertNameFree(input.companyId, input.name, id);
  const newPassword = input.password ? input.password : null;
  return db.$transaction(async (tx) => {
    const set = await tx.credentialSet.update({
      where: { id },
      data: {
        companyId: input.companyId,
        name: input.name,
        username: input.username,
        notes: input.notes,
        updatedById: scope.audit.actorUserId ?? null,
        ...(newPassword ? { secretCiphertext: encryptSecret(newPassword), passwordChangedAt: new Date() } : {}),
      },
      select: { id: true, name: true, username: true, notes: true, companyId: true },
    });
    const fieldChanges = diffRecords(existing, set, ["name", "username", "notes", "companyId"]);
    // The value never enters the log - only the fact that it changed.
    if (newPassword) fieldChanges.push({ field: "password", previousValue: "[redacted]", newValue: "[redacted]" });
    if (fieldChanges.length > 0) {
      await recordAudit(
        auditContext(scope, set.companyId),
        {
          module: MODULE,
          eventType: newPassword ? "credential.password_changed" : "credential.updated",
          action: newPassword ? `Changed the password of "${set.name}"` : `Updated credential set "${set.name}"`,
          targetType: "credential_set",
          targetId: id,
          targetLabel: set.name,
          fieldChanges,
        },
        tx,
      );
    }
    return set;
  });
}

export async function deleteCredentialSet(scope: Scope, id: string) {
  const existing = await loadSet(scope, id);
  assertCompanyAccess(scope, existing.companyId);
  await db.$transaction(async (tx) => {
    const unlinked = await tx.infraDeviceCredential.deleteMany({ where: { credentialSetId: id } });
    // The ciphertext goes with the record: a deleted login should not stay
    // recoverable from the database.
    await tx.credentialSet.update({
      where: { id },
      data: { deletedAt: new Date(), deletedById: scope.audit.actorUserId ?? null, secretCiphertext: null },
    });
    await recordAudit(
      auditContext(scope, existing.companyId),
      {
        module: MODULE,
        eventType: "credential.deleted",
        action: `Deleted credential set "${existing.name}"${unlinked.count ? ` and unlinked it from ${unlinked.count} device${unlinked.count === 1 ? "" : "s"}` : ""}`,
        targetType: "credential_set",
        targetId: id,
        targetLabel: existing.name,
      },
      tx,
    );
  });
}

/**
 * Decrypt one password for a person holding the reveal permission. The
 * caller has already checked the permission; this records the reveal, and
 * records it before returning so a reveal can never go unlogged.
 */
export async function revealPassword(scope: Scope, id: string): Promise<string> {
  const set = await loadSet(scope, id);
  if (!set.secretCiphertext) throw new BusinessRuleError("No password is stored for this credential set.");
  const plaintext = decryptSecret(set.secretCiphertext);
  await db.$transaction(async (tx) => {
    await recordAudit(
      auditContext(scope, set.companyId),
      {
        module: MODULE,
        eventType: "credential.revealed",
        action: `Revealed the password of "${set.name}"`,
        targetType: "credential_set",
        targetId: id,
        targetLabel: set.name,
      },
      tx,
    );
  });
  return plaintext;
}

export async function linkCredential(scope: Scope, input: CredentialLinkInput) {
  const device = await db.infraDevice.findFirst({ where: { id: input.deviceId, deletedAt: null } });
  if (!device) throw new NotFoundError("Device not found.");
  assertCompanyAccess(scope, device.companyId);
  const set = await loadSet(scope, input.credentialSetId);
  if (set.companyId && set.companyId !== device.companyId) {
    throw new ValidationError(undefined, { credentialSetId: "That credential set belongs to another company." });
  }
  const existing = await db.infraDeviceCredential.findUnique({
    where: { deviceId_credentialSetId: { deviceId: device.id, credentialSetId: set.id } },
  });
  await db.$transaction(async (tx) => {
    if (existing) {
      await tx.infraDeviceCredential.update({ where: { id: existing.id }, data: { purpose: input.purpose } });
    } else {
      await tx.infraDeviceCredential.create({
        data: {
          deviceId: device.id,
          credentialSetId: set.id,
          purpose: input.purpose,
          createdById: scope.audit.actorUserId ?? null,
        },
      });
    }
    await recordAudit(
      auditContext(scope, device.companyId),
      {
        module: MODULE,
        eventType: existing ? "credential.link_updated" : "credential.linked",
        action: existing
          ? `Changed what "${set.name}" is used for on "${device.name}"`
          : `Linked credential set "${set.name}" to "${device.name}"${input.purpose ? ` (${input.purpose})` : ""}`,
        targetType: "infra_device",
        targetId: device.id,
        targetLabel: device.name,
        ...(existing ? { fieldChanges: [{ field: "purpose", previousValue: existing.purpose, newValue: input.purpose }] } : {}),
      },
      tx,
    );
  });
}

export async function unlinkCredential(scope: Scope, linkId: string) {
  const link = await db.infraDeviceCredential.findUnique({
    where: { id: linkId },
    include: { device: true, credentialSet: { select: { name: true } } },
  });
  if (!link) throw new NotFoundError("Link not found.");
  assertCompanyAccess(scope, link.device.companyId);
  await db.$transaction(async (tx) => {
    await tx.infraDeviceCredential.delete({ where: { id: linkId } });
    await recordAudit(
      auditContext(scope, link.device.companyId),
      {
        module: MODULE,
        eventType: "credential.unlinked",
        action: `Unlinked credential set "${link.credentialSet.name}" from "${link.device.name}"`,
        targetType: "infra_device",
        targetId: link.deviceId,
        targetLabel: link.device.name,
      },
      tx,
    );
  });
}

/** Link one set to several devices at once - a shared switch login, say. */
export async function linkCredentialToDevices(scope: Scope, credentialSetId: string, deviceIds: string[], purpose: string | null) {
  const set = await loadSet(scope, credentialSetId);
  const devices = await db.infraDevice.findMany({
    where: { id: { in: deviceIds }, deletedAt: null, ...(scope.isGlobalAdmin ? {} : { companyId: scope.companyId }) },
    select: { id: true, name: true, companyId: true },
  });
  if (devices.length !== new Set(deviceIds).size) throw new NotFoundError("One of the devices was not found.");
  const foreign = devices.filter((device) => set.companyId && device.companyId !== set.companyId);
  if (foreign.length > 0) {
    throw new ValidationError(undefined, {
      deviceIds: `"${set.name}" belongs to one company, so it cannot be linked to ${foreign.map((d) => d.name).join(", ")}.`,
    });
  }
  const already = await db.infraDeviceCredential.findMany({
    where: { credentialSetId, deviceId: { in: deviceIds } },
    select: { deviceId: true },
  });
  const skip = new Set(already.map((link) => link.deviceId));
  const toLink = devices.filter((device) => !skip.has(device.id));
  if (toLink.length === 0) return 0;
  await db.$transaction(async (tx) => {
    await tx.infraDeviceCredential.createMany({
      data: toLink.map((device) => ({
        deviceId: device.id, credentialSetId, purpose, createdById: scope.audit.actorUserId ?? null,
      })),
    });
    await recordAudit(
      auditContext(scope, set.companyId),
      {
        module: MODULE,
        eventType: "credential.linked",
        action: `Linked credential set "${set.name}" to ${toLink.length} device${toLink.length === 1 ? "" : "s"}${purpose ? ` (${purpose})` : ""}`,
        targetType: "credential_set",
        targetId: set.id,
        targetLabel: set.name,
        details: { devices: toLink.map((device) => device.name) },
      },
      tx,
    );
  });
  return toLink.length;
}
