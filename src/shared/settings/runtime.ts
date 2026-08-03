import { env } from "@/shared/env";
import { setAppBaseUrl, setAppTimeZone, getAppBaseUrl, getAppTimeZone } from "@/shared/app-config";
import { getSetting, SETTING_KEYS } from "./settings";

/**
 * Loads the org-wide runtime settings (timezone, public base URL) into the
 * process-level config that synchronous helpers read. Warmed at the start of
 * every authorized request, so formatting and link building always reflect the
 * current Settings values without threading them through every call site.
 */

const TTL_MS = 30_000;
let loadedAt = 0;
let inflight: Promise<void> | null = null;

async function load(): Promise<void> {
  const general = await getSetting<{ defaultTimezone?: string }>(SETTING_KEYS.GENERAL);
  setAppTimeZone(general.defaultTimezone?.trim() || "UTC");
  // The base URL is fixed by the deployment (APP_URL, set at install and
  // switched to the public hostname when the tunnel is enabled), not editable
  // in-app: a wrong value here would break every emailed link.
  setAppBaseUrl(env().APP_URL);
  loadedAt = Date.now();
}

export async function loadRuntimeConfig(force = false): Promise<void> {
  if (!force && loadedAt && Date.now() - loadedAt < TTL_MS) return;
  if (inflight) return inflight;
  inflight = load()
    .catch(() => {
      // Never block a request on settings; fall back to the env value.
      setAppBaseUrl(env().APP_URL);
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

/** Force a reload on the next read (called after saving general settings). */
export function invalidateRuntimeConfig(): void {
  loadedAt = 0;
}

/** Public base URL, loading it first if the cache is cold. */
export async function publicBaseUrl(): Promise<string> {
  await loadRuntimeConfig();
  return getAppBaseUrl() || env().APP_URL.replace(/\/+$/, "");
}

/** Org timezone, loading it first if the cache is cold. */
export async function appTimeZone(): Promise<string> {
  await loadRuntimeConfig();
  return getAppTimeZone();
}
