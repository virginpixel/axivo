"use server";

import { z } from "zod";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/shared/db";
import { verifyPassword, hashPassword, validatePasswordAgainstPolicy, type PasswordPolicy } from "@/shared/crypto/password";
import { createSession, destroyCurrentSession, getClientIp, getCurrentUser } from "@/shared/auth/session";
import { checkLoginThrottle, recordLoginFailure, resetLoginThrottle } from "@/shared/auth/throttle";
import { recordAudit } from "@/shared/audit/audit";
import { getSetting, SETTING_KEYS } from "@/shared/settings/settings";
import { ok, toActionError, AuthenticationError, RateLimitedError, ValidationError, type ActionResult } from "@/shared/errors";
import { parseInput as parse } from "@/shared/validation/common";

/**
 * Authentication actions (SDS Doc 05 Ch2).
 * Login flow: validate → rate limit → verify credentials → regenerate session
 * → audit → redirect. Errors are always generic; throttling is temporary.
 */

const loginSchema = z
  .object({
    username: z.string().trim().min(1, "Username is required.").max(100),
    password: z.string().min(1, "Password is required.").max(200),
  })
  .strict();

export async function loginAction(raw: unknown): Promise<ActionResult<{ redirectTo: string }>> {
  try {
    const input = parse(loginSchema, raw);
    const requestHeaders = await headers();
    const ip = getClientIp(requestHeaders);
    const userAgent = requestHeaders.get("user-agent")?.slice(0, 512) ?? null;
    const baseAudit = { actorLabel: input.username, ipAddress: ip, userAgent };

    // Maintenance mode blocks non-administrators at the login gate.
    const maintenance = await getSetting<{ enabled: boolean; message: string }>(
      SETTING_KEYS.MAINTENANCE_MODE,
    );

    const throttle = await checkLoginThrottle(ip, input.username);
    if (throttle.blocked) {
      await recordAudit(baseAudit, {
        module: "security",
        eventType: "login.throttled",
        action: "Login attempt while throttled",
        outcome: "DENIED",
      });
      throw new RateLimitedError(
        "Too many failed attempts. Please wait a few minutes and try again.",
      );
    }

    const user = await db.systemUser.findFirst({
      where: { username: { equals: input.username, mode: "insensitive" }, deletedAt: null },
      include: { person: true, systemRole: true },
    });

    const passwordValid = user ? await verifyPassword(user.passwordHash, input.password) : false;
    const accountUsable =
      !!user && user.isEnabled && user.person.isActive && !user.person.deletedAt && user.systemRole.isActive;

    if (!user || !passwordValid || !accountUsable) {
      await recordLoginFailure(ip, input.username);
      await recordAudit(baseAudit, {
        module: "security",
        eventType: "login.failed",
        action: "Failed sign in",
        outcome: "FAILURE",
      });
      // Generic error regardless of the failing check (Doc 05 Ch2).
      throw new AuthenticationError();
    }

    if (maintenance.enabled && user.systemRole.key !== "SYSTEM_ADMINISTRATOR") {
      throw new AuthenticationError(
        maintenance.message || "The system is currently under maintenance. Please try again later.",
      );
    }

    await resetLoginThrottle(ip, input.username);
    // Session regeneration: any pre-existing cookie session is replaced.
    await destroyCurrentSession().catch(() => undefined);
    await createSession(user.id);
    await db.systemUser.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    await recordAudit(
      {
        ...baseAudit,
        actorUserId: user.id,
        actorPersonId: user.personId,
        companyId: user.person.companyId,
      },
      {
        module: "security",
        eventType: "login.succeeded",
        action: "Signed in",
        targetType: "system_user",
        targetId: user.id,
        targetLabel: user.username,
      },
    );
    return ok({ redirectTo: "/dashboard" });
  } catch (error) {
    return toActionError(error);
  }
}

export async function logoutAction(): Promise<void> {
  const user = await getCurrentUser();
  if (user) {
    await recordAudit(
      {
        actorUserId: user.userId,
        actorPersonId: user.personId,
        actorLabel: user.username,
        companyId: user.companyId,
      },
      {
        module: "security",
        eventType: "logout",
        action: "Signed out",
        targetType: "system_user",
        targetId: user.userId,
        targetLabel: user.username,
      },
    );
  }
  await destroyCurrentSession();
  redirect("/login");
}

const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Current password is required."),
    newPassword: z.string().min(1, "New password is required."),
    confirmPassword: z.string().min(1, "Please confirm the new password."),
  })
  .strict();

export async function changeOwnPasswordAction(raw: unknown): Promise<ActionResult<undefined>> {
  try {
    const user = await getCurrentUser();
    if (!user) throw new AuthenticationError("Your session has expired. Please sign in again.");
    const input = parse(changePasswordSchema, raw);
    if (input.newPassword !== input.confirmPassword) {
      throw new ValidationError(undefined, { confirmPassword: "Passwords do not match." });
    }
    const record = await db.systemUser.findUnique({ where: { id: user.userId } });
    if (!record || !(await verifyPassword(record.passwordHash, input.currentPassword))) {
      throw new ValidationError(undefined, { currentPassword: "Current password is incorrect." });
    }
    const policy = await getSetting<PasswordPolicy>(SETTING_KEYS.PASSWORD_POLICY);
    const problems = validatePasswordAgainstPolicy(input.newPassword, policy);
    if (problems.length > 0) {
      throw new ValidationError(undefined, { newPassword: problems.join(" ") });
    }
    const passwordHash = await hashPassword(input.newPassword);
    await db.$transaction(async (tx) => {
      await tx.systemUser.update({
        where: { id: user.userId },
        data: { passwordHash, passwordChangedAt: new Date() },
      });
      // Keep only the current session alive.
      await tx.session.updateMany({
        where: { systemUserId: user.userId, revokedAt: null, id: { not: user.sessionId } },
        data: { revokedAt: new Date() },
      });
      await recordAudit(
        {
          actorUserId: user.userId,
          actorPersonId: user.personId,
          actorLabel: user.username,
          companyId: user.companyId,
        },
        {
          module: "security",
          eventType: "password.changed",
          action: "Changed own password",
          targetType: "system_user",
          targetId: user.userId,
          targetLabel: user.username,
        },
        tx,
      );
    });
    return ok(undefined);
  } catch (error) {
    return toActionError(error);
  }
}
