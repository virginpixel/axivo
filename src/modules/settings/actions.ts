"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/shared/db";
import { requirePermission } from "@/shared/auth/guard";
import { recordAudit } from "@/shared/audit/audit";
import { ok, toActionError, BusinessRuleError, type ActionResult } from "@/shared/errors";
import { parseInput as parse } from "@/shared/validation/common";
import { setSetting, saveSmtpConfig, SETTING_KEYS } from "@/shared/settings/settings";
import { revokeTokensForTarget } from "@/shared/tokens/secure-tokens";

/** System administration actions (SDS Doc 17). All require settings permissions. */

const securitySettingsSchema = z
  .object({
    sessionIdleMinutes: z.coerce.number().int().min(5).max(480),
    sessionAbsoluteHours: z.coerce.number().int().min(1).max(72),
    loginMaxAttempts: z.coerce.number().int().min(3).max(20),
    loginCooldownMinutes: z.coerce.number().int().min(1).max(120),
    tokenExpiryHours: z.coerce.number().int().min(1).max(720),
    credentialSecretExpiryHours: z.coerce.number().int().min(1).max(720),
    publicFormRatePerHour: z.coerce.number().int().min(1).max(1000),
    passwordMinLength: z.coerce.number().int().min(12).max(64),
  })
  .strict();

export async function saveSecuritySettingsAction(raw: unknown): Promise<ActionResult<undefined>> {
  try {
    const { audit } = await requirePermission("settings.security.manage");
    const input = parse(securitySettingsSchema, raw);
    const entries: { key: (typeof SETTING_KEYS)[keyof typeof SETTING_KEYS]; value: unknown }[] = [
      { key: SETTING_KEYS.SESSION_IDLE_MINUTES, value: input.sessionIdleMinutes },
      { key: SETTING_KEYS.SESSION_ABSOLUTE_HOURS, value: input.sessionAbsoluteHours },
      { key: SETTING_KEYS.LOGIN_MAX_ATTEMPTS, value: input.loginMaxAttempts },
      { key: SETTING_KEYS.LOGIN_COOLDOWN_MINUTES, value: input.loginCooldownMinutes },
      { key: SETTING_KEYS.TOKEN_EXPIRY_HOURS, value: input.tokenExpiryHours },
      { key: SETTING_KEYS.CREDENTIAL_SECRET_EXPIRY_HOURS, value: input.credentialSecretExpiryHours },
      { key: SETTING_KEYS.PUBLIC_FORM_RATE_PER_HOUR, value: input.publicFormRatePerHour },
      {
        key: SETTING_KEYS.PASSWORD_POLICY,
        value: {
          // Complexity requirements cannot be reduced below the SDS baseline (Doc 05 Ch4).
          minLength: input.passwordMinLength,
          requireUppercase: true,
          requireLowercase: true,
          requireNumber: true,
          requireSpecial: true,
        },
      },
    ];
    for (const entry of entries) {
      await setSetting(audit, {
        key: entry.key,
        value: entry.value as never,
        category: "security",
      });
    }
    revalidatePath("/settings");
    return ok(undefined);
  } catch (error) {
    return toActionError(error);
  }
}

const smtpSchema = z
  .object({
    host: z.string().trim().min(1, "SMTP server is required.").max(255),
    port: z.coerce.number().int().min(1).max(65535),
    encryption: z.enum(["none", "tls", "ssl"]),
    authMethod: z.enum(["none", "login"]),
    username: z.string().trim().max(255).optional(),
    password: z.string().max(255).optional(),
    senderName: z.string().trim().min(1, "Sender name is required.").max(200),
    senderEmail: z.string().trim().email("Enter a valid sender email.").max(254),
    replyTo: z.string().trim().email("Enter a valid reply-to email.").max(254).optional().or(z.literal("").transform(() => undefined)),
  })
  .strict();

export async function saveSmtpAction(raw: unknown): Promise<ActionResult<undefined>> {
  try {
    const { audit } = await requirePermission("settings.manage");
    const input = parse(smtpSchema, raw);
    await saveSmtpConfig(audit, {
      host: input.host,
      port: input.port,
      encryption: input.encryption,
      authMethod: input.authMethod,
      username: input.username,
      password: input.password || undefined,
      senderName: input.senderName,
      senderEmail: input.senderEmail,
      replyTo: input.replyTo,
    });
    revalidatePath("/settings");
    return ok(undefined);
  } catch (error) {
    return toActionError(error);
  }
}

