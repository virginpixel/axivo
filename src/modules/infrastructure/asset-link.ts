import { db, type DbClient } from "@/shared/db";
import { recordAudit, type AuditContext } from "@/shared/audit/audit";
import { BusinessRuleError, ValidationError } from "@/shared/errors";
import type { AssetMode, DeviceKind } from "./validators";

/**
 * Devices and assets (SDS Doc 24). A switch is both: the asset record holds
 * what Finance and the asset register care about (tag, purchase, warranty,
 * disposal), the device record how it is wired and configured. They are
 * linked one to one rather than copied, so neither register has to repeat
 * the other.
 */

const MODULE = "infrastructure";

type Plan =
  | { type: "keep" }
  | { type: "unlink" }
  | { type: "link"; assetId: string; label: string }
  | { type: "create"; categoryId: string; assetTag: string | null };

interface Choice {
  assetMode: AssetMode;
  assetCategoryId: string | null;
  assetLookup: string | null;
}

interface DeviceFacts {
  companyId: string;
  name: string;
  serialNumber: string | null;
}

const assetLabel = (asset: { name: string; assetTag: string | null }) =>
  asset.assetTag ? `${asset.name} (${asset.assetTag})` : asset.name;

/** Find an asset the user named by tag, serial number or exact name. */
async function findAsset(companyId: string, lookup: string) {
  const where = { companyId, deletedAt: null };
  const exact = { equals: lookup, mode: "insensitive" as const };
  return (
    (await db.asset.findFirst({ where: { ...where, assetTag: exact }, include: { infraDevice: { select: { id: true, name: true } } } })) ??
    (await db.asset.findFirst({ where: { ...where, serialNumber: exact }, include: { infraDevice: { select: { id: true, name: true } } } })) ??
    (await db.asset.findFirst({ where: { ...where, name: exact }, include: { infraDevice: { select: { id: true, name: true } } } }))
  );
}

/**
 * Check the form's asset choice before anything is written, so a bad tag or
 * a clashing name is reported on the form instead of half-saving the device.
 */
export async function planAsset(choice: Choice, device: DeviceFacts, deviceId: string | null): Promise<Plan> {
  if (choice.assetMode === "keep") return { type: "keep" };
  if (choice.assetMode === "none") return { type: "unlink" };

  if (choice.assetMode === "link") {
    const asset = await findAsset(device.companyId, choice.assetLookup!);
    if (!asset) {
      throw new ValidationError(undefined, { assetLookup: "No asset of this company has that tag, serial number or name." });
    }
    if (asset.infraDevice && asset.infraDevice.id !== deviceId) {
      throw new ValidationError(undefined, { assetLookup: `That asset is already linked to "${asset.infraDevice.name}".` });
    }
    if (asset.status === "DISCARDED") {
      throw new ValidationError(undefined, { assetLookup: "That asset has been discarded." });
    }
    return { type: "link", assetId: asset.id, label: assetLabel(asset) };
  }

  const category = await db.assetCategory.findFirst({ where: { id: choice.assetCategoryId!, deletedAt: null, isActive: true } });
  if (!category) throw new ValidationError(undefined, { assetCategoryId: "Choose an active asset category." });
  const tag = choice.assetLookup;
  const scope = { companyId: device.companyId, deletedAt: null };
  const [byTag, byName, bySerial] = await Promise.all([
    tag ? db.asset.findFirst({ where: { ...scope, assetTag: { equals: tag, mode: "insensitive" } } }) : null,
    db.asset.findFirst({ where: { ...scope, name: { equals: device.name, mode: "insensitive" } } }),
    device.serialNumber
      ? db.asset.findFirst({ where: { ...scope, serialNumber: { equals: device.serialNumber, mode: "insensitive" } } })
      : null,
  ]);
  if (byTag) throw new ValidationError(undefined, { assetLookup: "This asset tag already exists in this company." });
  const existing = bySerial ?? byName;
  if (existing) {
    throw new ValidationError(undefined, {
      assetCategoryId: `"${assetLabel(existing)}" is already in the asset register${bySerial ? " with this serial number" : ""}. Choose "Link an existing asset" instead.`,
    });
  }
  return { type: "create", categoryId: category.id, assetTag: tag };
}

