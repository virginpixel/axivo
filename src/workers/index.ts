import { Worker, type Job } from "bullmq";
import { db } from "@/shared/db";
import { redisConnection, QUEUE_NAMES, getMaintenanceQueue, type EmailJobPayload } from "@/shared/queue/queue";
import { deliverEmailNotification, queueNotification } from "@/modules/notifications/service";
import { expireOverdueSecrets } from "@/modules/credentials/service";
import { recordAudit, SYSTEM_ACTOR } from "@/shared/audit/audit";
import { getSetting, SETTING_KEYS } from "@/shared/settings/settings";
import { sendApprovalEmails } from "@/modules/workflow/engine";
import { daysUntil, startOfDayUtc } from "@/shared/utils";

/**
 * Axivo background worker (SDS Doc 02 Ch7).
 * Processes email delivery and recurring maintenance: credential secret
 * expiry, token cleanup, contract & license reminders, pending-approval
 * reminders and session cleanup. Recoverable failures retry with exponential
 * backoff; the worker never talks to browsers.
 */

/**
 * Who is told that something expires.
 *
 * The record's own addresses win outright: somebody typed them because they are
 * the people who chase this particular renewal. Failing that, the Settings
 * default covers the common case of every reminder going to one IT mailbox.
 * Only when neither is set does it fall back to the company's administrators,
 * which is what happened before any of this was configurable - an expiry
 * nobody is told about is the one outcome worth ruling out.
 */
async function alertRecipients(
  companyId: string,
  recordEmails: unknown,
  defaultKey: typeof SETTING_KEYS.CONTRACT_ALERT_EMAILS | typeof SETTING_KEYS.LICENSE_ALERT_EMAILS,
): Promise<{ email: string; name: string }[]> {
  const named = Array.isArray(recordEmails)
    ? recordEmails.filter((entry): entry is string => typeof entry === "string" && entry.trim() !== "")
    : [];
  if (named.length > 0) return named.map((email) => ({ email, name: email }));

  const fallback = (await getSetting<string[]>(defaultKey)) ?? [];
  const configured = fallback.filter((entry) => typeof entry === "string" && entry.trim() !== "");
  if (configured.length > 0) return configured.map((email) => ({ email, name: email }));

  return getNotifiableAdmins(companyId);
}

async function processEmail(job: Job<EmailJobPayload>): Promise<void> {
  await deliverEmailNotification(job.data.notificationId);
}

async function cleanupExpiredTokens(): Promise<void> {
  // Tokens are kept 30 days beyond expiry for audit investigation, then purged.
  const cutoff = new Date(Date.now() - 30 * 24 * 3_600_000);
  const removed = await db.secureToken.deleteMany({
    where: { expiresAt: { lt: cutoff } },
  });
  if (removed.count > 0) {
    await recordAudit(SYSTEM_ACTOR, {
      module: "system",
      eventType: "maintenance.tokens_purged",
      action: `Purged ${removed.count} expired secure token(s)`,
    });
  }
}

async function cleanupSessions(): Promise<void> {
  const cutoff = new Date(Date.now() - 30 * 24 * 3_600_000);
  await db.session.deleteMany({
    where: { absoluteExpiresAt: { lt: cutoff } },
  });
}

async function expireCredentialSecrets(): Promise<void> {
  const count = await expireOverdueSecrets();
  if (count > 0) {
    await recordAudit(SYSTEM_ACTOR, {
      module: "credentials",
      eventType: "maintenance.secrets_expired",
      action: `Expired ${count} overdue credential secret(s)`,
    });
  }
}

