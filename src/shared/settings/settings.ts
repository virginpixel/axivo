import { db } from "@/shared/db";
import { encryptSecret, decryptSecret } from "@/shared/crypto/encryption";
import type { AuditContext } from "@/shared/audit/audit";
import { recordAudit } from "@/shared/audit/audit";
import type { Prisma } from "@prisma/client";

/**
 * System settings service (SDS Doc 17). Global settings apply platform-wide;
 * company-scoped settings override them. Every change is versioned in
 * system_setting_history and audited. Secret values are encrypted at rest.
 */

export const SETTING_KEYS = {
  // Security (Doc 05)
  SESSION_IDLE_MINUTES: "security.session.idleMinutes",
  SESSION_ABSOLUTE_HOURS: "security.session.absoluteHours",
  LOGIN_MAX_ATTEMPTS: "security.login.maxAttempts",
  LOGIN_COOLDOWN_MINUTES: "security.login.cooldownMinutes",
  PASSWORD_POLICY: "security.password.policy",
  TOKEN_EXPIRY_HOURS: "security.token.expiryHours",
  CREDENTIAL_SECRET_EXPIRY_HOURS: "security.credentialSecret.expiryHours",
  PUBLIC_FORM_RATE_PER_HOUR: "security.publicForm.ratePerHour",

  // Email (Doc 17 Ch5)
  SMTP_CONFIG: "email.smtp",

  // Branding (Doc 17 Ch6)
  BRANDING: "branding.global",

  // Files (Doc 12)
  UPLOAD_MAX_MB: "files.upload.maxMb",
  UPLOAD_ALLOWED_TYPES: "files.upload.allowedTypes",

  // Notifications (Doc 14)
  REMINDER_APPROVAL_HOURS: "notifications.reminders.approvalHours",
  REMINDER_IMPLEMENTATION_HOURS: "notifications.reminders.implementationHours",
  REMINDER_ACK_HOURS: "notifications.reminders.acknowledgementHours",
  NOTIFY_REQUESTER_ON_REJECTION: "notifications.requester.onRejection",
  NOTIFY_REQUESTER_ON_FINAL_APPROVAL: "notifications.requester.onFinalApproval",
  EMAIL_RETRY_LIMIT: "notifications.email.retryLimit",

  // Contracts / licenses (Docs 10/23)
  CONTRACT_REMINDER_DAYS: "contracts.reminderDays",
  LICENSE_REMINDER_DAYS: "licenses.reminderDays",

  // System
  MAINTENANCE_MODE: "system.maintenanceMode",
  GENERAL: "system.general",
} as const;

export type SettingKey = (typeof SETTING_KEYS)[keyof typeof SETTING_KEYS];

/** Safe defaults applied when a setting has not been configured yet. */
const DEFAULTS: Record<string, unknown> = {
  [SETTING_KEYS.SESSION_IDLE_MINUTES]: 30,
  [SETTING_KEYS.SESSION_ABSOLUTE_HOURS]: 12,
  [SETTING_KEYS.LOGIN_MAX_ATTEMPTS]: 5,
  [SETTING_KEYS.LOGIN_COOLDOWN_MINUTES]: 5,
  [SETTING_KEYS.PASSWORD_POLICY]: {
    minLength: 12,
    requireUppercase: true,
    requireLowercase: true,
    requireNumber: true,
    requireSpecial: true,
  },
  [SETTING_KEYS.TOKEN_EXPIRY_HOURS]: 72,
  [SETTING_KEYS.CREDENTIAL_SECRET_EXPIRY_HOURS]: 72,
  [SETTING_KEYS.PUBLIC_FORM_RATE_PER_HOUR]: 20,
  [SETTING_KEYS.UPLOAD_MAX_MB]: 20,
  [SETTING_KEYS.UPLOAD_ALLOWED_TYPES]: [
    "pdf", "docx", "xlsx", "pptx", "jpg", "jpeg", "png", "zip", "csv", "txt",
  ],
  [SETTING_KEYS.REMINDER_APPROVAL_HOURS]: 24,
  [SETTING_KEYS.REMINDER_IMPLEMENTATION_HOURS]: 24,
  [SETTING_KEYS.REMINDER_ACK_HOURS]: 48,
  [SETTING_KEYS.NOTIFY_REQUESTER_ON_REJECTION]: true,
  [SETTING_KEYS.NOTIFY_REQUESTER_ON_FINAL_APPROVAL]: true,
  [SETTING_KEYS.EMAIL_RETRY_LIMIT]: 5,
  [SETTING_KEYS.CONTRACT_REMINDER_DAYS]: [60, 30, 14, 7],
  [SETTING_KEYS.LICENSE_REMINDER_DAYS]: [60, 30, 14, 7],
  [SETTING_KEYS.MAINTENANCE_MODE]: { enabled: false, message: "" },
  [SETTING_KEYS.BRANDING]: {
    systemName: "Axivo",
    primaryColor: "#1d4ed8",
    secondaryColor: "#0f172a",
    loginLogoDocumentId: null,
    emailLogoDocumentId: null,
    pdfLogoDocumentIds: [],
    loginBackgroundDocumentId: null,
  },
  [SETTING_KEYS.GENERAL]: {
    defaultTimezone: "UTC",
    defaultCurrency: "USD",
    dateFormat: "yyyy-MM-dd",
    timeFormat: "HH:mm",
  },
};

