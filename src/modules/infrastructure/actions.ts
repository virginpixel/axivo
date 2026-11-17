"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/shared/db";
import { requirePermission, type ActionContext } from "@/shared/auth/guard";
import { recordAudit } from "@/shared/audit/audit";
import { ok, toActionError, AuthorizationError, BusinessRuleError, ValidationError, type ActionResult } from "@/shared/errors";
import { parseInput as parse, uuidSchema, optionalText } from "@/shared/validation/common";
import * as service from "./service";
import * as vault from "./vault";
import { previewImport, commitImport, type ImportPreview, type ImportResult } from "./import";
import * as topology from "./topology";
import type { LinkImportPreview, LinkImportResult } from "./topology";
import * as backups from "./config-backup";
import { planAssetLinks, commitAssetLinks, type AssetLinkRow } from "./asset-link";
import {
  deviceSchema, deviceTypeSchema, credentialSetSchema, credentialLinkSchema, linkSchema, assetLinkRunSchema,
  backupSettingsSchema, DEVICE_STATUSES, DEVICE_KINDS, type DeviceInput,
} from "./validators";

/** Infrastructure register and credential vault server actions (SDS Doc 24). */

function scopeOf(context: ActionContext): service.Scope {
  return {
    audit: context.audit,
    companyId: context.user.companyId,
    isGlobalAdmin: context.user.systemRoleKey === "SYSTEM_ADMINISTRATOR",
  };
}

function revalidateInfrastructure() {
  revalidatePath("/infrastructure", "layout");
}

// ---------------------------------------------------------------------------
// Devices
// ---------------------------------------------------------------------------

/** Creating an asset is an asset-register change, so it needs that right too. */
function assertAssetRights(context: ActionContext, input: DeviceInput) {
  if (input.assetMode === "create" && !context.user.permissions.has("assets.manage")) {
    throw new AuthorizationError("Creating an asset needs the right to manage assets.");
  }
}

export async function createDeviceAction(raw: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const context = await requirePermission("infrastructure.manage");
    const input = parse(deviceSchema, raw);
    assertAssetRights(context, input);
    const device = await service.createDevice(scopeOf(context), input);
    revalidateInfrastructure();
    return ok({ id: device.id });
  } catch (error) {
    return toActionError(error);
  }
}

export async function updateDeviceAction(id: string, raw: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const context = await requirePermission("infrastructure.manage");
    const input = parse(deviceSchema, raw);
    assertAssetRights(context, input);
    const device = await service.updateDevice(scopeOf(context), parse(uuidSchema, id), input);
    revalidateInfrastructure();
    return ok({ id: device.id });
  } catch (error) {
    return toActionError(error);
  }
}

export async function setDeviceStatusAction(id: string, status: unknown): Promise<ActionResult<undefined>> {
  try {
    const context = await requirePermission("infrastructure.manage");
    await service.setDeviceStatus(scopeOf(context), parse(uuidSchema, id), parse(z.enum(DEVICE_STATUSES), status));
    revalidateInfrastructure();
    return ok(undefined);
  } catch (error) {
    return toActionError(error);
  }
}

export async function deleteDeviceAction(id: string): Promise<ActionResult<undefined>> {
  try {
    const context = await requirePermission("infrastructure.manage");
    await service.deleteDevice(scopeOf(context), parse(uuidSchema, id));
    revalidateInfrastructure();
    return ok(undefined);
  } catch (error) {
    return toActionError(error);
  }
}

/**
 * Add a manufacturer from the device dialog. Returns the id, unlike the asset
 * pickers which store the name. Open to whoever can manage devices, so an IT
 * Administrator without Settings access is not stuck on an unknown brand.
 */
