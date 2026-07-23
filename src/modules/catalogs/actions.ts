"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/shared/db";
import { requirePermission } from "@/shared/auth/guard";
import { recordAudit } from "@/shared/audit/audit";
import { ok, toActionError, BusinessRuleError, type ActionResult } from "@/shared/errors";
import { parseInput as parse } from "@/shared/validation/common";
import { getSetting, setSetting, SETTING_KEYS } from "@/shared/settings/settings";

/**
 * Asset reference catalogs (SDS Doc 11): manufacturers, vendors, asset models,
 * custom fields and fieldsets. Managed under Settings; each is a first-class
 * entity so pages can drill into "all assets of this manufacturer/model", etc.
 * All mutations require settings.manage.
 */

function revalidateCatalogs(): void {
  revalidatePath("/settings", "layout");
  revalidatePath("/assets", "layout");
  revalidatePath("/contracts", "layout");
}

// ---------------------------------------------------------------------------
// Manufacturers
// ---------------------------------------------------------------------------

const manufacturerSchema = z.object({ name: z.string().trim().min(1, "Name is required.").max(200) }).strict();

export async function createManufacturerAction(raw: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const { audit } = await requirePermission("settings.manage");
    const input = parse(manufacturerSchema, raw);
    const duplicate = await db.manufacturer.findFirst({
      where: { name: { equals: input.name, mode: "insensitive" }, deletedAt: null },
    });
    if (duplicate) throw new BusinessRuleError("A manufacturer with this name already exists.");
    const item = await db.manufacturer.create({ data: { name: input.name } });
    await recordAudit(audit, {
      module: "settings", eventType: "manufacturer.created",
      action: `Added manufacturer "${input.name}"`, targetType: "manufacturer", targetId: item.id, targetLabel: input.name,
    });
    revalidateCatalogs();
    return ok({ id: item.id });
  } catch (error) {
    return toActionError(error);
  }
}

export async function updateManufacturerAction(id: string, raw: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const { audit } = await requirePermission("settings.manage");
    const input = parse(manufacturerSchema, raw);
    const existing = await db.manufacturer.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw new BusinessRuleError("Manufacturer not found.");
    const duplicate = await db.manufacturer.findFirst({
      where: { id: { not: id }, name: { equals: input.name, mode: "insensitive" }, deletedAt: null },
    });
    if (duplicate) throw new BusinessRuleError("A manufacturer with this name already exists.");
    // Keep asset rows (which store the manufacturer by name) in sync on rename.
    if (existing.name !== input.name) {
      await db.asset.updateMany({ where: { manufacturer: existing.name }, data: { manufacturer: input.name } });
    }
    await db.manufacturer.update({ where: { id }, data: { name: input.name } });
    await recordAudit(audit, {
      module: "settings", eventType: "manufacturer.updated",
      action: `Renamed manufacturer to "${input.name}"`, targetType: "manufacturer", targetId: id, targetLabel: input.name,
    });
    revalidateCatalogs();
    return ok({ id });
  } catch (error) {
    return toActionError(error);
  }
}

export async function setManufacturerActiveAction(id: string, isActive: boolean): Promise<ActionResult<undefined>> {
  try {
    const { audit } = await requirePermission("settings.manage");
    const item = await db.manufacturer.findFirst({ where: { id, deletedAt: null } });
    if (!item) throw new BusinessRuleError("Manufacturer not found.");
    await db.manufacturer.update({ where: { id }, data: { isActive } });
    await recordAudit(audit, {
      module: "settings", eventType: isActive ? "manufacturer.enabled" : "manufacturer.disabled",
      action: `${isActive ? "Enabled" : "Disabled"} manufacturer "${item.name}"`, targetType: "manufacturer", targetId: id, targetLabel: item.name,
    });
    revalidateCatalogs();
    return ok(undefined);
  } catch (error) {
    return toActionError(error);
  }
}

// ---------------------------------------------------------------------------
// Vendors (with contact details)
// ---------------------------------------------------------------------------

const vendorSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required.").max(200),
    contactName: z.string().trim().max(200).optional().or(z.literal("").transform(() => undefined)),
    contactPhone: z.string().trim().max(60).optional().or(z.literal("").transform(() => undefined)),
    contactEmail: z.string().trim().max(200).email("Enter a valid email.").optional().or(z.literal("").transform(() => undefined)),
    notes: z.string().trim().max(2000).optional().or(z.literal("").transform(() => undefined)),
  })
  .strict();

export async function createVendorAction(raw: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const { audit } = await requirePermission("settings.manage");
    const input = parse(vendorSchema, raw);
    const duplicate = await db.vendor.findFirst({
      where: { name: { equals: input.name, mode: "insensitive" }, deletedAt: null },
    });
    if (duplicate) throw new BusinessRuleError("A vendor with this name already exists.");
    const item = await db.vendor.create({
      data: {
        name: input.name,
        contactName: input.contactName ?? null,
        contactPhone: input.contactPhone ?? null,
        contactEmail: input.contactEmail ?? null,
        notes: input.notes ?? null,
      },
    });
    await recordAudit(audit, {
      module: "settings", eventType: "vendor.created",
      action: `Added vendor "${input.name}"`, targetType: "vendor", targetId: item.id, targetLabel: input.name,
    });
    revalidateCatalogs();
    return ok({ id: item.id });
  } catch (error) {
    return toActionError(error);
  }
}

export async function updateVendorAction(id: string, raw: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const { audit } = await requirePermission("settings.manage");
    const input = parse(vendorSchema, raw);
    const existing = await db.vendor.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw new BusinessRuleError("Vendor not found.");
    const duplicate = await db.vendor.findFirst({
      where: { id: { not: id }, name: { equals: input.name, mode: "insensitive" }, deletedAt: null },
    });
    if (duplicate) throw new BusinessRuleError("A vendor with this name already exists.");
    // Keep assets and contracts (which store the vendor by name) in sync on rename.
    if (existing.name !== input.name) {
      await db.asset.updateMany({ where: { supplier: existing.name }, data: { supplier: input.name } });
      await db.contract.updateMany({ where: { vendor: existing.name }, data: { vendor: input.name } });
    }
    await db.vendor.update({
      where: { id },
      data: {
        name: input.name,
        contactName: input.contactName ?? null,
        contactPhone: input.contactPhone ?? null,
        contactEmail: input.contactEmail ?? null,
        notes: input.notes ?? null,
      },
    });
    await recordAudit(audit, {
      module: "settings", eventType: "vendor.updated",
      action: `Updated vendor "${input.name}"`, targetType: "vendor", targetId: id, targetLabel: input.name,
    });
    revalidateCatalogs();
    return ok({ id });
  } catch (error) {
    return toActionError(error);
  }
}

const VENDOR_IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "webp", "svg"];

export async function uploadVendorLogoAction(vendorId: string, formData: FormData): Promise<ActionResult<undefined>> {
  try {
    const { audit } = await requirePermission("settings.manage");
    const vendor = await db.vendor.findFirst({ where: { id: vendorId, deletedAt: null } });
    if (!vendor) throw new BusinessRuleError("Vendor not found.");
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) throw new BusinessRuleError("Choose a logo (PNG, JPG, SVG or WEBP).");
    const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
    if (!VENDOR_IMAGE_EXTENSIONS.includes(extension)) throw new BusinessRuleError("Logos must be PNG, JPG, SVG or WEBP.");
    if (file.size > 2 * 1024 * 1024) throw new BusinessRuleError("Logo must be 2 MB or smaller.");
    const { storage } = await import("@/shared/storage/storage");
    const stored = await storage.save(Buffer.from(await file.arrayBuffer()), extension, "vendors");
    if (vendor.logoPath) await storage.delete(vendor.logoPath).catch(() => undefined);
    await db.vendor.update({ where: { id: vendorId }, data: { logoPath: stored.storageKey } });
    await recordAudit(audit, { module: "settings", eventType: "vendor.logo_set", action: `Set logo for vendor "${vendor.name}"`, targetType: "vendor", targetId: vendorId, targetLabel: vendor.name });
    revalidateCatalogs();
    return ok(undefined);
  } catch (error) {
    return toActionError(error);
  }
}

