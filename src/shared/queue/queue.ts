import { Queue } from "bullmq";
import IORedis from "ioredis";
import { env } from "@/shared/env";

/**
 * Background job queues (SDS Doc 02 Ch7). Jobs carry an id, type, payload,
 * company and retry policy; recoverable failures retry with exponential
 * backoff. Workers live in src/workers and are independently scalable.
 */

export const QUEUE_NAMES = {
  EMAIL: "axivo-email",
  MAINTENANCE: "axivo-maintenance",
} as const;

export interface EmailJobPayload {
  notificationId: string;
}

export type MaintenanceJobName =
  | "expire-credential-secrets"
  | "cleanup-expired-tokens"
  | "contract-reminders"
  | "license-reminders"
  | "pending-approval-reminders"
  | "cleanup-sessions";

let connection: IORedis | null = null;

export function redisConnection(): IORedis {
  if (!connection) {
    connection = new IORedis(env().REDIS_URL, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    });
  }
  return connection;
}

let emailQueue: Queue | null = null;
let maintenanceQueue: Queue | null = null;

export function getEmailQueue(): Queue {
  if (!emailQueue) {
    emailQueue = new Queue(QUEUE_NAMES.EMAIL, {
      connection: redisConnection(),
      defaultJobOptions: {
        attempts: 5,
        backoff: { type: "exponential", delay: 30_000 },
        removeOnComplete: { age: 7 * 24 * 3600, count: 5000 },
        removeOnFail: { age: 30 * 24 * 3600 },
      },
    });
  }
  return emailQueue;
}

export function getMaintenanceQueue(): Queue {
  if (!maintenanceQueue) {
    maintenanceQueue = new Queue(QUEUE_NAMES.MAINTENANCE, {
      connection: redisConnection(),
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: "exponential", delay: 60_000 },
        removeOnComplete: { age: 24 * 3600, count: 1000 },
        removeOnFail: { age: 7 * 24 * 3600 },
      },
    });
  }
  return maintenanceQueue;
}

/**
 * Enqueue an email delivery job. Failure to enqueue must not break the
 * business transaction (Doc 13 Ch5: failed notifications do not stop
 * workflow execution) - the pending notification row remains and the
 * maintenance sweep re-enqueues it.
 */
export async function enqueueEmail(notificationId: string): Promise<void> {
  try {
    await getEmailQueue().add("send", { notificationId } satisfies EmailJobPayload, {
      jobId: `notification-${notificationId}`,
    });
  } catch (error) {
    console.error("[axivo] Failed to enqueue email job (will be retried by sweep):", error);
  }
}