export async function quickCreateManufacturerIdAction(name: string): Promise<ActionResult<{ value: string; label: string }>> {
  try {
    const { audit } = await requirePermission("infrastructure.manage", "settings.manage");
    const trimmed = String(name ?? "").trim().slice(0, 200);
    if (!trimmed) throw new BusinessRuleError("Enter a name.");
    const existing = await db.manufacturer.findFirst({ where: { name: { equals: trimmed, mode: "insensitive" }, deletedAt: null } });
    const item = existing ?? (await db.manufacturer.create({ data: { name: trimmed } }));
    if (!existing) {
      await recordAudit(audit, {
        module: "settings", eventType: "manufacturer.created", action: `Added manufacturer "${trimmed}"`,
        targetType: "manufacturer", targetId: item.id, targetLabel: trimmed,
      });
    }
    revalidatePath("/settings");
    return ok({ value: item.id, label: item.name });
  } catch (error) {
    return toActionError(error);
  }
}

// ---------------------------------------------------------------------------
// Device types (Settings)
// ---------------------------------------------------------------------------

export async function createDeviceTypeAction(raw: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const { audit } = await requirePermission("settings.manage");
    const type = await service.createDeviceType(audit, parse(deviceTypeSchema, raw));
    revalidatePath("/settings");
    revalidateInfrastructure();
    return ok({ id: type.id });
  } catch (error) {
    return toActionError(error);
  }
}

export async function updateDeviceTypeAction(id: string, raw: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const { audit } = await requirePermission("settings.manage");
    const type = await service.updateDeviceType(audit, parse(uuidSchema, id), parse(deviceTypeSchema, raw));
    revalidatePath("/settings");
    revalidateInfrastructure();
    return ok({ id: type.id });
  } catch (error) {
    return toActionError(error);
  }
}

export async function setDeviceTypeActiveAction(id: string, isActive: boolean): Promise<ActionResult<undefined>> {
  try {
    const { audit } = await requirePermission("settings.manage");
    await service.setDeviceTypeActive(audit, parse(uuidSchema, id), parse(z.boolean(), isActive));
    revalidatePath("/settings");
    return ok(undefined);
  } catch (error) {
    return toActionError(error);
  }
}

export async function deleteDeviceTypeAction(id: string): Promise<ActionResult<undefined>> {
  try {
    const { audit } = await requirePermission("settings.manage");
    await service.deleteDeviceType(audit, parse(uuidSchema, id));
    revalidatePath("/settings");
    return ok(undefined);
  } catch (error) {
    return toActionError(error);
  }
}

// ---------------------------------------------------------------------------
// Credential vault
// ---------------------------------------------------------------------------

export async function createCredentialSetAction(raw: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const context = await requirePermission("infrastructure.credentials.manage");
    const set = await vault.createCredentialSet(scopeOf(context), parse(credentialSetSchema, raw));
    revalidateInfrastructure();
    return ok({ id: set.id });
  } catch (error) {
    return toActionError(error);
  }
}

export async function updateCredentialSetAction(id: string, raw: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const context = await requirePermission("infrastructure.credentials.manage");
    const set = await vault.updateCredentialSet(scopeOf(context), parse(uuidSchema, id), parse(credentialSetSchema, raw));
    revalidateInfrastructure();
    return ok({ id: set.id });
  } catch (error) {
    return toActionError(error);
  }
}

export async function deleteCredentialSetAction(id: string): Promise<ActionResult<undefined>> {
  try {
    const context = await requirePermission("infrastructure.credentials.manage");
    await vault.deleteCredentialSet(scopeOf(context), parse(uuidSchema, id));
    revalidateInfrastructure();
    return ok(undefined);
  } catch (error) {
    return toActionError(error);
  }
}

/** The one path by which a stored password leaves the server. Audited. */
export async function revealPasswordAction(id: string): Promise<ActionResult<{ password: string }>> {
  try {
    const context = await requirePermission("infrastructure.credentials.reveal");
    const password = await vault.revealPassword(scopeOf(context), parse(uuidSchema, id));
    return ok({ password });
  } catch (error) {
    return toActionError(error);
  }
}

