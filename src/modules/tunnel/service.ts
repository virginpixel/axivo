import { BusinessRuleError } from "@/shared/errors";
import type { AuditContext } from "@/shared/audit/audit";
import { getSetting, setSetting, SETTING_KEYS } from "@/shared/settings/settings";
import type { TunnelEnableInput } from "./validators";

/**
 * Cloudflare Tunnel remote access (self-host productization). Turning the tunnel
 * on/off is a host-level operation (start/stop the `cloudflared` container, swap
 * the Caddy config to HTTPS), so it is delegated to the privileged host agent.
 * The app only stores the on/off state + hostname; the secrets (connector token,
 * API token) are written straight to the host .env by the agent and never kept
 * in the database.
 */

interface TunnelSetting {
  enabled: boolean;
  hostname: string;
}

export interface TunnelStatus {
  enabled: boolean;
  hostname: string;
  /** Whether the host agent is wired up (the tunnel can actually be toggled). */
  available: boolean;
}

export async function getTunnelStatus(): Promise<TunnelStatus> {
  const setting = await getSetting<TunnelSetting>(SETTING_KEYS.TUNNEL);
  return {
    enabled: !!setting.enabled,
    hostname: setting.hostname ?? "",
    available: !!process.env.AGENT_SECRET,
  };
}

/** POST to the host agent, translating transport/HTTP failures into user errors. */
async function callAgent(path: string, body: Record<string, unknown> = {}): Promise<void> {
  const secret = process.env.AGENT_SECRET;
  const url = process.env.AGENT_URL || "http://agent:8099";
  if (!secret) {
    throw new BusinessRuleError("Remote access is not available on this deployment.");
  }
  let res: Response;
  try {
    res = await fetch(`${url}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-agent-secret": secret },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20000),
    });
  } catch {
    throw new BusinessRuleError("Could not reach the host agent.");
  }
  if (res.status === 409) {
    throw new BusinessRuleError("A host task is already running. Try again in a moment.");
  }
  if (!res.ok) {
    let message = "The host agent rejected the request.";
    try {
      const data = (await res.json()) as { error?: string };
      if (data.error) message = data.error;
    } catch {
      /* keep the default */
    }
    throw new BusinessRuleError(message);
  }
}

/**
 * Enable remote access: hand the tokens to the agent (which writes them to .env,
 * swaps Caddy to HTTPS, and starts cloudflared), then record the on state. The
 * agent runs the switch in the background, so this returns once it is accepted.
 */
export async function enableTunnel(context: AuditContext, input: TunnelEnableInput): Promise<void> {
  await callAgent("/tunnel/enable", {
    domain: input.domain,
    token: input.tunnelToken,
    apiToken: input.apiToken,
    email: input.email,
  });
  await setSetting(context, {
    key: SETTING_KEYS.TUNNEL,
    value: { enabled: true, hostname: input.domain },
    category: "system",
    description: "Cloudflare Tunnel remote access",
  });
}

/** Disable remote access: stop the tunnel, return the proxy to local HTTP. */
export async function disableTunnel(context: AuditContext): Promise<void> {
  await callAgent("/tunnel/disable");
  await setSetting(context, {
    key: SETTING_KEYS.TUNNEL,
    value: { enabled: false, hostname: "" },
    category: "system",
    description: "Cloudflare Tunnel remote access",
  });
}