export async function removeVendorLogoAction(vendorId: string): Promise<ActionResult<undefined>> {
  try {
    const { audit } = await requirePermission("settings.manage");
    const vendor = await db.vendor.findFirst({ where: { id: vendorId, deletedAt: null } });
    if (!vendor) throw new BusinessRuleError("Vendor not found.");
    if (vendor.logoPath) {
      const { storage } = await import("@/shared/storage/storage");
      await storage.delete(vendor.logoPath).catch(() => undefined);
    }
    await db.vendor.update({ where: { id: vendorId }, data: { logoPath: null } });
    await recordAudit(audit, { module: "settings", eventType: "vendor.logo_removed", action: `Removed logo from vendor "${vendor.name}"`, targetType: "vendor", targetId: vendorId, targetLabel: vendor.name });
    revalidateCatalogs();
    return ok(undefined);
  } catch (error) {
    return toActionError(error);
  }
}

export async function setVendorActiveAction(id: string, isActive: boolean): Promise<ActionResult<undefined>> {
  try {
    const { audit } = await requirePermission("settings.manage");
    const item = await db.vendor.findFirst({ where: { id, deletedAt: null } });
    if (!item) throw new BusinessRuleError("Vendor not found.");
    await db.vendor.update({ where: { id }, data: { isActive } });
    await recordAudit(audit, {
      module: "settings", eventType: isActive ? "vendor.enabled" : "vendor.disabled",
      action: `${isActive ? "Enabled" : "Disabled"} vendor "${item.name}"`, targetType: "vendor", targetId: id, targetLabel: item.name,
    });
    revalidateCatalogs();
    return ok(undefined);
  } catch (error) {
    return toActionError(error);
  }
}

// ---------------------------------------------------------------------------
// Asset models (name + manufacturer + optional fieldset + image)
// ---------------------------------------------------------------------------

const assetModelSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required.").max(200),
    manufacturerId: z.string().uuid().optional().or(z.literal("").transform(() => undefined)),
    fieldSetId: z.string().uuid().optional().or(z.literal("").transform(() => undefined)),
    notes: z.string().trim().max(2000).optional().or(z.literal("").transform(() => undefined)),
  })
  .strict();

export async function createAssetModelAction(raw: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const { audit } = await requirePermission("settings.manage");
    const input = parse(assetModelSchema, raw);
    const item = await db.assetModel.create({
      data: {
        name: input.name,
        manufacturerId: input.manufacturerId ?? null,
        fieldSetId: input.fieldSetId ?? null,
        notes: input.notes ?? null,
      },
    });
    await recordAudit(audit, {
      module: "settings", eventType: "asset_model.created",
      action: `Added asset model "${input.name}"`, targetType: "asset_model", targetId: item.id, targetLabel: input.name,
    });
    revalidateCatalogs();
    return ok({ id: item.id });
  } catch (error) {
    return toActionError(error);
  }
}

export async function updateAssetModelAction(id: string, raw: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const { audit } = await requirePermission("settings.manage");
    const input = parse(assetModelSchema, raw);
    const existing = await db.assetModel.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw new BusinessRuleError("Asset model not found.");
    if (existing.name !== input.name) {
      await db.asset.updateMany({ where: { model: existing.name }, data: { model: input.name } });
    }
    await db.assetModel.update({
      where: { id },
      data: {
        name: input.name,
        manufacturerId: input.manufacturerId ?? null,
        fieldSetId: input.fieldSetId ?? null,
        notes: input.notes ?? null,
      },
    });
    await recordAudit(audit, {
      module: "settings", eventType: "asset_model.updated",
      action: `Updated asset model "${input.name}"`, targetType: "asset_model", targetId: id, targetLabel: input.name,
    });
    revalidateCatalogs();
    return ok({ id });
  } catch (error) {
    return toActionError(error);
  }
}

