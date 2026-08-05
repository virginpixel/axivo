import { db, type DbClient } from "@/shared/db";
import { wrapEmail, type EmailChrome } from "@/shared/email/template";
import { enqueueEmail } from "@/shared/queue/queue";
import { sendEmail } from "@/shared/email/mailer";
import { recordAudit, SYSTEM_ACTOR, type AuditContext } from "@/shared/audit/audit";
import { getSetting, SETTING_KEYS } from "@/shared/settings/settings";
import type { NotificationChannel } from "@prisma/client";

/**
 * Notifications service (SDS Doc 14).
 * Event-driven, template-based, deduplicated, with immutable delivery history.
 * Emails are queued and delivered by the background worker with retries.
 */

export interface NotificationRecipientInput {
  email: string;
  name?: string | null;
  personId?: string | null;
}

export interface QueueNotificationInput {
  companyId?: string | null;
  eventType: string;
  templateKey?: string;
  /** Variables substituted into the template ({{variable}} syntax). */
  variables?: Record<string, string>;
  /** Direct subject/body when no template is used. */
  subject?: string;
  body?: string;
  recipients: NotificationRecipientInput[];
  entityType?: string;
  entityId?: string;
  dedupeKey?: string;
  channel?: NotificationChannel;
}

export function renderTemplateString(template: string, variables: Record<string, string>): string {
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_match, name: string) => {
    return variables[name] ?? "";
  });
}

/**
 * Queue a notification for delivery. Recipients are deduplicated; a dedupeKey
 * prevents duplicate notifications for the same business event (Doc 14 Ch4).
 * Never throws into the calling business flow.
 */