/** Contract expiry/renewal reminders (Doc 23, Doc 14 Ch6). */
async function contractReminders(): Promise<void> {
  const defaultDays = await getSetting<number[]>(SETTING_KEYS.CONTRACT_REMINDER_DAYS);
  const contracts = await db.contract.findMany({
    where: {
      deletedAt: null,
      status: { in: ["ACTIVE", "EXPIRING", "RENEWED"] },
      OR: [{ endDate: { not: null } }, { renewalDate: { not: null } }],
    },
    include: { company: true, vendor: { select: { name: true } } },
  });
  for (const contract of contracts) {
    const reminderDays = (contract.reminderDays as number[] | null) ?? defaultDays;
    const targetDate = contract.renewalDate ?? contract.endDate;
    if (!targetDate) continue;
    // Whole days between dates: 0 on the day itself, negative once past. Cover
    // runs to the end of the date entered, so a contract ending today has not
    // expired yet. Measuring from instants made the answer depend on what time
    // of day this job happened to run.
    const daysLeft = daysUntil(targetDate);

    if (daysLeft < 0 && contract.status !== "EXPIRED") {
      await db.contract.update({ where: { id: contract.id }, data: { status: "EXPIRED" } });
      await recordAudit(
        { ...SYSTEM_ACTOR, companyId: contract.companyId },
        {
          module: "contracts",
          eventType: "contract.expired",
          action: `Contract "${contract.name}" expired`,
          targetType: "contract",
          targetId: contract.id,
          targetLabel: contract.contractNumber ?? contract.name,
        },
      );
      continue;
    }
    if (daysLeft >= 0 && daysLeft <= Math.max(...reminderDays) && contract.status === "ACTIVE") {
      await db.contract.update({ where: { id: contract.id }, data: { status: "EXPIRING" } });
    }
    if (reminderDays.includes(daysLeft)) {
      const recipients = await alertRecipients(
        contract.companyId,
        contract.alertEmails,
        SETTING_KEYS.CONTRACT_ALERT_EMAILS,
      );
      await queueNotification({
        companyId: contract.companyId,
        eventType: "CONTRACT_RENEWAL_REMINDER",
        subject: `Contract "${contract.name}" ${contract.renewalDate ? "renews" : "expires"} in ${daysLeft} day(s)`,
        body: `Contract <strong>${contract.name}</strong>${contract.contractNumber ? ` (${contract.contractNumber})` : ""} with vendor ${contract.vendor.name} for ${contract.company.name} ${contract.renewalDate ? "is due for renewal" : "expires"} on ${targetDate.toISOString().slice(0, 10)}.`,
        recipients,
        entityType: "contract",
        entityId: contract.id,
        dedupeKey: `contract-reminder:${contract.id}:${targetDate.toISOString().slice(0, 10)}:${daysLeft}`,
      });
    }
  }
}