export async function setAssetModelActiveAction(id: string, isActive: boolean): Promise<ActionResult<undefined>> {
  try {
    const { audit } = await requirePermission("settings.manage");
    const item = await db.assetModel.findFirst({ where: { id, deletedAt: null } });
    if (!item) throw new BusinessRuleError("Asset model not found.");
    await db.assetModel.update({ where: { id }, data: { isActive } });
    await recordAudit(audit, {
      module: "settings", eventType: isActive ? "asset_model.enabled" : "asset_model.disabled",
      action: `${isActive ? "Enabled" : "Disabled"} asset model "${item.name}"`, targetType: "asset_model", targetId: id, targetLabel: item.name,
    });
    revalidateCatalogs();
    return ok(undefined);
  } catch (error) {
    return toActionError(error);
  }
}

const IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "webp"];

export async function uploadAssetModelImageAction(modelId: string, formData: FormData): Promise<ActionResult<undefined>> {
  try {
    const { audit } = await requirePermission("settings.manage");
    const model = await db.assetModel.findFirst({ where: { id: modelId, deletedAt: null } });
    if (!model) throw new BusinessRuleError("Asset model not found.");
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) throw new BusinessRuleError("Choose an image (PNG, JPG or WEBP).");
    const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
    if (!IMAGE_EXTENSIONS.includes(extension)) throw new BusinessRuleError("Images must be PNG, JPG or WEBP.");
    if (file.size > 5 * 1024 * 1024) throw new BusinessRuleError("Image must be 5 MB or smaller.");
    const { storage } = await import("@/shared/storage/storage");
    const stored = await storage.save(Buffer.from(await file.arrayBuffer()), extension, "models");
    if (model.imagePath) await storage.delete(model.imagePath).catch(() => undefined);
    await db.assetModel.update({ where: { id: modelId }, data: { imagePath: stored.storageKey } });
    await recordAudit(audit, {
      module: "settings", eventType: "asset_model.image_set",
      action: `Set image for asset model "${model.name}"`, targetType: "asset_model", targetId: modelId, targetLabel: model.name,
    });
    revalidateCatalogs();
    return ok(undefined);
  } catch (error) {
    return toActionError(error);
  }
}

export async function removeAssetModelImageAction(modelId: string): Promise<ActionResult<undefined>> {
  try {
    const { audit } = await requirePermission("settings.manage");
    const model = await db.assetModel.findFirst({ where: { id: modelId, deletedAt: null } });
    if (!model) throw new BusinessRuleError("Asset model not found.");
    if (model.imagePath) {
      const { storage } = await import("@/shared/storage/storage");
      await storage.delete(model.imagePath).catch(() => undefined);
    }
    await db.assetModel.update({ where: { id: modelId }, data: { imagePath: null } });
    await recordAudit(audit, {
      module: "settings", eventType: "asset_model.image_removed",
      action: `Removed image from asset model "${model.name}"`, targetType: "asset_model", targetId: modelId, targetLabel: model.name,
    });
    revalidateCatalogs();
    return ok(undefined);
  } catch (error) {
    return toActionError(error);
  }
}

// ---------------------------------------------------------------------------
// Custom fields
// ---------------------------------------------------------------------------

const CUSTOM_FIELD_FORMATS = ["TEXT", "NUMBER", "MAC_ADDRESS", "IP_ADDRESS", "IMEI", "PHONE", "EMAIL", "URL", "DATE"] as const;

const customFieldSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required.").max(120),
    format: z.enum(CUSTOM_FIELD_FORMATS),
    helpText: z.string().trim().max(300).optional().or(z.literal("").transform(() => undefined)),
  })
  .strict();

export async function createCustomFieldAction(raw: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const { audit } = await requirePermission("settings.manage");
    const input = parse(customFieldSchema, raw);
    const duplicate = await db.customField.findFirst({
      where: { name: { equals: input.name, mode: "insensitive" }, deletedAt: null },
    });
    if (duplicate) throw new BusinessRuleError("A custom field with this name already exists.");
    const item = await db.customField.create({
      data: { name: input.name, format: input.format, helpText: input.helpText ?? null },
    });
    await recordAudit(audit, {
      module: "settings", eventType: "custom_field.created",
      action: `Added custom field "${input.name}"`, targetType: "custom_field", targetId: item.id, targetLabel: input.name,
    });
    revalidateCatalogs();
    return ok({ id: item.id });
  } catch (error) {
    return toActionError(error);
  }
}

