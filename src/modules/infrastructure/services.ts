import { db } from "@/shared/db";
import { recordAudit, diffRecords } from "@/shared/audit/audit";
import { NotFoundError, ValidationError } from "@/shared/errors";
import { assertCompanyAccess, type Scope } from "./service";
import type { ServiceInput } from "./validators";

/**
 * Services on a server (SDS Doc 24): what it offers on the network, such as
 * the Docker stacks on a container host, each with its ports and address.
 * Every change is recorded on the server's own history.
 */

const MODULE = "infrastructure";

function describe(service: { name: string; ports: string | null }) {
  return service.ports ? `${service.name} (${service.ports})` : service.name;
}

async function loadServer(scope: Scope, deviceId: string) {
  const device = await db.infraDevice.findFirst({
    where: { id: deviceId, deletedAt: null },
    select: { id: true, name: true, kind: true, companyId: true },
  });
  if (!device) throw new NotFoundError("Server not found.");
  assertCompanyAccess(scope, device.companyId);
  if (device.kind !== "SERVER") {
    throw new ValidationError(undefined, { deviceId: "Services are recorded on servers and hosts." });
  }
  return device;
}

/** One name per server, whatever the capitals. */
async function assertNameFree(deviceId: string, name: string, exceptId?: string) {
  const clash = await db.infraService.findFirst({
    where: { deviceId, name: { equals: name, mode: "insensitive" }, ...(exceptId ? { id: { not: exceptId } } : {}) },
    select: { id: true },
  });
  if (clash) throw new ValidationError(undefined, { name: `This server already has a service called "${name}".` });
}

async function loadService(scope: Scope, id: string) {
  const service = await db.infraService.findFirst({
    where: { id, device: { deletedAt: null } },
    include: { device: { select: { id: true, name: true, companyId: true } } },
  });
  if (!service) throw new NotFoundError("Service not found.");
  assertCompanyAccess(scope, service.device.companyId);
  return service;
}

export async function createService(scope: Scope, input: ServiceInput) {
  const device = await loadServer(scope, input.deviceId);
  await assertNameFree(device.id, input.name);
  return db.$transaction(async (tx) => {
    const service = await tx.infraService.create({
      data: {
        deviceId: device.id,
        name: input.name,
        ports: input.ports,
        url: input.url,
        notes: input.notes,
        createdById: scope.audit.actorUserId ?? null,
        updatedById: scope.audit.actorUserId ?? null,
      },
    });
    await recordAudit(
      { ...scope.audit, companyId: device.companyId },
      {
        module: MODULE,
        eventType: "service.created",
        action: `Added service ${describe(service)}`,
        targetType: "infra_device",
        targetId: device.id,
        targetLabel: device.name,
        details: { serviceId: service.id },
      },
      tx,
    );
    return service;
  });
}

export async function updateService(scope: Scope, id: string, input: ServiceInput) {
  const existing = await loadService(scope, id);
  if (input.deviceId !== existing.deviceId) {
    throw new ValidationError(undefined, { deviceId: "A service stays on the server it was added to." });
  }
  await assertNameFree(existing.deviceId, input.name, id);
  return db.$transaction(async (tx) => {
    const service = await tx.infraService.update({
      where: { id },
      data: { name: input.name, ports: input.ports, url: input.url, notes: input.notes, updatedById: scope.audit.actorUserId ?? null },
    });
    await recordAudit(
      { ...scope.audit, companyId: existing.device.companyId },
      {
        module: MODULE,
        eventType: "service.updated",
        action: `Updated service ${describe(service)}`,
        targetType: "infra_device",
        targetId: existing.device.id,
        targetLabel: existing.device.name,
        details: { serviceId: id },
        fieldChanges: diffRecords(existing, service, ["name", "ports", "url", "notes"]),
      },
      tx,
    );
    return service;
  });
}

export async function deleteService(scope: Scope, id: string) {
  const existing = await loadService(scope, id);
  await db.$transaction(async (tx) => {
    await tx.infraService.delete({ where: { id } });
    await recordAudit(
      { ...scope.audit, companyId: existing.device.companyId },
      {
        module: MODULE,
        eventType: "service.deleted",
        action: `Removed service ${describe(existing)}`,
        targetType: "infra_device",
        targetId: existing.device.id,
        targetLabel: existing.device.name,
        details: { serviceId: id },
      },
      tx,
    );
  });
}