const brandingSchema = z
  .object({
    systemName: z.string().trim().min(1).max(100),
    primaryColor: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/, "Use a hex color like #1d4ed8."),
    secondaryColor: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/, "Use a hex color like #0f172a."),
  })
  .strict();

export async function saveBrandingAction(raw: unknown): Promise<ActionResult<undefined>> {
  try {
    const { audit } = await requirePermission("settings.manage");
    const input = parse(brandingSchema, raw);
    await setSetting(audit, {
      key: SETTING_KEYS.BRANDING,
      value: input as never,
      category: "branding",
      description: "Global branding",
    });
    revalidatePath("/", "layout");
    return ok(undefined);
  } catch (error) {
    return toActionError(error);
  }
}

const notificationSettingsSchema = z
  .object({
    reminderApprovalHours: z.coerce.number().int().min(0).max(720),
    reminderImplementationHours: z.coerce.number().int().min(0).max(720),
    reminderAckHours: z.coerce.number().int().min(0).max(720),
    notifyRequesterOnRejection: z.boolean(),
    notifyRequesterOnFinalApproval: z.boolean(),
    contractReminderDays: z.array(z.coerce.number().int().min(1).max(365)).min(1).max(10),
    licenseReminderDays: z.array(z.coerce.number().int().min(1).max(365)).min(1).max(10),
  })
  .strict();

export async function saveNotificationSettingsAction(raw: unknown): Promise<ActionResult<undefined>> {
  try {
    const { audit } = await requirePermission("settings.manage");
    const input = parse(notificationSettingsSchema, raw);
    const entries: { key: (typeof SETTING_KEYS)[keyof typeof SETTING_KEYS]; value: unknown }[] = [
      { key: SETTING_KEYS.REMINDER_APPROVAL_HOURS, value: input.reminderApprovalHours },
      { key: SETTING_KEYS.REMINDER_IMPLEMENTATION_HOURS, value: input.reminderImplementationHours },
      { key: SETTING_KEYS.REMINDER_ACK_HOURS, value: input.reminderAckHours },
      { key: SETTING_KEYS.NOTIFY_REQUESTER_ON_REJECTION, value: input.notifyRequesterOnRejection },
      { key: SETTING_KEYS.NOTIFY_REQUESTER_ON_FINAL_APPROVAL, value: input.notifyRequesterOnFinalApproval },
      { key: SETTING_KEYS.CONTRACT_REMINDER_DAYS, value: input.contractReminderDays },
      { key: SETTING_KEYS.LICENSE_REMINDER_DAYS, value: input.licenseReminderDays },
    ];
    for (const entry of entries) {
      await setSetting(audit, { key: entry.key, value: entry.value as never, category: "notifications" });
    }
    revalidatePath("/settings");
    return ok(undefined);
  } catch (error) {
    return toActionError(error);
  }
}

const maintenanceSchema = z
  .object({
    enabled: z.boolean(),
    message: z.string().trim().max(500).default(""),
  })
  .strict();

export async function saveMaintenanceModeAction(raw: unknown): Promise<ActionResult<undefined>> {
  try {
    const { audit } = await requirePermission("settings.manage");
    const input = parse(maintenanceSchema, raw);
    await setSetting(audit, {
      key: SETTING_KEYS.MAINTENANCE_MODE,
      value: input as never,
      category: "system",
    });
    await recordAudit(audit, {
      module: "settings",
      eventType: input.enabled ? "maintenance.enabled" : "maintenance.disabled",
      action: input.enabled ? "Enabled maintenance mode" : "Disabled maintenance mode",
    });
    revalidatePath("/", "layout");
    return ok(undefined);
  } catch (error) {
    return toActionError(error);
  }
}

const uploadSettingsSchema = z
  .object({
    maxMb: z.coerce.number().int().min(1).max(500),
    allowedTypes: z.array(z.string().trim().min(1).max(10)).min(1).max(50),
  })
  .strict();

export async function saveUploadSettingsAction(raw: unknown): Promise<ActionResult<undefined>> {
  try {
    const { audit } = await requirePermission("settings.manage");
    const input = parse(uploadSettingsSchema, raw);
    await setSetting(audit, { key: SETTING_KEYS.UPLOAD_MAX_MB, value: input.maxMb, category: "files" });
    await setSetting(audit, {
      key: SETTING_KEYS.UPLOAD_ALLOWED_TYPES,
      value: input.allowedTypes.map((type) => type.toLowerCase().replace(/^\./, "")),
      category: "files",
    });
    revalidatePath("/settings");
    return ok(undefined);
  } catch (error) {
    return toActionError(error);
  }
}