/** Create the asset for a device, from what the device record says. */
async function createAssetFor(tx: DbClient, audit: AuditContext, deviceId: string, categoryId: string, assetTag: string | null) {
  const device = await tx.infraDevice.findUniqueOrThrow({
    where: { id: deviceId },
    include: { manufacturer: { select: { name: true } } },
  });
  const asset = await tx.asset.create({
    data: {
      companyId: device.companyId,
      categoryId,
      name: device.name,
      assetTag,
      serialNumber: device.serialNumber,
      manufacturer: device.manufacturer?.name ?? null,
      model: device.model,
      locationId: device.locationId,
      status: "IN_USE",
      createdById: audit.actorUserId ?? null,
    },
  });
  await recordAudit(
    { ...audit, companyId: device.companyId },
    {
      module: "assets",
      eventType: "asset.created",
      action: `Created asset "${asset.name}"${asset.assetTag ? ` (${asset.assetTag})` : ""} for network device "${device.name}"`,
      targetType: "asset",
      targetId: asset.id,
      targetLabel: asset.name,
    },
    tx,
  );
  return asset;
}

/** Carry out a plan inside the device's own transaction. */
export async function applyAssetPlan(tx: DbClient, audit: AuditContext, deviceId: string, plan: Plan) {
  if (plan.type === "keep") return;
  const device = await tx.infraDevice.findUniqueOrThrow({
    where: { id: deviceId },
    include: { asset: { select: { id: true, name: true, assetTag: true, status: true } } },
  });
  let assetId: string | null = null;
  let label: string | null = null;
  if (plan.type === "link") {
    assetId = plan.assetId;
    label = plan.label;
  } else if (plan.type === "create") {
    const asset = await createAssetFor(tx, audit, deviceId, plan.categoryId, plan.assetTag);
    assetId = asset.id;
    label = assetLabel(asset);
  }
  if ((device.assetId ?? null) === assetId) return;
  await tx.infraDevice.update({ where: { id: deviceId }, data: { assetId } });
  // A linked asset is installed: In use. One that comes off its device and
  // was only In use because of it goes back to Available. Assigned, under
  // repair and the rest are left as they are.
  if (assetId && plan.type === "link") {
    await tx.asset.updateMany({ where: { id: assetId, status: "AVAILABLE" }, data: { status: "IN_USE" } });
  }
  if (device.asset && device.asset.id !== assetId && device.asset.status === "IN_USE") {
    await tx.asset.update({ where: { id: device.asset.id }, data: { status: "AVAILABLE" } });
  }
  await recordAudit(
    { ...audit, companyId: device.companyId },
    {
      module: MODULE,
      eventType: assetId ? "device.asset_linked" : "device.asset_unlinked",
      action: assetId ? `Linked "${device.name}" to asset ${label}` : `Unlinked "${device.name}" from asset ${assetLabel(device.asset!)}`,
      targetType: "infra_device",
      targetId: deviceId,
      targetLabel: device.name,
      fieldChanges: [{ field: "asset", previousValue: device.asset ? assetLabel(device.asset) : null, newValue: label }],
    },
    tx,
  );
}

// ---------------------------------------------------------------------------
// Linking many devices at once
// ---------------------------------------------------------------------------

export interface AssetLinkRow {
  deviceId: string;
  deviceName: string;
  companyName: string;
  serialNumber: string | null;
  action: "link" | "create" | "skip";
  /** The asset found, for "link". */
  assetId: string | null;
  assetLabel: string | null;
  /** Why it is linked to that asset, or skipped. */
  reason: string;
}

/**
 * For every device of the register without an asset: the unlinked asset of
 * the same company with the same serial number, else the same name; else a
 * new asset when a category is given. Nothing is written.
 */