/** Subscription license expiry reminders (Doc 10 Ch5). */
async function licenseReminders(): Promise<void> {
  const reminderDays = await getSetting<number[]>(SETTING_KEYS.LICENSE_REMINDER_DAYS);
  const purchases = await db.licensePurchase.findMany({
    where: {
      deletedAt: null,
      // gte start-of-today, not "now": a licence expiring today is still
      // covered today and should still be reminded about.
      expiryDate: { not: null, gte: startOfDayUtc() },
      license: { deletedAt: null, status: "ACTIVE", licenseType: "SUBSCRIPTION" },
    },
    include: { license: { include: { company: true } } },
  });
  const seenLicenses = new Set<string>();
  for (const purchase of purchases) {
    if (seenLicenses.has(purchase.licenseId)) continue;
    const daysLeft = daysUntil(purchase.expiryDate!);
    if (!reminderDays.includes(daysLeft)) continue;
    seenLicenses.add(purchase.licenseId);
    const recipients = await alertRecipients(
      purchase.license.companyId,
      purchase.license.alertEmails,
      SETTING_KEYS.LICENSE_ALERT_EMAILS,
    );
    await queueNotification({
      companyId: purchase.license.companyId,
      eventType: "LICENSE_EXPIRY_REMINDER",
      subject: `License "${purchase.license.name}" expires in ${daysLeft} day(s)`,
      body: `The subscription license <strong>${purchase.license.name}</strong> for ${purchase.license.company.name} expires on ${purchase.expiryDate!.toISOString().slice(0, 10)}. Renew it to avoid access interruption.`,
      recipients,
      entityType: "license",
      entityId: purchase.licenseId,
      dedupeKey: `license-reminder:${purchase.licenseId}:${purchase.expiryDate!.toISOString().slice(0, 10)}:${daysLeft}`,
    });
  }
  // Bring back any licence whose cover has been restored. Expiry was a one-way
  // door: a licence renewed after it lapsed stayed marked Expired for ever,
  // contradicting the cover date shown beside it. Recording a purchase fixes
  // it immediately; this catches the ones already in that state.
  const revived = await db.license.findMany({
    where: {
      deletedAt: null,
      status: "EXPIRED",
      licenseType: "SUBSCRIPTION",
      purchases: { some: { deletedAt: null, expiryDate: { gte: startOfDayUtc() } } },
    },
  });
  for (const license of revived) {
    await db.license.update({ where: { id: license.id }, data: { status: "ACTIVE" } });
    await recordAudit(
      { ...SYSTEM_ACTOR, companyId: license.companyId },
      {
        module: "licenses",
        eventType: "license.reactivated",
        action: `License "${license.name}" returned to active: it is covered again`,
        targetType: "license",
        targetId: license.id,
        targetLabel: license.name,
      },
    );
  }

  // Mark licenses whose latest window has fully expired.
  const expired = await db.license.findMany({
    where: {
      deletedAt: null,
      status: "ACTIVE",
      licenseType: "SUBSCRIPTION",
      // lt start-of-today: a term expiring today still covers today.
      purchases: { every: { OR: [{ expiryDate: null }, { expiryDate: { lt: startOfDayUtc() } }] } },
    },
  });
  for (const license of expired) {
    const hasAnyPurchase = await db.licensePurchase.count({ where: { licenseId: license.id, deletedAt: null } });
    if (hasAnyPurchase === 0) continue;
    await db.license.update({ where: { id: license.id }, data: { status: "EXPIRED" } });
    await recordAudit(
      { ...SYSTEM_ACTOR, companyId: license.companyId },
      {
        module: "licenses",
        eventType: "license.expired",
        action: `License "${license.name}" expired`,
        targetType: "license",
        targetId: license.id,
        targetLabel: license.name,
      },
    );
  }
}

/** Reminder emails for approvals pending longer than the configured window (Doc 09 Ch7). */
async function pendingApprovalReminders(): Promise<void> {
  const hours = await getSetting<number>(SETTING_KEYS.REMINDER_APPROVAL_HOURS);
  if (!hours || hours <= 0) return;
  const cutoff = new Date(Date.now() - hours * 3_600_000);
  const staleSteps = await db.workflowStepInstance.findMany({
    where: {
      status: "ACTIVE",
      stepType: { not: "IT_IMPLEMENTATION" },
      activatedAt: { lt: cutoff },
    },
    select: { id: true },
    take: 200,
  });
  for (const step of staleSteps) {
    try {
      // Re-issues tokens and resends approval emails to approvers who have not
      // acted; queueNotification dedupe prevents email storms per assignment.
      await sendApprovalEmails(SYSTEM_ACTOR, step.id);
    } catch (error) {
      console.error(`[axivo] Failed to send approval reminder for step ${step.id}:`, error);
    }
  }
}

/** Re-enqueue notifications stuck in QUEUED (missed enqueue or restart). */
async function sweepStuckNotifications(): Promise<void> {
  const stuck = await db.notification.findMany({
    where: {
      channel: "EMAIL",
      status: "QUEUED",
      scheduledAt: { lt: new Date(Date.now() - 5 * 60_000) },
    },
    select: { id: true },
    take: 100,
  });
  const { enqueueEmail } = await import("@/shared/queue/queue");
  for (const notification of stuck) {
    await enqueueEmail(notification.id);
  }
}