export async function updateCustomFieldAction(id: string, raw: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const { audit } = await requirePermission("settings.manage");
    const input = parse(customFieldSchema, raw);
    const existing = await db.customField.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw new BusinessRuleError("Custom field not found.");
    const duplicate = await db.customField.findFirst({
      where: { id: { not: id }, name: { equals: input.name, mode: "insensitive" }, deletedAt: null },
    });
    if (duplicate) throw new BusinessRuleError("A custom field with this name already exists.");
    await db.customField.update({
      where: { id },
      data: { name: input.name, format: input.format, helpText: input.helpText ?? null },
    });
    await recordAudit(audit, {
      module: "settings", eventType: "custom_field.updated",
      action: `Updated custom field "${input.name}"`, targetType: "custom_field", targetId: id, targetLabel: input.name,
    });
    revalidateCatalogs();
    return ok({ id });
  } catch (error) {
    return toActionError(error);
  }
}

export async function setCustomFieldActiveAction(id: string, isActive: boolean): Promise<ActionResult<undefined>> {
  try {
    const { audit } = await requirePermission("settings.manage");
    const item = await db.customField.findFirst({ where: { id, deletedAt: null } });
    if (!item) throw new BusinessRuleError("Custom field not found.");
    await db.customField.update({ where: { id }, data: { isActive } });
    await recordAudit(audit, {
      module: "settings", eventType: isActive ? "custom_field.enabled" : "custom_field.disabled",
      action: `${isActive ? "Enabled" : "Disabled"} custom field "${item.name}"`, targetType: "custom_field", targetId: id, targetLabel: item.name,
    });
    revalidateCatalogs();
    return ok(undefined);
  } catch (error) {
    return toActionError(error);
  }
}

// ---------------------------------------------------------------------------
// Fieldsets (name + ordered custom fields)
// ---------------------------------------------------------------------------

const fieldSetSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required.").max(120),
    fields: z
      .array(z.object({ customFieldId: z.string().uuid(), required: z.boolean() }))
      .max(50),
  })
  .strict();

export async function saveFieldSetAction(raw: unknown, fieldSetId?: string): Promise<ActionResult<{ id: string }>> {
  try {
    const { audit } = await requirePermission("settings.manage");
    const input = parse(fieldSetSchema, raw);
    const duplicate = await db.fieldSet.findFirst({
      where: { name: { equals: input.name, mode: "insensitive" }, deletedAt: null, ...(fieldSetId ? { id: { not: fieldSetId } } : {}) },
    });
    if (duplicate) throw new BusinessRuleError("A fieldset with this name already exists.");
    // Deduplicate custom fields within the set, preserving order.
    const seen = new Set<string>();
    const fields = input.fields.filter((field) => {
      if (seen.has(field.customFieldId)) return false;
      seen.add(field.customFieldId);
      return true;
    });

    const id = await db.$transaction(async (tx) => {
      const set = fieldSetId
        ? await tx.fieldSet.update({ where: { id: fieldSetId }, data: { name: input.name } })
        : await tx.fieldSet.create({ data: { name: input.name } });
      await tx.fieldSetField.deleteMany({ where: { fieldSetId: set.id } });
      if (fields.length > 0) {
        await tx.fieldSetField.createMany({
          data: fields.map((field, index) => ({
            fieldSetId: set.id,
            customFieldId: field.customFieldId,
            required: field.required,
            sortOrder: index,
          })),
        });
      }
      return set.id;
    });
    await recordAudit(audit, {
      module: "settings", eventType: fieldSetId ? "field_set.updated" : "field_set.created",
      action: `${fieldSetId ? "Updated" : "Created"} fieldset "${input.name}"`, targetType: "field_set", targetId: id, targetLabel: input.name,
    });
    revalidateCatalogs();
    return ok({ id });
  } catch (error) {
    return toActionError(error);
  }
}

