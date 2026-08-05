"use server";

import { requirePermission } from "@/shared/auth/guard";
import { recordAudit } from "@/shared/audit/audit";
import { ok, toActionError, type ActionResult } from "@/shared/errors";
import {
  getUpdateProgress,
  getUpdateStatus,
  requestUpdate,
  type UpdateProgress,
  type UpdateStatus,
} from "./service";

/** Check GitHub for the latest release and whether an update is available. */
export async function checkForUpdatesAction(): Promise<ActionResult<UpdateStatus>> {
  try {
    await requirePermission("settings.manage");
    return ok(await getUpdateStatus());
  } catch (error) {
    return toActionError(error);
  }
}

/** Read the running update's progress from the host agent (System Admin only). */
export async function updateProgressAction(): Promise<ActionResult<UpdateProgress>> {
  try {
    await requirePermission("settings.manage");
    return ok(await getUpdateProgress());
  } catch (error) {
    return toActionError(error);
  }
}

/** Apply an update to the given version via the host agent (System Admin only). */
export async function applyUpdateAction(version: string): Promise<ActionResult<undefined>> {
  try {
    const { audit } = await requirePermission("settings.manage");
    await requestUpdate(version);
    await recordAudit(audit, {
      module: "settings",
      eventType: "system.update_requested",
      action: `Requested software update to ${version}`,
    });
    return ok(undefined);
  } catch (error) {
    return toActionError(error);
  }
}