const MAINTENANCE_HANDLERS: Record<string, () => Promise<void>> = {
  "expire-credential-secrets": expireCredentialSecrets,
  "cleanup-expired-tokens": cleanupExpiredTokens,
  "contract-reminders": contractReminders,
  "license-reminders": licenseReminders,
  "pending-approval-reminders": pendingApprovalReminders,
  "cleanup-sessions": cleanupSessions,
  "sweep-stuck-notifications": sweepStuckNotifications,
};

async function getNotifiableAdmins(companyId: string): Promise<{ email: string; name: string }[]> {
  const admins = await db.systemUser.findMany({
    where: {
      isEnabled: true,
      deletedAt: null,
      systemRole: { key: { in: ["SYSTEM_ADMINISTRATOR", "IT_ADMINISTRATOR"] } },
      person: { isActive: true, deletedAt: null, companyId },
    },
    include: { person: true },
  });
  if (admins.length > 0) {
    return admins.map((admin) => ({
      email: admin.person.email,
      name: `${admin.person.firstName} ${admin.person.lastName}`,
    }));
  }
  // Fallback: global system administrators.
  const globalAdmins = await db.systemUser.findMany({
    where: {
      isEnabled: true,
      deletedAt: null,
      systemRole: { key: "SYSTEM_ADMINISTRATOR" },
      person: { isActive: true, deletedAt: null },
    },
    include: { person: true },
  });
  return globalAdmins.map((admin) => ({
    email: admin.person.email,
    name: `${admin.person.firstName} ${admin.person.lastName}`,
  }));
}

async function scheduleRecurringJobs(): Promise<void> {
  const queue = getMaintenanceQueue();
  const schedule: { name: string; pattern: string }[] = [
    { name: "expire-credential-secrets", pattern: "*/15 * * * *" },
    { name: "cleanup-expired-tokens", pattern: "30 2 * * *" },
    { name: "contract-reminders", pattern: "0 7 * * *" },
    { name: "license-reminders", pattern: "10 7 * * *" },
    { name: "pending-approval-reminders", pattern: "0 * * * *" },
    { name: "cleanup-sessions", pattern: "45 2 * * *" },
    { name: "sweep-stuck-notifications", pattern: "*/10 * * * *" },
  ];
  for (const job of schedule) {
    await queue.upsertJobScheduler(`scheduler-${job.name}`, { pattern: job.pattern }, {
      name: job.name,
      data: {},
    });
  }
}

async function main(): Promise<void> {
  console.log("[axivo-worker] Starting background worker...");
  const connection = redisConnection();

  const emailWorker = new Worker<EmailJobPayload>(QUEUE_NAMES.EMAIL, processEmail, {
    connection,
    concurrency: 5,
  });
  emailWorker.on("failed", (job, error) => {
    console.error(`[axivo-worker] Email job ${job?.id} failed:`, error.message);
  });

  const maintenanceWorker = new Worker(
    QUEUE_NAMES.MAINTENANCE,
    async (job: Job) => {
      const handler = MAINTENANCE_HANDLERS[job.name];
      if (!handler) {
        console.warn(`[axivo-worker] Unknown maintenance job "${job.name}"`);
        return;
      }
      await handler();
    },
    { connection, concurrency: 2 },
  );
  maintenanceWorker.on("failed", (job, error) => {
    console.error(`[axivo-worker] Maintenance job ${job?.name} failed:`, error.message);
  });

  await scheduleRecurringJobs();
  console.log("[axivo-worker] Worker ready; recurring jobs scheduled.");

  const shutdown = async () => {
    console.log("[axivo-worker] Shutting down gracefully...");
    await Promise.allSettled([emailWorker.close(), maintenanceWorker.close()]);
    await db.$disconnect();
    process.exit(0);
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

main().catch((error) => {
  console.error("[axivo-worker] Fatal startup error:", error);
  process.exit(1);
});