export async function setFieldSetActiveAction(id: string, isActive: boolean): Promise<ActionResult<undefined>> {
  try {
    const { audit } = await requirePermission("settings.manage");
    const item = await db.fieldSet.findFirst({ where: { id, deletedAt: null } });
    if (!item) throw new BusinessRuleError("Fieldset not found.");
    await db.fieldSet.update({ where: { id }, data: { isActive } });
    await recordAudit(audit, {
      module: "settings", eventType: isActive ? "field_set.enabled" : "field_set.disabled",
      action: `${isActive ? "Enabled" : "Disabled"} fieldset "${item.name}"`, targetType: "field_set", targetId: id, targetLabel: item.name,
    });
    revalidateCatalogs();
    return ok(undefined);
  } catch (error) {
    return toActionError(error);
  }
}

// ---------------------------------------------------------------------------
// Currencies + base (reporting) currency
// ---------------------------------------------------------------------------

const currencySchema = z
  .object({
    code: z.string().trim().min(1, "Code is required.").max(10).transform((value) => value.toUpperCase()),
    name: z.string().trim().min(1, "Name is required.").max(100),
    rateToBase: z.coerce.number().positive("Rate must be greater than zero."),
  })
  .strict();

export async function createCurrencyAction(raw: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const { audit } = await requirePermission("settings.manage");
    const input = parse(currencySchema, raw);
    const duplicate = await db.currency.findFirst({ where: { code: input.code, deletedAt: null } });
    if (duplicate) throw new BusinessRuleError("A currency with this code already exists.");
    const item = await db.currency.create({ data: { code: input.code, name: input.name, rateToBase: input.rateToBase } });
    await recordAudit(audit, {
      module: "settings", eventType: "currency.created",
      action: `Added currency ${input.code}`, targetType: "currency", targetId: item.id, targetLabel: input.code,
    });
    revalidateCatalogs();
    return ok({ id: item.id });
  } catch (error) {
    return toActionError(error);
  }
}

export async function updateCurrencyAction(id: string, raw: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const { audit } = await requirePermission("settings.manage");
    const input = parse(currencySchema, raw);
    const existing = await db.currency.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw new BusinessRuleError("Currency not found.");
    const duplicate = await db.currency.findFirst({ where: { id: { not: id }, code: input.code, deletedAt: null } });
    if (duplicate) throw new BusinessRuleError("A currency with this code already exists.");
    await db.currency.update({ where: { id }, data: { code: input.code, name: input.name, rateToBase: input.rateToBase } });
    await recordAudit(audit, {
      module: "settings", eventType: "currency.updated",
      action: `Updated currency ${input.code}`, targetType: "currency", targetId: id, targetLabel: input.code,
    });
    revalidateCatalogs();
    return ok({ id });
  } catch (error) {
    return toActionError(error);
  }
}

export async function setCurrencyActiveAction(id: string, isActive: boolean): Promise<ActionResult<undefined>> {
  try {
    const { audit } = await requirePermission("settings.manage");
    const item = await db.currency.findFirst({ where: { id, deletedAt: null } });
    if (!item) throw new BusinessRuleError("Currency not found.");
    await db.currency.update({ where: { id }, data: { isActive } });
    await recordAudit(audit, {
      module: "settings", eventType: isActive ? "currency.enabled" : "currency.disabled",
      action: `${isActive ? "Enabled" : "Disabled"} currency ${item.code}`, targetType: "currency", targetId: id, targetLabel: item.code,
    });
    revalidateCatalogs();
    return ok(undefined);
  } catch (error) {
    return toActionError(error);
  }
}

/** Set the base (reporting) currency; its rate to base becomes 1. */
export async function setBaseCurrencyAction(code: string): Promise<ActionResult<undefined>> {
  try {
    const { audit } = await requirePermission("settings.manage");
    const upper = code.trim().toUpperCase();
    const currency = await db.currency.findFirst({ where: { code: upper, deletedAt: null } });
    if (!currency) throw new BusinessRuleError("Select an existing currency as the base.");
    await db.currency.update({ where: { id: currency.id }, data: { rateToBase: 1 } });
    const general = await getSetting<Record<string, unknown>>(SETTING_KEYS.GENERAL);
    await setSetting(audit, {
      key: SETTING_KEYS.GENERAL,
      value: { ...general, defaultCurrency: upper } as never,
      category: "system",
      description: "General settings",
    });
    revalidatePath("/settings", "layout");
    revalidatePath("/contracts", "layout");
    return ok(undefined);
  } catch (error) {
    return toActionError(error);
  }
}

