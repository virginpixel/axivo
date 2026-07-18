"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/shared/db";
import { requirePermission, requireUser } from "@/shared/auth/guard";
import { recordAudit } from "@/shared/audit/audit";
import { ok, toActionError, BusinessRuleError, NotFoundError, type ActionResult } from "@/shared/errors";
import { parseInput as parse } from "@/shared/validation/common";
import { getSmtpConfig, decryptSmtpPassword } from "@/shared/settings/settings";
import { testSmtp } from "@/shared/email/mailer";
import { resendNotification } from "./service";

/** Notifications administration actions (SDS Doc 14 Ch8). */

export async function resendNotificationAction(notificationId: string): Promise<ActionResult<undefined>> {
  try {
    const { audit } = await requirePermission("notifications.manage");
    const copyId = await resendNotification(audit, notificationId);
    if (!copyId) throw new NotFoundError("Notification not found.");
    revalidatePath("/notifications");
    return ok(undefined);
  } catch (error) {
    return toActionError(error);
  }
}

export async function cancelNotificationAction(notificationId: string): Promise<ActionResult<undefined>> {
  try {
    const { audit } = await requirePermission("notifications.manage");
    const notification = await db.notification.findUnique({ where: { id: notificationId } });
    if (!notification) throw new NotFoundError("Notification not found.");
    if (notification.status !== "QUEUED") {
      throw new BusinessRuleError("Only queued notifications can be cancelled.");
    }
    await db.notification.update({
      where: { id: notificationId },
      data: { status: "CANCELLED", cancelledAt: new Date(), cancelledById: audit.actorUserId ?? null },
    });
    await recordAudit(audit, {
      module: "notifications",
      eventType: "notification.cancelled",
      action: "Cancelled queued notification",
      targetType: "notification",
      targetId: notificationId,
    });
    revalidatePath("/notifications");
    return ok(undefined);
  } catch (error) {
    return toActionError(error);
  }
}

const templateSchema = z
  .object({
    key: z.string().trim().min(1).max(100).regex(/^[a-z0-9_]+$/, "Key may contain lowercase letters, numbers and underscores."),
    name: z.string().trim().min(1).max(200),
    type: z.string().trim().min(1).max(100),
    subject: z.string().trim().min(1).max(300),
    body: z.string().trim().min(1).max(20000),
  })
  .strict();

/** Saving a template creates a new version; history is preserved (Doc 14 Ch2). */
export async function saveTemplateAction(raw: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const { audit } = await requirePermission("notifications.manage");
    const input = parse(templateSchema, raw);
    const latest = await db.notificationTemplate.findFirst({
      where: { key: input.key },
      orderBy: { version: "desc" },
    });
    const template = await db.$transaction(async (tx) => {
      if (latest) {
        await tx.notificationTemplate.updateMany({
          where: { key: input.key },
          data: { isActive: false },
        });
      }
      const created = await tx.notificationTemplate.create({
        data: {
          key: input.key,
          version: (latest?.version ?? 0) + 1,
          name: input.name,
          type: input.type,
          subject: input.subject,
          body: input.body,
          variables: (latest?.variables as string[] | null) ?? [],
          isActive: true,
          createdById: audit.actorUserId ?? null,
        },
      });
      await recordAudit(
        audit,
        {
          module: "notifications",
          eventType: latest ? "template.updated" : "template.created",
          action: `${latest ? "Updated" : "Created"} notification template "${input.key}" (v${created.version})`,
          targetType: "notification_template",
          targetId: created.id,
          targetLabel: input.key,
        },
        tx,
      );
      return created;
    });
    revalidatePath("/notifications");
    return ok({ id: template.id });
  } catch (error) {
    return toActionError(error);
  }
}

export async function testSmtpChannelAction(recipient: string): Promise<ActionResult<{ message: string }>> {
  try {
    const { audit } = await requirePermission("settings.manage");
    const config = await getSmtpConfig();
    if (!config) throw new BusinessRuleError("SMTP is not configured yet.");
    const result = await testSmtp({ ...config, passwordCiphertext: config.passwordCiphertext }, recipient);
    await recordAudit(audit, {
      module: "settings",
      eventType: "smtp.test_sent",
      action: `SMTP test to ${recipient}: ${result.deliveryOk ? "delivered" : `failed (${result.error ?? "unknown"})`}`,
      outcome: result.deliveryOk ? "SUCCESS" : "FAILURE",
    });
    if (!result.deliveryOk) {
      throw new BusinessRuleError(
        `SMTP test failed: ${result.error ?? "unknown error"}. Connection ${result.connectionOk ? "ok" : "failed"}, authentication ${result.authenticationOk ? "ok" : "failed"}.`,
      );
    }
    return ok({ message: "Test email delivered successfully." });
  } catch (error) {
    return toActionError(error);
  }
}

export async function markInAppReadAction(notificationId?: string): Promise<ActionResult<undefined>> {
  try {
    const { user } = await requireUser();
    await db.inAppNotification.updateMany({
      where: {
        systemUserId: user.userId,
        readAt: null,
        ...(notificationId ? { id: notificationId } : {}),
      },
      data: { readAt: new Date() },
    });
    revalidatePath("/notifications/inbox");
    return ok(undefined);
  } catch (error) {
    return toActionError(error);
  }
}
