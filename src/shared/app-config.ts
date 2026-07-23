/**
 * Process-wide runtime configuration that formatting helpers need synchronously
 * (org timezone, public base URL). Deliberately free of server-only imports so
 * that `shared/utils` stays safe to bundle for the client.
 *
 * The values are populated on the server by `loadRuntimeConfig()` (see
 * `shared/settings/runtime.ts`), which every authorized request warms up.
 */

let appTimeZone = "UTC";
let appBaseUrl = "";

export function setAppTimeZone(timeZone: string): void {
  if (timeZone) appTimeZone = timeZone;
}

export function getAppTimeZone(): string {
  return appTimeZone;
}

export function setAppBaseUrl(baseUrl: string): void {
  if (baseUrl) appBaseUrl = baseUrl.replace(/\/+$/, "");
}

export function getAppBaseUrl(): string {
  return appBaseUrl;
}

/** Short zone label for a timezone, e.g. "GMT+5". */
export function timeZoneLabel(timeZone: string = appTimeZone): string {
  try {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "shortOffset" }).formatToParts(new Date());
    return parts.find((part) => part.type === "timeZoneName")?.value ?? timeZone;
  } catch {
    return timeZone;
  }
}