export async function planAssetLinks(companyIds: string[] | null, kind: DeviceKind, createMissing: boolean): Promise<AssetLinkRow[]> {
  const devices = await db.infraDevice.findMany({
    where: { deletedAt: null, kind, assetId: null, ...(companyIds ? { companyId: { in: companyIds } } : {}) },
    orderBy: { name: "asc" },
    select: { id: true, name: true, serialNumber: true, companyId: true, company: { select: { name: true } } },
  });
  if (devices.length === 0) return [];
  const assets = await db.asset.findMany({
    where: { deletedAt: null, companyId: { in: [...new Set(devices.map((d) => d.companyId))] } },
    select: { id: true, name: true, assetTag: true, serialNumber: true, companyId: true, status: true, infraDevice: { select: { name: true } } },
  });
  const key = (companyId: string, value: string) => `${companyId}|${value.trim().toLowerCase()}`;
  const bySerial = new Map<string, (typeof assets)[number]>();
  const byName = new Map<string, (typeof assets)[number]>();
  for (const asset of assets) {
    if (asset.serialNumber) bySerial.set(key(asset.companyId, asset.serialNumber), asset);
    byName.set(key(asset.companyId, asset.name), asset);
  }

  const claimed = new Set<string>();
  const newSerials = new Set<string>();
  return devices.map((device): AssetLinkRow => {
    const base = {
      deviceId: device.id, deviceName: device.name, companyName: device.company.name, serialNumber: device.serialNumber, assetId: null,
    };
    const serialMatch = device.serialNumber ? bySerial.get(key(device.companyId, device.serialNumber)) : undefined;
    const nameMatch = byName.get(key(device.companyId, device.name));
    for (const [match, how] of [[serialMatch, "same serial number"], [nameMatch, "same name"]] as const) {
      if (!match) continue;
      if (match.infraDevice) {
        return { ...base, action: "skip", assetLabel: assetLabel(match), reason: `Asset with the ${how} is already linked to "${match.infraDevice.name}".` };
      }
      if (match.status === "DISCARDED") {
        return { ...base, action: "skip", assetLabel: assetLabel(match), reason: `Asset with the ${how} has been discarded.` };
      }
      if (claimed.has(match.id)) {
        return { ...base, action: "skip", assetLabel: assetLabel(match), reason: `Another device here matches the same asset.` };
      }
      claimed.add(match.id);
      return { ...base, action: "link", assetId: match.id, assetLabel: assetLabel(match), reason: how === "same serial number" ? "Same serial number" : "Same name" };
    }
    if (!createMissing) return { ...base, action: "skip", assetLabel: null, reason: "No matching asset." };
    if (device.serialNumber) {
      const serial = key(device.companyId, device.serialNumber);
      if (newSerials.has(serial)) {
        return { ...base, action: "skip", assetLabel: null, reason: "Another device here has the same serial number." };
      }
      newSerials.add(serial);
    }
    return { ...base, action: "create", assetLabel: null, reason: "No matching asset: a new one is created." };
  });
}

/** Link (and create) as planned, in one transaction. */
export async function commitAssetLinks(
  audit: AuditContext,
  companyIds: string[] | null,
  kind: DeviceKind,
  categoryId: string | null,
) {
  if (categoryId) {
    const category = await db.assetCategory.findFirst({ where: { id: categoryId, deletedAt: null, isActive: true } });
    if (!category) throw new BusinessRuleError("Choose an active asset category.");
  }
  const rows = await planAssetLinks(companyIds, kind, !!categoryId);
  let linked = 0;
  let created = 0;
  await db.$transaction(
    async (tx) => {
      for (const row of rows) {
        if (row.action === "skip") continue;
        if (row.action === "create") {
          await applyAssetPlan(tx, audit, row.deviceId, { type: "create", categoryId: categoryId!, assetTag: null });
          created += 1;
          continue;
        }
        await applyAssetPlan(tx, audit, row.deviceId, { type: "link", assetId: row.assetId!, label: row.assetLabel! });
        linked += 1;
      }
    },
    { timeout: 120_000 },
  );
  return { linked, created, skipped: rows.filter((row) => row.action === "skip").length };
}