// ---------------------------------------------------------------------------
// Inline quick-create (used by CreatableCombobox). Return {value,label}.
// ---------------------------------------------------------------------------

export async function quickCreateManufacturerAction(name: string): Promise<ActionResult<{ value: string; label: string }>> {
  try {
    const { audit } = await requirePermission("settings.manage");
    const trimmed = name.trim();
    if (!trimmed) throw new BusinessRuleError("Enter a name.");
    const existing = await db.manufacturer.findFirst({ where: { name: { equals: trimmed, mode: "insensitive" }, deletedAt: null } });
    const item = existing ?? (await db.manufacturer.create({ data: { name: trimmed } }));
    if (!existing) {
      await recordAudit(audit, { module: "settings", eventType: "manufacturer.created", action: `Added manufacturer "${trimmed}"`, targetType: "manufacturer", targetId: item.id, targetLabel: trimmed });
    }
    revalidateCatalogs();
    return ok({ value: item.name, label: item.name });
  } catch (error) {
    return toActionError(error);
  }
}

export async function quickCreateVendorAction(name: string): Promise<ActionResult<{ value: string; label: string }>> {
  try {
    const { audit } = await requirePermission("settings.manage");
    const trimmed = name.trim();
    if (!trimmed) throw new BusinessRuleError("Enter a name.");
    const existing = await db.vendor.findFirst({ where: { name: { equals: trimmed, mode: "insensitive" }, deletedAt: null } });
    const item = existing ?? (await db.vendor.create({ data: { name: trimmed } }));
    if (!existing) {
      await recordAudit(audit, { module: "settings", eventType: "vendor.created", action: `Added vendor "${trimmed}"`, targetType: "vendor", targetId: item.id, targetLabel: trimmed });
    }
    revalidateCatalogs();
    return ok({ value: item.name, label: item.name });
  } catch (error) {
    return toActionError(error);
  }
}

export async function quickCreateAssetModelAction(name: string): Promise<ActionResult<{ value: string; label: string }>> {
  try {
    const { audit } = await requirePermission("settings.manage");
    const trimmed = name.trim();
    if (!trimmed) throw new BusinessRuleError("Enter a name.");
    const existing = await db.assetModel.findFirst({ where: { name: { equals: trimmed, mode: "insensitive" }, deletedAt: null } });
    const item = existing ?? (await db.assetModel.create({ data: { name: trimmed } }));
    if (!existing) {
      await recordAudit(audit, { module: "settings", eventType: "asset_model.created", action: `Added asset model "${trimmed}"`, targetType: "asset_model", targetId: item.id, targetLabel: trimmed });
    }
    revalidateCatalogs();
    return ok({ value: item.name, label: item.name });
  } catch (error) {
    return toActionError(error);
  }
}

export async function quickCreateCurrencyAction(code: string): Promise<ActionResult<{ value: string; label: string }>> {
  try {
    const { audit } = await requirePermission("settings.manage");
    const upper = code.trim().toUpperCase();
    if (!upper) throw new BusinessRuleError("Enter a currency code.");
    const existing = await db.currency.findFirst({ where: { code: upper, deletedAt: null } });
    const item = existing ?? (await db.currency.create({ data: { code: upper, name: upper, rateToBase: 1 } }));
    if (!existing) {
      await recordAudit(audit, { module: "settings", eventType: "currency.created", action: `Added currency ${upper}`, targetType: "currency", targetId: item.id, targetLabel: upper });
    }
    revalidateCatalogs();
    return ok({ value: item.code, label: `${item.code} - ${item.name}` });
  } catch (error) {
    return toActionError(error);
  }
}

