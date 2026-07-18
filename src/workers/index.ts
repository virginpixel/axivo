import { Worker, type Job } from "bullmq";
import { db } from "@/shared/db";
import { redisConnection, QUEUE_NAMES, getMaintenanceQueue, type EmailJobPayload } from "@/shared/queue/queue";
import { deliverEmailNotification, queueNotification } from "@/modules/notifications/service";
import { expireOverdueSecrets } from "@/modules/credentials/service";
import { recordAudit, SYSTEM_ACTOR } from "@/shared/audit/audit";
import { getSetting, SETTING_KEYS } from "@/shared/settings/settings";
import { sendApprovalEmails } from "@/modules/workflow/engine";

/**
 * Axivo background worker (SDS Doc 02 Ch7).
 * Processes email delivery and recurring maintenance: credential secret
 * expiry, token cleanup, contract & license reminders, pending-approval
 * reminders and session cleanup. Recoverable failures retry with exponential
 * backoff; the worker never talks to browsers.
 */

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
    include: { owner: true, company: true },
  });
  const now = Date.now();
  for (const contract of contracts) {
    const reminderDays = (contract.reminderDays as number[] | null) ?? defaultDays;
    const targetDate = contract.renewalDate ?? contract.endDate;
    if (!targetDate) continue;
    const daysLeft = Math.ceil((targetDate.getTime() - now) / 86_400_000);

    if (daysLeft < 0 && contract.status !== "EXPIRED") {
      await db.contract.update({ where: { id: contract.id }, data: { status: "EXPIRED" } });
      await recordAudit(
        { ...SYSTEM_ACTOR, companyId: contract.companyId },
        {
          module: "contracts",
          eventType: "contract.expired",
          action: `Contract ${contract.contractNumber} expired`,
          targetType: "contract",
          targetId: contract.id,
          targetLabel: contract.contractNumber,
        },
      );
      continue;
    }
    if (daysLeft >= 0 && daysLeft <= Math.max(...reminderDays) && contract.status === "ACTIVE") {
      await db.contract.update({ where: { id: contract.id }, data: { status: "EXPIRING" } });
    }
    if (reminderDays.includes(daysLeft)) {
      const admins = await getNotifiableAdmins(contract.companyId);
      const recipients = [
        ...(contract.owner ? [{ email: contract.owner.email, name: `${contract.owner.firstName} ${contract.owner.lastName}` }] : []),
        ...admins,
      ];
      await queueNotification({
        companyId: contract.companyId,
        eventType: "CONTRACT_RENEWAL_REMINDER",
        subject: `Contract ${contract.contractNumber} ${contract.renewalDate ? "renews" : "expires"} in ${daysLeft} day(s)`,
        body: `Contract <strong>${contract.contractNumber}</strong> ("${contract.name}", vendor ${contract.vendor}) for ${contract.company.name} ${contract.renewalDate ? "is due for renewal" : "expires"} on ${targetDate.toISOString().slice(0, 10)}.`,
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
      expiryDate: { not: null, gte: new Date() },
      license: { deletedAt: null, status: "ACTIVE", licenseType: "SUBSCRIPTION" },
    },
    include: { license: { include: { company: true } } },
  });
  const now = Date.now();
  const seenLicenses = new Set<string>();
  for (const purchase of purchases) {
    if (seenLicenses.has(purchase.licenseId)) continue;
    const daysLeft = Math.ceil((purchase.expiryDate!.getTime() - now) / 86_400_000);
    if (!reminderDays.includes(daysLeft)) continue;
    seenLicenses.add(purchase.licenseId);
    const admins = await getNotifiableAdmins(purchase.license.companyId);
    await queueNotification({
      companyId: purchase.license.companyId,
      eventType: "LICENSE_EXPIRY_REMINDER",
      subject: `License "${purchase.license.name}" expires in ${daysLeft} day(s)`,
      body: `The subscription license <strong>${purchase.license.name}</strong> for ${purchase.license.company.name} expires on ${purchase.expiryDate!.toISOString().slice(0, 10)}. Renew it to avoid access interruption.`,
      recipients: admins,
      entityType: "license",
      entityId: purchase.licenseId,
      dedupeKey: `license-reminder:${purchase.licenseId}:${purchase.expiryDate!.toISOString().slice(0, 10)}:${daysLeft}`,
    });
  }
  // Mark licenses whose latest window has fully expired.
  const expired = await db.license.findMany({
    where: {
      deletedAt: null,
      status: "ACTIVE",
      licenseType: "SUBSCRIPTION",
      purchases: { every: { OR: [{ expiryDate: null }, { expiryDate: { lt: new Date() } }] } },
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
