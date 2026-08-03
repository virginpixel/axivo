"use server";

import { db } from "@/shared/db";
import { createSession } from "@/shared/auth/session";
import { ok, toActionError, type ActionResult } from "@/shared/errors";
import { parseInput as parse } from "@/shared/validation/common";
import { setupSchema } from "./validators";
import { completeSetup } from "./service";

/**
 * Complete first-run setup: create the organization + founding administrator,
 * then sign them straight in. Guarded server-side so it is inert once a user
 * exists.
 */
export async function completeSetupAction(raw: unknown): Promise<ActionResult<{ redirectTo: string }>> {
  try {
    const input = parse(setupSchema, raw);
    const { systemUserId } = await completeSetup(input);
    await createSession(systemUserId);
    await db.systemUser.update({
      where: { id: systemUserId },
      data: { lastLoginAt: new Date() },
    });
    return ok({ redirectTo: "/dashboard" });
  } catch (error) {
    return toActionError(error);
  }
}
