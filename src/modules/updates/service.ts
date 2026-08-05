import { BusinessRuleError } from "@/shared/errors";

/**
 * Software updates (self-host productization). The app reads its own running
 * version from AXIVO_VERSION (baked into the image at release) and compares it
 * to the latest GitHub release. Applying an update is delegated to the
 * privileged host agent, which the app reaches only over the internal network
 * with a shared secret.
 */

const REPO = process.env.AXIVO_REPO || "virginpixel/axivo";

export interface UpdateStatus {
  currentVersion: string;
  latestVersion: string | null;
  updateAvailable: boolean;
  releaseUrl: string | null;
  checkedAt: string;
  error: string | null;
  /** Whether the host agent is wired up (updates can actually be applied). */
  updaterAvailable: boolean;
}

function parseSemver(v: string): [number, number, number] | null {
  const m = /^v?(\d+)\.(\d+)\.(\d+)/.exec(v.trim());
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

/** True when `latest` is a strictly higher semver than `current`. */
export function isNewerVersion(latest: string, current: string): boolean {
  const l = parseSemver(latest);
  const c = parseSemver(current);
  if (!l) return false;
  if (!c) return true; // a dev/unknown build: offer the released version
  const [lMajor, lMinor, lPatch] = l;
  const [cMajor, cMinor, cPatch] = c;
  if (lMajor !== cMajor) return lMajor > cMajor;
  if (lMinor !== cMinor) return lMinor > cMinor;
  return lPatch > cPatch;
}

/** Look up the running and latest versions and whether an update is available. */
export async function getUpdateStatus(): Promise<UpdateStatus> {
  const currentVersion = process.env.AXIVO_VERSION || "dev";
  const updaterAvailable = !!process.env.AGENT_SECRET;
  const base: UpdateStatus = {
    currentVersion,
    latestVersion: null,
    updateAvailable: false,
    releaseUrl: null,
    checkedAt: new Date().toISOString(),
    error: null,
    updaterAvailable,
  };
  try {
    const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
      headers: { Accept: "application/vnd.github+json", "User-Agent": "axivo" },
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      return { ...base, error: `Could not check for updates (GitHub returned ${res.status}).` };
    }
    const data = (await res.json()) as { tag_name?: string; html_url?: string };
    const latestVersion = data.tag_name ?? null;
    return {
      ...base,
      latestVersion,
      releaseUrl: data.html_url ?? null,
      updateAvailable: !!latestVersion && isNewerVersion(latestVersion, currentVersion),
    };
  } catch {
    return { ...base, error: "Could not reach GitHub to check for updates." };
  }
}

export interface UpdateProgress {
  /** The version the running web container reports (changes once it restarts). */
  currentVersion: string;
  /** Whether the agent's update task is still running. */
  running: boolean;
  /** The agent task log so far (used to derive the current step). */
  log: string;
}

/**
 * Read the in-flight update's progress from the host agent. The web container
 * itself is recreated near the end of an update, so while it is down this call
 * fails from the browser - the client treats that as the "restarting" phase and
 * keeps polling until the app answers again on the new version.
 */
export async function getUpdateProgress(): Promise<UpdateProgress> {
  const currentVersion = process.env.AXIVO_VERSION || "dev";
  const secret = process.env.AGENT_SECRET;
  const url = process.env.AGENT_URL || "http://agent:8099";
  if (!secret) return { currentVersion, running: false, log: "" };
  let res: Response;
  try {
    res = await fetch(`${url}/status`, {
      headers: { "x-agent-secret": secret },
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    throw new BusinessRuleError("Could not reach the update agent.");
  }
  if (!res.ok) throw new BusinessRuleError("Could not read the update status.");
  const data = (await res.json()) as { running?: boolean; log?: string };
  return { currentVersion, running: !!data.running, log: data.log ?? "" };
}

/**
 * Ask the host agent to update to a version. Returns once the update has been
 * accepted (it then runs in the background and the app restarts on the new
 * version), not when it finishes.
 */
export async function requestUpdate(version: string): Promise<void> {
  const secret = process.env.AGENT_SECRET;
  const url = process.env.AGENT_URL || "http://agent:8099";
  if (!secret) {
    throw new BusinessRuleError("The updater is not available on this deployment.");
  }
  if (!/^(v?\d+\.\d+\.\d+|latest)$/.test(version)) {
    throw new BusinessRuleError("Invalid version.");
  }
  let res: Response;
  try {
    res = await fetch(`${url}/update`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-agent-secret": secret },
      body: JSON.stringify({ version }),
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new BusinessRuleError("Could not reach the update agent.");
  }
  if (res.status === 409) {
    throw new BusinessRuleError("An update is already in progress.");
  }
  if (!res.ok) {
    throw new BusinessRuleError("The update agent rejected the request.");
  }
}
