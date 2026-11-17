import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { getCurrentUser, getClientIp } from "@/shared/auth/session";
import { readBackup } from "@/modules/infrastructure/config-backup";
import { AppError } from "@/shared/errors";
import { db } from "@/shared/db";
import { appTimeZone } from "@/shared/settings/runtime";

/**
 * Download one saved device configuration as a text file (SDS Doc 24).
 * Session-gated, needs the right to view configurations, company-isolated and
 * audited: the file holds the device's keys and password hashes.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (!user.permissions.has("infrastructure.configs.view")) {
    return NextResponse.json({ error: "You do not have permission to download configurations." }, { status: 403 });
  }
  const { id } = await params;
  const backup = await db.infraConfigBackup.findUnique({ where: { id }, select: { deviceId: true } }).catch(() => null);
  if (!backup) return NextResponse.json({ error: "Saved configuration not found." }, { status: 404 });

  const requestHeaders = await headers();
  try {
    const result = await readBackup(
      {
        audit: {
          actorUserId: user.userId,
          actorPersonId: user.personId,
          actorLabel: user.username,
          companyId: user.companyId,
          ipAddress: getClientIp(requestHeaders),
          userAgent: requestHeaders.get("user-agent")?.slice(0, 512) ?? null,
        },
        companyId: user.companyId,
        isGlobalAdmin: user.systemRoleKey === "SYSTEM_ADMINISTRATOR",
      },
      backup.deviceId,
      id,
      "download",
    );
    // Named in local time, so it matches the time shown on the page.
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: await appTimeZone(),
      year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    }).formatToParts(result.backup.takenAt);
    const part = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
    const stamp = `${part("year")}-${part("month")}-${part("day")}_${part("hour")}${part("minute")}`;
    const name = `${(result.device.hostname || result.device.name).replace(/[^\w.-]+/g, "_")}_${stamp}.txt`;
    const body = result.content.endsWith("\n") ? result.content : `${result.content}\n`;
    return new Response(body, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Content-Disposition": `attachment; filename="${name}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    if (error instanceof AppError) {
      const status = error.kind === "not_found" ? 404 : error.kind === "authorization" ? 403 : 400;
      return NextResponse.json({ error: error.message }, { status });
    }
    console.error("[axivo] Configuration download failed:", error);
    return NextResponse.json({ error: "Download failed." }, { status: 500 });
  }
}
