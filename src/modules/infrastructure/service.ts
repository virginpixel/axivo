import { db, type DbClient } from "@/shared/db";
import { recordAudit, diffRecords, type AuditContext } from "@/shared/audit/audit";
import { AuthorizationError, BusinessRuleError, NotFoundError, ValidationError } from "@/shared/errors";
import type { DeviceInput, DeviceStatus, DeviceTypeInput } from "./validators";

/**
 * Infrastructure register: network devices and servers & hosts (SDS Doc 24).
 * Every device belongs to one company. Users outside the System Administrator
 * role only ever see and change their own company's devices.
 */

const MODULE = "infrastructure";

export interface Scope {
  audit: AuditContext;
  /** The acting user's own company. */
  companyId: string;
  /** System Administrators work across every company. */
  isGlobalAdmin: boolean;
}

export function companyFilter(scope: Scope): { companyId?: string } {
  return scope.isGlobalAdmin ? {} : { companyId: scope.companyId };
}

export function assertCompanyAccess(scope: Scope, companyId: string | null): void {
  if (scope.isGlobalAdmin) return;
  // A null company is a shared credential set: visible to every company, but
  // only a System Administrator may change it.
  if (companyId !== scope.companyId) throw new AuthorizationError();
}

/** Exported for the importer, which resolves the same references in bulk. */
export async function findDeviceByName(client: DbClient, companyId: string, name: string, excludeId?: string) {
  return client.infraDevice.findFirst({
    where: {
      companyId,
      deletedAt: null,
      name: { equals: name, mode: "insensitive" },
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: { id: true },
  });
}

/** Resolve and check everything a device points at; returns the type's kind. */
async function validateReferences(input: DeviceInput, deviceId?: string) {
  const company = await db.company.findFirst({ where: { id: input.companyId, deletedAt: null, isActive: true } });
  if (!company) throw new BusinessRuleError("Company not found or disabled.");

  const type = await db.infraDeviceType.findFirst({ where: { id: input.typeId, deletedAt: null } });
  if (!type) throw new ValidationError(undefined, { typeId: "Select a device type." });
  if (!type.isActive && !deviceId) throw new ValidationError(undefined, { typeId: "That device type is inactive." });

  if (await findDeviceByName(db, input.companyId, input.name, deviceId)) {
    throw new ValidationError(undefined, { name: "A device with this name already exists in this company." });
  }

  if (input.locationId) {
    const location = await db.location.findFirst({
      where: { id: input.locationId, companyId: input.companyId, deletedAt: null },
    });
    if (!location) throw new ValidationError(undefined, { locationId: "Select a location of this company." });
  }
  if (input.manufacturerId) {
    const manufacturer = await db.manufacturer.findFirst({ where: { id: input.manufacturerId, deletedAt: null } });
    if (!manufacturer) throw new ValidationError(undefined, { manufacturerId: "Select a manufacturer." });
  }
  if (input.hostDeviceId) {
    if (input.hostDeviceId === deviceId) {
      throw new ValidationError(undefined, { hostDeviceId: "A device cannot run on itself." });
    }
    const host = await db.infraDevice.findFirst({
      where: { id: input.hostDeviceId, companyId: input.companyId, kind: "SERVER", deletedAt: null },
      select: { id: true, hostDeviceId: true },
    });
    if (!host) throw new ValidationError(undefined, { hostDeviceId: "Select a server of the same company." });
    // Walk up the chain so a host can never end up running on its own guest.
    if (deviceId) {
      let cursor = host.hostDeviceId;
      for (let depth = 0; cursor && depth < 20; depth += 1) {
        if (cursor === deviceId) {
          throw new ValidationError(undefined, { hostDeviceId: "That server already runs on this one." });
        }
        const next = await db.infraDevice.findUnique({ where: { id: cursor }, select: { hostDeviceId: true } });
        cursor = next?.hostDeviceId ?? null;
      }
    }
  }

  const applicationIds = type.kind === "SERVER" ? Array.from(new Set(input.applicationIds)) : [];
  if (applicationIds.length > 0) {
    const apps = await db.application.findMany({
      where: {
        id: { in: applicationIds },
        deletedAt: null,
        OR: [{ companyId: input.companyId }, { isShared: true }],
      },
      select: { id: true },
    });
    if (apps.length !== applicationIds.length) {
      throw new ValidationError(undefined, { applicationIds: "Select applications of this company." });
    }
  }
  return { kind: type.kind, applicationIds };
}

function deviceData(input: DeviceInput) {
  return {
    typeId: input.typeId,
    name: input.name,
    hostname: input.hostname,
    ipAddress: input.ipAddress,
    locationId: input.locationId,
    manufacturerId: input.manufacturerId,
    model: input.model,
    serialNumber: input.serialNumber,
    operatingSystem: input.operatingSystem,
    version: input.version,
    domain: input.domain,
    purpose: input.purpose,
    status: input.status,
    hostDeviceId: input.hostDeviceId,
    notes: input.notes,
  };
}

const AUDIT_INCLUDE = {
  type: { select: { name: true } },
  location: { select: { name: true } },
  manufacturer: { select: { name: true } },
  host: { select: { name: true } },
  applications: { select: { applicationId: true, application: { select: { name: true } } } },
} as const;

type AuditableDevice = Awaited<ReturnType<typeof loadAuditable>>;

function loadAuditable(client: DbClient, id: string) {
  return client.infraDevice.findUniqueOrThrow({ where: { id }, include: AUDIT_INCLUDE });
}

/** Swap references for names so the audit trail reads like the screen. */
function readable(device: NonNullable<AuditableDevice>): Record<string, unknown> {
  return {
    ...device,
    type: device.type.name,
    location: device.location?.name ?? null,
    manufacturer: device.manufacturer?.name ?? null,
    runsOn: device.host?.name ?? null,
    applications: device.applications.map((link) => link.application.name).sort().join(", ") || null,
  };
}

const DIFF_FIELDS = [
  "name", "type", "hostname", "ipAddress", "location", "manufacturer", "model", "serialNumber",
  "operatingSystem", "version", "domain", "purpose", "status", "runsOn", "applications", "notes",
];

export async function createDevice(scope: Scope, input: DeviceInput) {
  assertCompanyAccess(scope, input.companyId);
  const { kind, applicationIds } = await validateReferences(input);
  return db.$transaction(async (tx) => {
    const device = await tx.infraDevice.create({
      data: {
        ...deviceData(input),
        companyId: input.companyId,
        kind,
        createdById: scope.audit.actorUserId ?? null,
        applications: {
          create: applicationIds.map((applicationId) => ({ applicationId, createdById: scope.audit.actorUserId ?? null })),
        },
      },
    });
    await recordAudit(
      { ...scope.audit, companyId: input.companyId },
      {
        module: MODULE,
        eventType: "device.created",
        action: `Added ${kind === "NETWORK" ? "network device" : "server"} "${device.name}"`,
        targetType: "infra_device",
        targetId: device.id,
        targetLabel: device.name,
      },
      tx,
    );
    return device;
  });
}

export async function updateDevice(scope: Scope, id: string, input: DeviceInput) {
  const existing = await db.infraDevice.findFirst({ where: { id, deletedAt: null } });
  if (!existing) throw new NotFoundError("Device not found.");
  assertCompanyAccess(scope, existing.companyId);
  if (existing.companyId !== input.companyId) {
    throw new BusinessRuleError("Devices cannot be moved between companies.");
  }
  const { kind, applicationIds } = await validateReferences(input, id);
  return db.$transaction(async (tx) => {
    const before = await loadAuditable(tx, id);
    await tx.infraDeviceApplication.deleteMany({ where: { deviceId: id, applicationId: { notIn: applicationIds } } });
    const kept = new Set(before.applications.map((link) => link.applicationId));
    const added = applicationIds.filter((appId) => !kept.has(appId));
    if (added.length > 0) {
      await tx.infraDeviceApplication.createMany({
        data: added.map((applicationId) => ({ deviceId: id, applicationId, createdById: scope.audit.actorUserId ?? null })),
      });
    }
    await tx.infraDevice.update({
      where: { id },
      data: { ...deviceData(input), kind, updatedById: scope.audit.actorUserId ?? null },
    });
    const after = await loadAuditable(tx, id);
    const fieldChanges = diffRecords(readable(before), readable(after), DIFF_FIELDS);
    if (fieldChanges.length > 0) {
      await recordAudit(
        { ...scope.audit, companyId: existing.companyId },
        {
          module: MODULE,
          eventType: "device.updated",
          action: `Updated "${after.name}"`,
          targetType: "infra_device",
          targetId: id,
          targetLabel: after.name,
          fieldChanges,
        },
        tx,
      );
    }
    return after;
  });
}

export async function setDeviceStatus(scope: Scope, id: string, status: DeviceStatus) {
  const existing = await db.infraDevice.findFirst({ where: { id, deletedAt: null } });
  if (!existing) throw new NotFoundError("Device not found.");
  assertCompanyAccess(scope, existing.companyId);
  if (existing.status === status) return existing;
  return db.$transaction(async (tx) => {
    const device = await tx.infraDevice.update({
      where: { id },
      data: { status, updatedById: scope.audit.actorUserId ?? null },
    });
    await recordAudit(
      { ...scope.audit, companyId: existing.companyId },
      {
        module: MODULE,
        eventType: "device.status_changed",
        action: `Set "${device.name}" to ${status.toLowerCase()}`,
        targetType: "infra_device",
        targetId: id,
        targetLabel: device.name,
        fieldChanges: [{ field: "status", previousValue: existing.status, newValue: status }],
      },
      tx,
    );
    return device;
  });
}

/**
 * Soft delete. A host that still has virtual machines on it is refused: they
 * would silently lose where they run. Decommissioning keeps the record instead.
 */
export async function deleteDevice(scope: Scope, id: string) {
  const existing = await db.infraDevice.findFirst({
    where: { id, deletedAt: null },
    include: { _count: { select: { guests: { where: { deletedAt: null } } } } },
  });
  if (!existing) throw new NotFoundError("Device not found.");
  assertCompanyAccess(scope, existing.companyId);
  if (existing._count.guests > 0) {
    throw new BusinessRuleError(
      `${existing._count.guests} device${existing._count.guests === 1 ? " runs" : "s run"} on "${existing.name}". Move ${existing._count.guests === 1 ? "it" : "them"} first, or set this one to Decommissioned instead.`,
    );
  }
  await db.$transaction(async (tx) => {
    await tx.infraDeviceCredential.deleteMany({ where: { deviceId: id } });
    await tx.infraDeviceApplication.deleteMany({ where: { deviceId: id } });
    await tx.infraDevice.update({
      where: { id },
      data: { deletedAt: new Date(), deletedById: scope.audit.actorUserId ?? null },
    });
    await recordAudit(
      { ...scope.audit, companyId: existing.companyId },
      {
        module: MODULE,
        eventType: "device.deleted",
        action: `Deleted "${existing.name}"`,
        targetType: "infra_device",
        targetId: id,
        targetLabel: existing.name,
      },
      tx,
    );
  });
  return existing;
}

// ---------------------------------------------------------------------------
// Device types (Settings → Device Types). Global, like asset categories.
// ---------------------------------------------------------------------------

export async function createDeviceType(audit: AuditContext, input: DeviceTypeInput) {
  const duplicate = await db.infraDeviceType.findFirst({ where: { name: { equals: input.name, mode: "insensitive" } } });
  if (duplicate && !duplicate.deletedAt) throw new ValidationError(undefined, { name: "This device type already exists." });
  const max = await db.infraDeviceType.aggregate({ _max: { sortOrder: true } });
  const type = duplicate
    ? await db.infraDeviceType.update({
        where: { id: duplicate.id },
        data: { name: input.name, kind: input.kind, isActive: true, deletedAt: null },
      })
    : await db.infraDeviceType.create({ data: { ...input, sortOrder: (max._max.sortOrder ?? 0) + 1 } });
  await recordAudit(audit, {
    module: MODULE,
    eventType: "device_type.created",
    action: `Added device type "${type.name}"`,
    targetType: "infra_device_type",
    targetId: type.id,
    targetLabel: type.name,
  });
  return type;
}

export async function updateDeviceType(audit: AuditContext, id: string, input: DeviceTypeInput) {
  const existing = await db.infraDeviceType.findFirst({
    where: { id, deletedAt: null },
    include: { _count: { select: { devices: { where: { deletedAt: null } } } } },
  });
  if (!existing) throw new NotFoundError("Device type not found.");
  const duplicate = await db.infraDeviceType.findFirst({
    where: { name: { equals: input.name, mode: "insensitive" }, id: { not: id }, deletedAt: null },
  });
  if (duplicate) throw new ValidationError(undefined, { name: "This device type already exists." });
  if (input.kind !== existing.kind && existing._count.devices > 0) {
    throw new ValidationError(undefined, {
      kind: `${existing._count.devices} device${existing._count.devices === 1 ? " uses" : "s use"} this type, so it cannot move to the other register.`,
    });
  }
  const type = await db.infraDeviceType.update({ where: { id }, data: input });
  await recordAudit(audit, {
    module: MODULE,
    eventType: "device_type.updated",
    action: `Updated device type "${type.name}"`,
    targetType: "infra_device_type",
    targetId: id,
    targetLabel: type.name,
    fieldChanges: diffRecords(existing, type, ["name", "kind"]),
  });
  return type;
}

export async function setDeviceTypeActive(audit: AuditContext, id: string, isActive: boolean) {
  const type = await db.infraDeviceType.update({ where: { id }, data: { isActive } });
  await recordAudit(audit, {
    module: MODULE,
    eventType: isActive ? "device_type.activated" : "device_type.deactivated",
    action: `${isActive ? "Activated" : "Deactivated"} device type "${type.name}"`,
    targetType: "infra_device_type",
    targetId: id,
    targetLabel: type.name,
  });
  return type;
}

export async function deleteDeviceType(audit: AuditContext, id: string) {
  const existing = await db.infraDeviceType.findFirst({
    where: { id, deletedAt: null },
    include: { _count: { select: { devices: { where: { deletedAt: null } } } } },
  });
  if (!existing) throw new NotFoundError("Device type not found.");
  if (existing._count.devices > 0) {
    throw new BusinessRuleError(
      `${existing._count.devices} device${existing._count.devices === 1 ? " uses" : "s use"} "${existing.name}". Deactivate it instead.`,
    );
  }
  await db.infraDeviceType.update({ where: { id }, data: { deletedAt: new Date(), isActive: false } });
  await recordAudit(audit, {
    module: MODULE,
    eventType: "device_type.deleted",
    action: `Deleted device type "${existing.name}"`,
    targetType: "infra_device_type",
    targetId: id,
    targetLabel: existing.name,
  });
}
