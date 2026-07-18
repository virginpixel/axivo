import { db } from "@/shared/db";
import { getSetting, SETTING_KEYS } from "@/shared/settings/settings";

/**
 * Temporary login throttling (SDS Doc 05 Ch7).
 * Limits are tracked per IP, per username and per IP+username combination.
 * Default: 5 failed attempts → 5 minute cooldown. Counters reset after a
 * successful login or when the cooldown expires. Accounts are NEVER
 * permanently locked.
 */

function identifiers(ip: string | null, username: string): string[] {
  const normalized = username.trim().toLowerCase();
  const ids = [`user:${normalized}`];
  if (ip) {
    ids.push(`ip:${ip}`, `combo:${ip}:${normalized}`);
  }
  return ids;
}

export interface ThrottleStatus {
  blocked: boolean;
  retryAfterSeconds?: number;
}

export async function checkLoginThrottle(ip: string | null, username: string): Promise<ThrottleStatus> {
  const now = new Date();
  const rows = await db.loginThrottle.findMany({
    where: { identifier: { in: identifiers(ip, username) } },
  });
  for (const row of rows) {
    if (row.blockedUntil && row.blockedUntil > now) {
      return {
        blocked: true,
        retryAfterSeconds: Math.ceil((row.blockedUntil.getTime() - now.getTime()) / 1000),
      };
    }
  }
  return { blocked: false };
}

export async function recordLoginFailure(ip: string | null, username: string): Promise<void> {
  const [maxAttempts, cooldownMinutes] = await Promise.all([
    getSetting<number>(SETTING_KEYS.LOGIN_MAX_ATTEMPTS),
    getSetting<number>(SETTING_KEYS.LOGIN_COOLDOWN_MINUTES),
  ]);
  const now = new Date();
  const windowMs = cooldownMinutes * 60_000;

  for (const identifier of identifiers(ip, username)) {
    const existing = await db.loginThrottle.findUnique({ where: { identifier } });
    // Expired window (or expired block) starts a fresh counter.
    const windowExpired =
      !existing ||
      now.getTime() - existing.windowStart.getTime() > windowMs ||
      (existing.blockedUntil !== null && existing.blockedUntil < now);

    const failureCount = windowExpired ? 1 : existing.failureCount + 1;
    const blockedUntil =
      failureCount >= maxAttempts ? new Date(now.getTime() + windowMs) : null;

    await db.loginThrottle.upsert({
      where: { identifier },
      create: { identifier, failureCount, windowStart: now, blockedUntil },
      update: {
        failureCount,
        windowStart: windowExpired ? now : undefined,
        blockedUntil,
      },
    });
  }
}

export async function resetLoginThrottle(ip: string | null, username: string): Promise<void> {
  await db.loginThrottle.deleteMany({
    where: { identifier: { in: identifiers(ip, username) } },
  });
}