// --- Catalogs (Settings → Catalogs): dropdown sources across the platform ---

const CATALOG_KINDS = ["MANUFACTURER", "ASSET_MODEL", "SUPPLIER", "VENDOR", "CONTRACT_CATEGORY"] as const;

const catalogItemSchema = z
  .object({
    kind: z.enum(CATALOG_KINDS),
    name: z.string().trim().min(1, "Name is required.").max(200),
    /** ASSET_MODEL items belong to a manufacturer. */
    parentId: z.string().uuid().optional().or(z.literal("").transform(() => undefined)),
  })
  .strict();

export async function createCatalogItemAction(raw: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const { audit } = await requirePermission("settings.manage");
    const input = parse(catalogItemSchema, raw);
    if (input.kind === "ASSET_MODEL" && !input.parentId) {
      throw new BusinessRuleError("Select the manufacturer this model belongs to.");
    }
    if (input.parentId) {
      const parent = await db.catalogItem.findFirst({
        where: { id: input.parentId, kind: "MANUFACTURER", deletedAt: null },
      });
      if (!parent) throw new BusinessRuleError("The parent manufacturer was not found.");
    }
    const duplicate = await db.catalogItem.findFirst({
      where: {
        kind: input.kind,
        name: { equals: input.name, mode: "insensitive" },
        parentId: input.parentId ?? null,
        deletedAt: null,
      },
    });
    if (duplicate) throw new BusinessRuleError("An entry with this name already exists.");
    const item = await db.catalogItem.create({
      data: {
        kind: input.kind,
        name: input.name,
        parentId: input.parentId ?? null,
        createdById: audit.actorUserId ?? null,
      },
    });
    await recordAudit(audit, {
      module: "settings",
      eventType: "catalog.created",
      action: `Added ${input.kind.toLowerCase().replace("_", " ")} "${input.name}" to catalogs`,
      targetType: "catalog_item",
      targetId: item.id,
      targetLabel: input.name,
    });
    revalidatePath("/settings");
    return ok({ id: item.id });
  } catch (error) {
    return toActionError(error);
  }
}

export async function setCatalogItemActiveAction(id: string, isActive: boolean): Promise<ActionResult<undefined>> {
  try {
    const { audit } = await requirePermission("settings.manage");
    const item = await db.catalogItem.findFirst({ where: { id, deletedAt: null } });
    if (!item) throw new BusinessRuleError("Catalog entry not found.");
    await db.catalogItem.update({ where: { id }, data: { isActive } });
    await recordAudit(audit, {
      module: "settings",
      eventType: isActive ? "catalog.enabled" : "catalog.disabled",
      action: `${isActive ? "Enabled" : "Disabled"} catalog entry "${item.name}"`,
      targetType: "catalog_item",
      targetId: id,
      targetLabel: item.name,
    });
    revalidatePath("/settings");
    return ok(undefined);
  } catch (error) {
    return toActionError(error);
  }
}

export async function updateCatalogItemAction(id: string, rawName: unknown): Promise<ActionResult<undefined>> {
  try {
    const { audit } = await requirePermission("settings.manage");
    const name = parse(z.string().trim().min(1, "Name is required.").max(200), rawName);
    const item = await db.catalogItem.findFirst({ where: { id, deletedAt: null } });
    if (!item) throw new BusinessRuleError("Catalog entry not found.");
    const duplicate = await db.catalogItem.findFirst({
      where: { id: { not: id }, kind: item.kind, name: { equals: name, mode: "insensitive" }, parentId: item.parentId, deletedAt: null },
    });
    if (duplicate) throw new BusinessRuleError("An entry with this name already exists.");
    // Contracts store their category by name, so keep them in sync on rename.
    if (item.kind === "CONTRACT_CATEGORY" && item.name !== name) {
      await db.contract.updateMany({ where: { category: item.name }, data: { category: name } });
    }
    await db.catalogItem.update({ where: { id }, data: { name } });
    await recordAudit(audit, {
      module: "settings",
      eventType: "catalog.updated",
      action: `Renamed catalog entry "${item.name}" to "${name}"`,
      targetType: "catalog_item",
      targetId: id,
      targetLabel: name,
    });
    revalidatePath("/settings", "layout");
    revalidatePath("/contracts", "layout");
    return ok(undefined);
  } catch (error) {
    return toActionError(error);
  }
}