export async function linkCredentialAction(raw: unknown): Promise<ActionResult<undefined>> {
  try {
    const context = await requirePermission("infrastructure.credentials.manage");
    await vault.linkCredential(scopeOf(context), parse(credentialLinkSchema, raw));
    revalidateInfrastructure();
    return ok(undefined);
  } catch (error) {
    return toActionError(error);
  }
}

const bulkLinkSchema = z
  .object({
    credentialSetId: uuidSchema,
    deviceIds: z.array(uuidSchema).min(1, "Select at least one device.").max(1000),
    purpose: optionalText(100),
  })
  .strict();

export async function linkCredentialToDevicesAction(raw: unknown): Promise<ActionResult<{ linked: number }>> {
  try {
    const context = await requirePermission("infrastructure.credentials.manage");
    const input = parse(bulkLinkSchema, raw);
    const linked = await vault.linkCredentialToDevices(scopeOf(context), input.credentialSetId, input.deviceIds, input.purpose);
    revalidateInfrastructure();
    return ok({ linked });
  } catch (error) {
    return toActionError(error);
  }
}

export async function unlinkCredentialAction(linkId: string): Promise<ActionResult<undefined>> {
  try {
    const context = await requirePermission("infrastructure.credentials.manage");
    await vault.unlinkCredential(scopeOf(context), parse(uuidSchema, linkId));
    revalidateInfrastructure();
    return ok(undefined);
  } catch (error) {
    return toActionError(error);
  }
}

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

const kindSchema = z.enum(DEVICE_KINDS);

const importOptionsSchema = z
  .object({
    kind: kindSchema,
    companyMap: z.record(z.string(), z.union([uuidSchema, z.literal("")])),
    typeMap: z.record(z.string(), z.union([uuidSchema, z.literal("")])),
    existing: z.enum(["update", "skip"]),
    importLogins: z.boolean(),
    excludedRows: z.array(z.number().int().positive()).max(5000),
  })
  .strict();

function fileFrom(formData: FormData): File {
  const file = formData.get("file");
  if (!(file instanceof File)) throw new ValidationError(undefined, { file: "Choose a file to import." });
  return file;
}

export async function previewImportAction(formData: FormData): Promise<ActionResult<ImportPreview>> {
  try {
    const context = await requirePermission("infrastructure.manage");
    const kind = parse(kindSchema, formData.get("kind"));
    return ok(await previewImport(scopeOf(context), kind, fileFrom(formData)));
  } catch (error) {
    return toActionError(error);
  }
}

export async function commitImportAction(formData: FormData): Promise<ActionResult<ImportResult>> {
  try {
    const context = await requirePermission("infrastructure.manage");
    let rawOptions: unknown;
    try {
      rawOptions = JSON.parse(String(formData.get("options") ?? "{}"));
    } catch {
      throw new ValidationError("The import options could not be read.");
    }
    const options = parse(importOptionsSchema, rawOptions);
    // Logins go into the vault, so importing them needs the vault permission too.
    if (options.importLogins && !context.user.permissions.has("infrastructure.credentials.manage")) {
      throw new BusinessRuleError("Importing logins needs the permission to manage credential sets. Untick it, or ask an administrator.");
    }
    const result = await commitImport(scopeOf(context), fileFrom(formData), options);
    revalidateInfrastructure();
    return ok(result);
  } catch (error) {
    return toActionError(error);
  }
}

// ---------------------------------------------------------------------------
// Connections (topology)
// ---------------------------------------------------------------------------

export async function createLinkAction(raw: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const context = await requirePermission("infrastructure.manage");
    const link = await topology.createLink(scopeOf(context), parse(linkSchema, raw));
    revalidateInfrastructure();
    return ok({ id: link.id });
  } catch (error) {
    return toActionError(error);
  }
}

