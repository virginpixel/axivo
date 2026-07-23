"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/shared/auth/guard";
import { ok, toActionError, type ActionResult } from "@/shared/errors";
import { parseInput as parse } from "@/shared/validation/common";
import { getSetting, setSetting, SETTING_KEYS } from "@/shared/settings/settings";
import { invalidateRuntimeConfig } from "@/shared/settings/runtime";

const timezoneSchema = z.string().trim().min(1).max(100);

const baseUrlSchema = z
  .string()
  .trim()
  .url("Enter a full URL, for example http://127.0.0.1:8080")
  .max(300);

/**
 * Save the public base URL used in emails and public form links. Overrides the
 * APP_URL environment variable so it can be corrected without redeploying.
 */
export async function setPublicBaseUrlAction(raw: unknown): Promise<ActionResult<undefined>> {
  try {
    const { audit } = await requirePermission("settings.manage");
    const baseUrl = parse(baseUrlSchema, raw).replace(/\/+$/, "");
    const general = await getSetting<Record<string, unknown>>(SETTING_KEYS.GENERAL);
    await setSetting(audit, {
      key: SETTING_KEYS.GENERAL,
      value: { ...general, publicBaseUrl: baseUrl } as never,
      category: "general",
      description: "General regional settings",
    });
    invalidateRuntimeConfig();
    revalidatePath("/", "layout");
    return ok(undefined);
  } catch (error) {
    return toActionError(error);
  }
}

/** Save the platform default timezone (Settings → General). */
export async function setSettingTimezoneAction(raw: unknown): Promise<ActionResult<undefined>> {
  try {
    const { audit } = await requirePermission("settings.manage");
    const timezone = parse(timezoneSchema, raw);
    // Validate against the runtime's IANA timezone database.
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: timezone });
    } catch {
      throw new Error("Unknown timezone.");
    }
    const general = await getSetting<Record<string, unknown>>(SETTING_KEYS.GENERAL);
    await setSetting(audit, {
      key: SETTING_KEYS.GENERAL,
      value: { ...general, defaultTimezone: timezone } as never,
      category: "general",
      description: "General regional settings",
    });
    invalidateRuntimeConfig();
    revalidatePath("/", "layout");
    return ok(undefined);
  } catch (error) {
    return toActionError(error);
  }
}
