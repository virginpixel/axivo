import { db, type DbClient } from "@/shared/db";
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

const EMAIL_WRAPPER = (subject: string, bodyHtml: string) => `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f4f5f7;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;">
        <tr><td style="background:#1d4ed8;padding:16px 32px;">
          <span style="color:#ffffff;font-size:18px;font-weight:bold;">Axivo</span>
        </td></tr>
        <tr><td style="padding:32px;color:#1f2937;font-size:14px;line-height:1.6;">
          ${bodyHtml}
        </td></tr>
        <tr><td style="padding:16px 32px;background:#f9fafb;color:#6b7280;font-size:11px;">
          This is an automated message from Axivo regarding "${subject}". Please do not reply to this email.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

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
      html: EMAIL_WRAPPER(notification.subject, notification.body),
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
    await db.notification.update({
      where: { id: notificationId },
      data: { status: attempts >= retryLimit ? "FAILED" : "QUEUED", lastError: message },
    });
    // Rethrow so BullMQ applies the retry/backoff policy.
    throw error;
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