export async function quickCreateContractCategoryAction(name: string): Promise<ActionResult<{ value: string; label: string }>> {
  try {
    const { audit } = await requirePermission("settings.manage");
    const trimmed = name.trim();
    if (!trimmed) throw new BusinessRuleError("Enter a name.");
    const existing = await db.catalogItem.findFirst({ where: { kind: "CONTRACT_CATEGORY", name: { equals: trimmed, mode: "insensitive" }, parentId: null, deletedAt: null } });
    const item = existing ?? (await db.catalogItem.create({ data: { kind: "CONTRACT_CATEGORY", name: trimmed, createdById: audit.actorUserId ?? null } }));
    if (!existing) {
      await recordAudit(audit, { module: "settings", eventType: "catalog.created", action: `Added contract category "${trimmed}"`, targetType: "catalog_item", targetId: item.id, targetLabel: trimmed });
    }
    revalidateCatalogs();
    return ok({ value: item.name, label: item.name });
  } catch (error) {
    return toActionError(error);
  }
}

export async function quickCreateCategoryAction(name: string): Promise<ActionResult<{ value: string; label: string }>> {
  try {
    const { audit } = await requirePermission("assets.manage");
    const trimmed = name.trim();
    if (!trimmed) throw new BusinessRuleError("Enter a name.");
    const existing = await db.assetCategory.findFirst({ where: { name: { equals: trimmed, mode: "insensitive" }, deletedAt: null } });
    const item = existing ?? (await db.assetCategory.create({ data: { name: trimmed } }));
    if (!existing) {
      await recordAudit(audit, { module: "assets", eventType: "asset_category.created", action: `Added asset category "${trimmed}"`, targetType: "asset_category", targetId: item.id, targetLabel: trimmed });
    }
    revalidateCatalogs();
    return ok({ value: item.id, label: item.name });
  } catch (error) {
    return toActionError(error);
  }
}

export async function quickCreateLocationAction(companyId: string, name: string): Promise<ActionResult<{ value: string; label: string }>> {
  try {
    const { audit } = await requirePermission("organization.manage");
    const trimmed = name.trim();
    if (!trimmed) throw new BusinessRuleError("Enter a name.");
    const existing = await db.location.findFirst({ where: { companyId, name: { equals: trimmed, mode: "insensitive" }, deletedAt: null } });
    const item = existing ?? (await db.location.create({ data: { companyId, name: trimmed } }));
    if (!existing) {
      await recordAudit(audit, { module: "organization", eventType: "location.created", action: `Added location "${trimmed}"`, targetType: "location", targetId: item.id, targetLabel: trimmed });
    }
    revalidateCatalogs();
    return ok({ value: item.id, label: item.name });
  } catch (error) {
    return toActionError(error);
  }
}

export async function quickCreateDepartmentAction(companyId: string, name: string): Promise<ActionResult<{ value: string; label: string }>> {
  try {
    const { audit } = await requirePermission("organization.manage");
    const trimmed = name.trim();
    if (!trimmed) throw new BusinessRuleError("Enter a name.");
    const existing = await db.department.findFirst({ where: { companyId, name: { equals: trimmed, mode: "insensitive" }, deletedAt: null } });
    const item = existing ?? (await db.department.create({ data: { companyId, name: trimmed } }));
    if (!existing) {
      await recordAudit(audit, { module: "organization", eventType: "department.created", action: `Added department "${trimmed}"`, targetType: "department", targetId: item.id, targetLabel: trimmed });
    }
    revalidatePath("/people", "layout");
    revalidatePath("/organization", "layout");
    return ok({ value: item.id, label: item.name });
  } catch (error) {
    return toActionError(error);
  }
}

export async function quickCreatePositionAction(companyId: string, name: string): Promise<ActionResult<{ value: string; label: string }>> {
  try {
    const { audit } = await requirePermission("organization.manage");
    const trimmed = name.trim();
    if (!trimmed) throw new BusinessRuleError("Enter a name.");
    const existing = await db.position.findFirst({ where: { companyId, name: { equals: trimmed, mode: "insensitive" }, deletedAt: null } });
    const item = existing ?? (await db.position.create({ data: { companyId, name: trimmed } }));
    if (!existing) {
      await recordAudit(audit, { module: "organization", eventType: "position.created", action: `Added position "${trimmed}"`, targetType: "position", targetId: item.id, targetLabel: trimmed });
    }
    revalidatePath("/people", "layout");
    revalidatePath("/organization", "layout");
    return ok({ value: item.id, label: item.name });
  } catch (error) {
    return toActionError(error);
  }
}