export async function deleteCatalogItemAction(id: string): Promise<ActionResult<undefined>> {
  try {
    const { audit } = await requirePermission("settings.manage");
    const item = await db.catalogItem.findFirst({ where: { id, deletedAt: null } });
    if (!item) throw new BusinessRuleError("Catalog entry not found.");
    if (item.kind === "CONTRACT_CATEGORY") {
      const inUse = await db.contract.count({ where: { category: item.name, deletedAt: null } });
      if (inUse > 0) {
        throw new BusinessRuleError(
          `"${item.name}" is used by ${inUse} contract(s). Disable it instead, or move those contracts to another category first.`,
        );
      }
    }
    await db.catalogItem.update({ where: { id }, data: { deletedAt: new Date(), isActive: false } });
    await recordAudit(audit, {
      module: "settings",
      eventType: "catalog.deleted",
      action: `Deleted catalog entry "${item.name}"`,
      targetType: "catalog_item",
      targetId: id,
      targetLabel: item.name,
    });
    revalidatePath("/settings", "layout");
    return ok(undefined);
  } catch (error) {
    return toActionError(error);
  }
}

// --- Branding logo (Settings → General): shown on public forms and login ---

export async function uploadBrandingLogoAction(formData: FormData): Promise<ActionResult<undefined>> {
  try {
    const { audit } = await requirePermission("settings.manage");
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) {
      throw new BusinessRuleError("Choose a logo image (PNG, JPG or SVG).");
    }
    const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
    if (!["png", "jpg", "jpeg", "svg", "webp"].includes(extension)) {
      throw new BusinessRuleError("Logos must be PNG, JPG, SVG or WEBP images.");
    }
    if (file.size > 2 * 1024 * 1024) {
      throw new BusinessRuleError("Logo must be 2 MB or smaller.");
    }
    const { storage } = await import("@/shared/storage/storage");
    const { getSetting } = await import("@/shared/settings/settings");
    const stored = await storage.save(Buffer.from(await file.arrayBuffer()), extension, "branding");
    const branding = await getSetting<Record<string, unknown>>(SETTING_KEYS.BRANDING);
    await setSetting(audit, {
      key: SETTING_KEYS.BRANDING,
      value: {
        ...branding,
        logoStorageKey: stored.storageKey,
        logoMimeType:
          extension === "svg" ? "image/svg+xml" : extension === "webp" ? "image/webp" : `image/${extension === "jpg" ? "jpeg" : extension}`,
      } as never,
      category: "branding",
      description: "Global branding",
    });
    revalidatePath("/", "layout");
    return ok(undefined);
  } catch (error) {
    return toActionError(error);
  }
}

// --- Generated-document logos (Settings → General): stamped on handover/clearance PDFs ---

const LOGO_POSITIONS = ["left", "center", "right"] as const;
type LogoSetKey = typeof SETTING_KEYS.GENERATED_LOGOS | typeof SETTING_KEYS.REQUEST_FORM_LOGOS;

/** Shared upload/remove for a three-position logo set stored in settings. */
async function saveLogoSetEntry(
  key: LogoSetKey,
  description: string,
  position: string,
  formData: FormData,
  allowed: string[],
  storagePrefix: string,
): Promise<void> {
  const { audit } = await requirePermission("settings.manage");
  if (!LOGO_POSITIONS.includes(position as (typeof LOGO_POSITIONS)[number])) {
    throw new BusinessRuleError("Invalid logo position.");
  }
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) throw new BusinessRuleError("Choose a logo image.");
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (!allowed.includes(extension)) {
    throw new BusinessRuleError(`Logos must be ${allowed.join(", ").toUpperCase()}.`);
  }
  if (file.size > 2 * 1024 * 1024) throw new BusinessRuleError("Logo must be 2 MB or smaller.");
  const { storage } = await import("@/shared/storage/storage");
  const { getSetting } = await import("@/shared/settings/settings");
  const stored = await storage.save(Buffer.from(await file.arrayBuffer()), extension, storagePrefix);
  const logos = await getSetting<Record<string, { storageKey: string; mime: string } | null>>(key);
  const previous = logos[position];
  if (previous?.storageKey) await storage.delete(previous.storageKey).catch(() => undefined);
  const mime =
    extension === "svg" ? "image/svg+xml" : extension === "webp" ? "image/webp" : `image/${extension === "jpg" ? "jpeg" : extension}`;
  await setSetting(audit, {
    key,
    value: { ...logos, [position]: { storageKey: stored.storageKey, mime } } as never,
    category: "branding",
    description,
  });
}