export async function updateLinkAction(id: string, raw: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const context = await requirePermission("infrastructure.manage");
    const link = await topology.updateLink(scopeOf(context), parse(uuidSchema, id), parse(linkSchema, raw));
    revalidateInfrastructure();
    return ok({ id: link.id });
  } catch (error) {
    return toActionError(error);
  }
}

export async function deleteLinkAction(id: string): Promise<ActionResult<undefined>> {
  try {
    const context = await requirePermission("infrastructure.manage");
    await topology.deleteLink(scopeOf(context), parse(uuidSchema, id));
    revalidateInfrastructure();
    return ok(undefined);
  } catch (error) {
    return toActionError(error);
  }
}

export async function previewLinkImportAction(formData: FormData): Promise<ActionResult<LinkImportPreview>> {
  try {
    const context = await requirePermission("infrastructure.manage");
    return ok(await topology.previewLinkImport(scopeOf(context), fileFrom(formData)));
  } catch (error) {
    return toActionError(error);
  }
}

export async function commitLinkImportAction(formData: FormData): Promise<ActionResult<LinkImportResult>> {
  try {
    const context = await requirePermission("infrastructure.manage");
    const removeStale = formData.get("removeStale") === "true";
    const result = await topology.commitLinkImport(scopeOf(context), fileFrom(formData), { removeStale });
    revalidateInfrastructure();
    return ok(result);
  } catch (error) {
    return toActionError(error);
  }
}

// ---------------------------------------------------------------------------
// Assets
// ---------------------------------------------------------------------------

function assetScope(context: ActionContext): string[] | null {
  return context.user.systemRoleKey === "SYSTEM_ADMINISTRATOR" ? null : [context.user.companyId];
}

export async function previewAssetLinksAction(raw: unknown): Promise<ActionResult<AssetLinkRow[]>> {
  try {
    const context = await requirePermission("infrastructure.manage");
    const input = parse(assetLinkRunSchema, raw);
    return ok(await planAssetLinks(assetScope(context), input.kind, !!input.categoryId));
  } catch (error) {
    return toActionError(error);
  }
}

export async function commitAssetLinksAction(
  raw: unknown,
): Promise<ActionResult<{ linked: number; created: number; skipped: number }>> {
  try {
    const context = await requirePermission("infrastructure.manage");
    const input = parse(assetLinkRunSchema, raw);
    if (input.categoryId && !context.user.permissions.has("assets.manage")) {
      throw new AuthorizationError("Creating assets needs the right to manage assets.");
    }
    const result = await commitAssetLinks(context.audit, assetScope(context), input.kind, input.categoryId);
    revalidateInfrastructure();
    revalidatePath("/assets", "layout");
    return ok(result);
  } catch (error) {
    return toActionError(error);
  }
}

// ---------------------------------------------------------------------------
// Configuration backups
// ---------------------------------------------------------------------------

export async function requestConfigBackupAction(deviceId?: string): Promise<ActionResult<undefined>> {
  try {
    const context = await requirePermission("infrastructure.manage");
    await backups.requestBackup(scopeOf(context), deviceId ? [parse(uuidSchema, deviceId)] : undefined);
    return ok(undefined);
  } catch (error) {
    return toActionError(error);
  }
}

export async function setBackupIncludedAction(deviceId: string, included: boolean): Promise<ActionResult<undefined>> {
  try {
    const context = await requirePermission("infrastructure.manage");
    await backups.setBackupIncluded(scopeOf(context), parse(uuidSchema, deviceId), parse(z.boolean(), included));
    revalidateInfrastructure();
    return ok(undefined);
  } catch (error) {
    return toActionError(error);
  }
}

export async function saveBackupSettingsAction(raw: unknown): Promise<ActionResult<undefined>> {
  try {
    // The schedule is one for every company.
    const context = await requirePermission("settings.manage");
    await backups.saveBackupSettings(scopeOf(context), parse(backupSettingsSchema, raw));
    revalidateInfrastructure();
    return ok(undefined);
  } catch (error) {
    return toActionError(error);
  }
}
