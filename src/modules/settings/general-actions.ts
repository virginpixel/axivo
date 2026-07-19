"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/shared/auth/guard";
import { ok, toActionError, type ActionResult } from "@/shared/errors";
import { parseInput as parse } from "@/shared/validation/common";
import { getSetting, setSetting, SETTING_KEYS } from "@/shared/settings/settings";

const timezoneSchema = z.string().trim().min(1).max(100);

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
    revalidatePath("/settings");
    return ok(undefined);
  } catch (error) {
    return toActionError(error);
  }
}