export async function queueNotification(
  input: QueueNotificationInput,
  client: DbClient = db,
): Promise<string | null> {
  try {
    // Dedupe on the business event.
    if (input.dedupeKey) {
      const existing = await client.notification.findFirst({
        where: { dedupeKey: input.dedupeKey, status: { notIn: ["FAILED", "CANCELLED"] } },
      });
      if (existing) return existing.id;
    }

    // Resolve template.
    let subject = input.subject ?? "";
    let body = input.body ?? "";
    let templateId: string | null = null;
    if (input.templateKey) {
      const template = await client.notificationTemplate.findFirst({
        where: { key: input.templateKey, isActive: true },
        orderBy: { version: "desc" },
      });
      if (template) {
        templateId = template.id;
        subject = renderTemplateString(template.subject, input.variables ?? {});
        body = renderTemplateString(template.body, input.variables ?? {});
      }
    }
    if (!subject) {
      console.error(`[axivo] Notification for ${input.eventType} has no subject; skipped.`);
      return null;
    }

    // Deduplicate recipients by email (Doc 14 Ch5).
    const seen = new Set<string>();
    const recipients = input.recipients.filter((recipient) => {
      const key = recipient.email.trim().toLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    if (recipients.length === 0) return null;

    const notification = await client.notification.create({
      data: {
        companyId: input.companyId ?? null,
        templateId,
        channel: input.channel ?? "EMAIL",
        eventType: input.eventType,
        dedupeKey: input.dedupeKey ?? null,
        subject,
        body,
        entityType: input.entityType ?? null,
        entityId: input.entityId ?? null,
        recipients: {
          create: recipients.map((recipient) => ({
            email: recipient.email.trim().toLowerCase(),
            name: recipient.name ?? null,
            personId: recipient.personId ?? null,
          })),
        },
      },
    });

    if ((input.channel ?? "EMAIL") === "EMAIL") {
      await enqueueEmail(notification.id);
    }
    return notification.id;
  } catch (error) {
    // Failed notification generation must never corrupt business flow (Doc 14 Ch11).
    console.error("[axivo] Failed to queue notification:", error);
    return null;
  }
}

/** In-app portal notification for a signed-in user (Doc 14 Ch3). */
export async function createInAppNotification(
  systemUserId: string,
  title: string,
  body?: string,
  link?: string,
  client: DbClient = db,
): Promise<void> {
  try {
    await client.inAppNotification.create({
      data: { systemUserId, title, body: body ?? null, link: link ?? null },
    });
  } catch (error) {
    console.error("[axivo] Failed to create in-app notification:", error);
  }
}

/**
 * Resolve the chrome an email is wrapped in. Both real delivery and the
 * Notifications preview call this, so what an administrator previews is what a
 * recipient receives - previously the preview showed the bare template body
 * while the delivered mail carried a header and footer nobody could see.
 */
export async function getEmailChrome(): Promise<EmailChrome> {
  try {
    const { getSetting, SETTING_KEYS } = await import("@/shared/settings/settings");
    const { publicBaseUrl } = await import("@/shared/settings/runtime");
    const { BRAND_PRIMARY } = await import("@/shared/branding");
    const branding = await getSetting<{
      systemName?: string;
      logoStorageKey?: string;
    }>(SETTING_KEYS.BRANDING);
    const baseUrl = await publicBaseUrl();
    return {
      // Email clients cannot reach a relative path, so the logo needs the
      // configured public base URL in front of it.
      logoUrl: branding.logoStorageKey ? `${baseUrl}/api/branding/logo` : null,
      systemName: branding.systemName || "Axivo",
      // Brand color is a fixed product constant.
      primaryColor: BRAND_PRIMARY,
    };
  } catch {
    return { logoUrl: null, systemName: "Axivo", primaryColor: "#232323" };
  }
}



/**
 * Deliver a queued email notification. Called from the background worker; the
 * worker's retry policy handles transient failures.
 */
export async function deliverEmailNotification(notificationId: string): Promise<void> {
  const notification = await db.notification.findUnique({
    where: { id: notificationId },
    include: { recipients: true },
  });
  if (!notification) return;
  if (notification.status === "DELIVERED" || notification.status === "CANCELLED") return;

  const retryLimit = await getSetting<number>(SETTING_KEYS.EMAIL_RETRY_LIMIT);

  await db.notification.update({
    where: { id: notificationId },
    data: { status: "SENDING", attempts: { increment: 1 } },
  });

  try {
    await sendEmail({
      to: notification.recipients.map((recipient) => ({
        email: recipient.email,
        name: recipient.name,
      })),
      subject: notification.subject,
      html: wrapEmail(notification.subject, notification.body, await getEmailChrome()),
    });
    await db.notification.update({
      where: { id: notificationId },
      data: { status: "DELIVERED", sentAt: new Date(), lastError: null },
    });
    await recordAudit(
      { ...SYSTEM_ACTOR, companyId: notification.companyId },
      {
        module: "notifications",
        eventType: "notification.delivered",
        action: `Delivered ${notification.eventType} notification`,
        targetType: "notification",
        targetId: notification.id,
      },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 500) : "Unknown error";
    const attempts = notification.attempts + 1;
    const permanentlyFailed = attempts >= retryLimit;
    await db.notification.update({
      where: { id: notificationId },
      data: { status: permanentlyFailed ? "FAILED" : "QUEUED", lastError: message },
    });
    // On permanent failure, alert administrators through the in-app bell so
    // they can check SMTP settings (Doc 14 Ch8). No dashboard banner is shown.
    if (permanentlyFailed) {
      await notifyAdminsOfDeliveryFailure(notification.companyId, notification.subject).catch(() => undefined);
    }
    // Rethrow so BullMQ applies the retry/backoff policy.
    throw error;
  }
}

/** Create a de-duplicated in-app alert for admins when an email permanently fails. */
async function notifyAdminsOfDeliveryFailure(companyId: string | null, subject: string): Promise<void> {
  const admins = await db.systemUser.findMany({
    where: {
      isEnabled: true,
      deletedAt: null,
      systemRole: { key: { in: ["SYSTEM_ADMINISTRATOR", "IT_ADMINISTRATOR"] } },
      person: { isActive: true, deletedAt: null, ...(companyId ? { companyId } : {}) },
    },
    select: { id: true },
  });
  for (const admin of admins) {
    // Avoid piling up: skip if an unread delivery-failure alert already exists.
    const existing = await db.inAppNotification.findFirst({
      where: { systemUserId: admin.id, readAt: null, title: "Email delivery failed" },
    });
    if (existing) continue;
    await db.inAppNotification.create({
      data: {
        systemUserId: admin.id,
        title: "Email delivery failed",
        body: `"${subject}" could not be delivered after retries. Check Settings → Email (SMTP).`,
        link: "/notifications?status=FAILED",
      },
    });
  }
}

/** Manual resend creates a new delivery record, preserving the original (Doc 14 Ch6). */
export async function resendNotification(
  context: AuditContext,
  notificationId: string,
): Promise<string | null> {
  const original = await db.notification.findUnique({
    where: { id: notificationId },
    include: { recipients: true },
  });
  if (!original) return null;
  const copy = await db.notification.create({
    data: {
      companyId: original.companyId,
      templateId: original.templateId,
      channel: original.channel,
      eventType: original.eventType,
      subject: original.subject,
      body: original.body,
      entityType: original.entityType,
      entityId: original.entityId,
      recipients: {
        create: original.recipients.map((recipient) => ({
          email: recipient.email,
          name: recipient.name,
          personId: recipient.personId,
        })),
      },
    },
  });
  await enqueueEmail(copy.id);
  await recordAudit(context, {
    module: "notifications",
    eventType: "notification.resent",
    action: "Manually resent notification",
    targetType: "notification",
    targetId: original.id,
  });
  return copy.id;
}