export async function getSetting<T>(key: SettingKey, companyId?: string): Promise<T> {
  // Company override first, then global, then default.
  if (companyId) {
    const companySetting = await db.systemSetting.findUnique({
      where: { key_scope_companyId: { key, scope: "COMPANY", companyId } },
    });
    if (companySetting) return companySetting.value as T;
  }
  const globalSetting = await db.systemSetting.findFirst({
    where: { key, scope: "GLOBAL" },
  });
  if (globalSetting) return globalSetting.value as T;
  return DEFAULTS[key] as T;
}

export interface SetSettingInput {
  key: SettingKey;
  value: Prisma.InputJsonValue;
  category: string;
  companyId?: string;
  description?: string;
  isSecret?: boolean;
  reason?: string;
}

export async function setSetting(context: AuditContext, input: SetSettingInput): Promise<void> {
  const scope = input.companyId ? "COMPANY" : "GLOBAL";
  await db.$transaction(async (tx) => {
    const existing = await tx.systemSetting.findFirst({
      where: { key: input.key, scope, companyId: input.companyId ?? null },
    });
    let settingId: string;
    if (existing) {
      await tx.systemSetting.update({
        where: { id: existing.id },
        data: { value: input.value, updatedById: context.actorUserId ?? null },
      });
      settingId = existing.id;
    } else {
      const created = await tx.systemSetting.create({
        data: {
          key: input.key,
          category: input.category,
          scope,
          companyId: input.companyId ?? null,
          value: input.value,
          description: input.description,
          isSecret: input.isSecret ?? false,
          updatedById: context.actorUserId ?? null,
        },
      });
      settingId = created.id;
    }
    await tx.systemSettingHistory.create({
      data: {
        settingId,
        previousValue: existing?.value ?? undefined,
        newValue: input.value,
        changedById: context.actorUserId ?? null,
        reason: input.reason,
      },
    });
    await recordAudit(
      context,
      {
        module: "settings",
        eventType: existing ? "setting.updated" : "setting.created",
        action: `${existing ? "Updated" : "Created"} setting ${input.key}`,
        targetType: "system_setting",
        targetId: settingId,
        targetLabel: input.key,
        // Secret values are never written to the audit trail.
        details: input.isSecret ? { redacted: true } : { key: input.key },
      },
      tx,
    );
  });
}

// ---------------------------------------------------------------------------
// SMTP configuration (Doc 17 Ch5) - password stored encrypted.
// ---------------------------------------------------------------------------

export interface SmtpConfig {
  host: string;
  port: number;
  encryption: "none" | "tls" | "ssl";
  authMethod: "none" | "login";
  username?: string;
  /** Encrypted at rest; decrypted only when sending. */
  passwordCiphertext?: string;
  senderName: string;
  senderEmail: string;
  replyTo?: string;
}

export async function getSmtpConfig(): Promise<SmtpConfig | null> {
  const setting = await db.systemSetting.findFirst({
    where: { key: SETTING_KEYS.SMTP_CONFIG, scope: "GLOBAL" },
  });
  return (setting?.value as SmtpConfig | undefined) ?? null;
}

export async function saveSmtpConfig(
  context: AuditContext,
  config: Omit<SmtpConfig, "passwordCiphertext"> & { password?: string },
): Promise<void> {
  const existing = await getSmtpConfig();
  const { password, ...rest } = config;
  const stored: SmtpConfig = {
    ...rest,
    // Keep the previous ciphertext when the admin does not re-enter a password.
    passwordCiphertext: password ? encryptSecret(password) : existing?.passwordCiphertext,
  };
  await setSetting(context, {
    key: SETTING_KEYS.SMTP_CONFIG,
    value: stored as unknown as Prisma.InputJsonValue,
    category: "email",
    isSecret: true,
    description: "Outgoing SMTP configuration",
  });
}

export function decryptSmtpPassword(config: SmtpConfig): string | undefined {
  if (!config.passwordCiphertext) return undefined;
  return decryptSecret(config.passwordCiphertext);
}