async function clearLogoSetEntry(key: LogoSetKey, description: string, position: string): Promise<void> {
  const { audit } = await requirePermission("settings.manage");
  const { getSetting } = await import("@/shared/settings/settings");
  const logos = await getSetting<Record<string, { storageKey: string; mime: string } | null>>(key);
  const previous = logos[position];
  if (previous?.storageKey) {
    const { storage } = await import("@/shared/storage/storage");
    await storage.delete(previous.storageKey).catch(() => undefined);
  }
  await setSetting(audit, { key, value: { ...logos, [position]: null } as never, category: "branding", description });
}

export async function uploadGeneratedLogoAction(position: string, formData: FormData): Promise<ActionResult<undefined>> {
  try {
    await saveLogoSetEntry(SETTING_KEYS.GENERATED_LOGOS, "Generated document logos", position, formData, ["png", "jpg", "jpeg"], "generated-logos");
    revalidatePath("/settings", "layout");
    return ok(undefined);
  } catch (error) {
    return toActionError(error);
  }
}

export async function removeGeneratedLogoAction(position: string): Promise<ActionResult<undefined>> {
  try {
    await clearLogoSetEntry(SETTING_KEYS.GENERATED_LOGOS, "Generated document logos", position);
    revalidatePath("/settings", "layout");
    return ok(undefined);
  } catch (error) {
    return toActionError(error);
  }
}

export async function uploadRequestFormLogoAction(position: string, formData: FormData): Promise<ActionResult<undefined>> {
  try {
    await saveLogoSetEntry(SETTING_KEYS.REQUEST_FORM_LOGOS, "Public request form logos", position, formData, ["png", "jpg", "jpeg", "svg", "webp"], "form-logos");
    revalidatePath("/settings", "layout");
    revalidatePath("/", "layout");
    revalidatePath("/r", "layout");
    return ok(undefined);
  } catch (error) {
    return toActionError(error);
  }
}

export async function removeRequestFormLogoAction(position: string): Promise<ActionResult<undefined>> {
  try {
    await clearLogoSetEntry(SETTING_KEYS.REQUEST_FORM_LOGOS, "Public request form logos", position);
    revalidatePath("/settings", "layout");
    revalidatePath("/", "layout");
    revalidatePath("/r", "layout");
    return ok(undefined);
  } catch (error) {
    return toActionError(error);
  }
}

// --- Security operations (Doc 05 Ch13) ---

export async function forceLogoutSessionAction(sessionId: string): Promise<ActionResult<undefined>> {
  try {
    const context = await requirePermission("settings.security.manage");
    const session = await db.session.findUnique({
      where: { id: sessionId },
      include: { systemUser: true },
    });
    if (!session) throw new BusinessRuleError("Session not found.");
    if (session.id === context.user.sessionId) {
      throw new BusinessRuleError("You cannot force-logout your own current session. Sign out instead.");
    }
    await db.session.update({ where: { id: sessionId }, data: { revokedAt: new Date() } });
    await recordAudit(context.audit, {
      module: "security",
      eventType: "session.force_logout",
      action: `Forced logout of session for "${session.systemUser.username}"`,
      targetType: "session",
      targetId: sessionId,
      targetLabel: session.systemUser.username,
    });
    revalidatePath("/settings");
    return ok(undefined);
  } catch (error) {
    return toActionError(error);
  }
}

export async function revokeTargetTokensAction(
  targetType: string,
  targetId: string,
): Promise<ActionResult<{ count: number }>> {
  try {
    const { audit } = await requirePermission("settings.security.manage");
    const count = await revokeTokensForTarget(targetType, targetId);
    await recordAudit(audit, {
      module: "security",
      eventType: "tokens.revoked",
      action: `Revoked ${count} outstanding token(s) for ${targetType}`,
      targetType,
      targetId,
    });
    return ok({ count });
  } catch (error) {
    return toActionError(error);
  }
}
