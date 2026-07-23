import "server-only";
import { headers } from "next/headers";
import { getCurrentUser, getClientIp, type AuthenticatedUser } from "@/shared/auth/session";
import type { Permission } from "@/shared/auth/permissions";
import { AuthenticationError, AuthorizationError } from "@/shared/errors";
import type { AuditContext } from "@/shared/audit/audit";
import { recordAudit } from "@/shared/audit/audit";
import { loadRuntimeConfig } from "@/shared/settings/runtime";

/**
 * Authorization guards for server actions (SDS Doc 05 Ch3).
 * Every protected operation: verify session → verify permission → verify
 * company scope → execute → audit. Deny by default; denials are audited.
 */

export interface ActionContext {
  user: AuthenticatedUser;
  audit: AuditContext;
}

export async function requireUser(): Promise<ActionContext> {
  const user = await getCurrentUser();
  if (!user) {
    throw new AuthenticationError("Your session has expired. Please sign in again.");
  }
  // Warm the org timezone / base URL before anything renders or builds links.
  await loadRuntimeConfig();
  const requestHeaders = await headers();
  return {
    user,
    audit: {
      actorUserId: user.userId,
      actorPersonId: user.personId,
      actorLabel: user.username,
      companyId: user.companyId,
      ipAddress: getClientIp(requestHeaders),
      userAgent: requestHeaders.get("user-agent")?.slice(0, 512) ?? null,
      correlationId: crypto.randomUUID(),
    },
  };
}

export async function requirePermission(...permissions: Permission[]): Promise<ActionContext> {
  const context = await requireUser();
  const granted = permissions.some((permission) => context.user.permissions.has(permission));
  if (!granted) {
    await recordAudit(context.audit, {
      module: "security",
      eventType: "authorization.denied",
      action: `Permission denied: ${permissions.join(", ")}`,
      outcome: "DENIED",
    });
    throw new AuthorizationError();
  }
  return context;
}

/** Anonymous audit context for public (unauthenticated) endpoints. */
export async function publicAuditContext(actorLabel: string): Promise<AuditContext> {
  const requestHeaders = await headers();
  return {
    actorLabel,
    ipAddress: getClientIp(requestHeaders),
    userAgent: requestHeaders.get("user-agent")?.slice(0, 512) ?? null,
    correlationId: crypto.randomUUID(),
  };
}
