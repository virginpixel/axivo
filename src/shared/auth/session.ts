import "server-only";
import { cookies, headers } from "next/headers";
import { cache } from "react";
import { db } from "@/shared/db";
import { randomToken, sha256 } from "@/shared/crypto/encryption";
import { getSetting, SETTING_KEYS } from "@/shared/settings/settings";
import { publicBaseUrl } from "@/shared/settings/runtime";
import type { Permission } from "@/shared/auth/permissions";

/**
 * Server-managed session handling (SDS Doc 05 Ch5).
 * The browser holds only an opaque random token in an HttpOnly, Secure,
 * SameSite=Lax cookie; the SHA-256 hash is stored server-side with idle and
 * absolute expiries. Session IDs are regenerated at login.
 */

export const SESSION_COOKIE = "axivo_session";

export interface AuthenticatedUser {
  userId: string;
  personId: string;
  username: string;
  displayName: string;
  email: string;
  companyId: string;
  systemRoleId: string;
  systemRoleKey: string;
  systemRoleName: string;
  permissions: Set<Permission>;
  sessionId: string;
}

/** 0 disables the timeout: represent "never" as a date far in the future. */
const NEVER = new Date("9999-12-31T23:59:59Z");
function expiryFrom(now: Date, ms: number): Date {
  return ms <= 0 ? NEVER : new Date(now.getTime() + ms);
}

/**
 * Cookie lifetime in seconds. An absolute timeout of 0 means "never", but
 * passing maxAge: 0 to the browser expires the cookie immediately, which signed
 * the user straight back out. Chrome caps cookie lifetime at 400 days anyway,
 * so that is as close to never as a cookie gets.
 */
const NEVER_MAX_AGE_SECONDS = 400 * 24 * 3600;
function cookieMaxAge(absoluteHours: number): number {
  return absoluteHours > 0 ? absoluteHours * 3600 : NEVER_MAX_AGE_SECONDS;
}

export async function createSession(systemUserId: string): Promise<string> {
  const [idleMinutes, absoluteHours] = await Promise.all([
    getSetting<number>(SETTING_KEYS.SESSION_IDLE_MINUTES),
    getSetting<number>(SETTING_KEYS.SESSION_ABSOLUTE_HOURS),
  ]);
  const token = randomToken(32);
  const now = new Date();
  const requestHeaders = await headers();

  await db.session.create({
    data: {
      tokenHash: sha256(token),
      systemUserId,
      idleExpiresAt: expiryFrom(now, idleMinutes * 60_000),
      absoluteExpiresAt: expiryFrom(now, absoluteHours * 3_600_000),
      ipAddress: getClientIp(requestHeaders),
      userAgent: requestHeaders.get("user-agent")?.slice(0, 512) ?? null,
    },
  });

  // Only mark the cookie Secure when the deployment is actually served over
  // HTTPS. A self-host install defaults to plain HTTP on the LAN, where a
  // Secure cookie would be dropped and sign-in would silently fail; once the
  // site is fronted by HTTPS (e.g. the Cloudflare tunnel) the base URL becomes
  // https and the cookie is hardened automatically.
  const secure = (await publicBaseUrl()).startsWith("https");
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: cookieMaxAge(absoluteHours),
  });
  return token;
}

export async function destroyCurrentSession(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (token) {
    await db.session.updateMany({
      where: { tokenHash: sha256(token), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
  cookieStore.delete(SESSION_COOKIE);
}

/**
 * Resolve the current session to an authenticated user, refreshing the idle
 * timeout. Returns null for anonymous/expired/revoked sessions. Cached per
 * request so repeated permission checks hit the database once.
 */
export const getCurrentUser = cache(async (): Promise<AuthenticatedUser | null> => {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const now = new Date();
  const session = await db.session.findUnique({
    where: { tokenHash: sha256(token) },
    include: {
      systemUser: {
        include: {
          person: true,
          systemRole: { include: { permissions: true } },
        },
      },
    },
  });

  if (
    !session ||
    session.revokedAt ||
    session.idleExpiresAt < now ||
    session.absoluteExpiresAt < now
  ) {
    return null;
  }

  const { systemUser } = session;
  if (!systemUser.isEnabled || systemUser.deletedAt || !systemUser.systemRole.isActive) {
    return null;
  }
  if (!systemUser.person.isActive || systemUser.person.deletedAt) {
    return null;
  }

  // Sliding idle window (Doc 05 Ch5: activity refreshes the idle timeout).
  const idleMinutes = await getSetting<number>(SETTING_KEYS.SESSION_IDLE_MINUTES);
  await db.session.update({
    where: { id: session.id },
    data: {
      lastActivityAt: now,
      idleExpiresAt: expiryFrom(now, idleMinutes * 60_000),
    },
  });

  return {
    userId: systemUser.id,
    personId: systemUser.personId,
    username: systemUser.username,
    displayName: `${systemUser.person.firstName} ${systemUser.person.lastName}`,
    email: systemUser.person.email,
    companyId: systemUser.person.companyId,
    systemRoleId: systemUser.systemRoleId,
    systemRoleKey: systemUser.systemRole.key,
    systemRoleName: systemUser.systemRole.name,
    permissions: new Set(
      systemUser.systemRole.permissions.map((p) => p.permission as Permission),
    ),
    sessionId: session.id,
  };
});

export function getClientIp(requestHeaders: Headers): string | null {
  const forwarded = requestHeaders.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first.slice(0, 64);
  }
  return requestHeaders.get("x-real-ip")?.slice(0, 64) ?? null;
}
