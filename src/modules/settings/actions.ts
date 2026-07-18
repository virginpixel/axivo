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
