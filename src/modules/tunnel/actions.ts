"use server";

import { requirePermission } from "@/shared/auth/guard";
import { recordAudit } from "@/shared/audit/audit";
import { ok, toActionError, type ActionResult } from "@/shared/errors";
import { parseInput } from "@/shared/validation/common";
import { disableTunnel, enableTunnel, getTunnelStatus, type TunnelStatus } from "./service";
import { tunnelEnableSchema } from "./validators";

/** Current remote-access state (System Admin only). */
export async function getTunnelStatusAction(): Promise<ActionResult<TunnelStatus>> {
  try {
    await requirePermission("settings.manage");
    return ok(await getTunnelStatus());
  } catch (error) {
    return toActionError(error);
  }
}

/** Turn on Cloudflare Tunnel remote access via the host agent. */
export async function enableTunnelAction(raw: unknown): Promise<ActionResult<undefined>> {
  try {
    const { audit } = await requirePermission("settings.manage");
    const input = parseInput(tunnelEnableSchema, raw);
    await enableTunnel(audit, input);
    await recordAudit(audit, {
      module: "settings",
      eventType: "system.tunnel_enabled",
      action: `Enabled remote access at ${input.domain}`,
    });
    return ok(undefined);
  } catch (error) {
    return toActionError(error);
  }
}

/** Turn off remote access and return the proxy to local HTTP. */
export async function disableTunnelAction(): Promise<ActionResult<undefined>> {
  try {
    const { audit } = await requirePermission("settings.manage");
    await disableTunnel(audit);
    await recordAudit(audit, {
      module: "settings",
      eventType: "system.tunnel_disabled",
      action: "Disabled remote access",
    });
    return ok(undefined);
  } catch (error) {
    return toActionError(error);
  }
}
