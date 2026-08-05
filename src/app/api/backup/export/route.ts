import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { getCurrentUser, getClientIp } from "@/shared/auth/session";
import { recordAudit } from "@/shared/audit/audit";
import { createBackup } from "@/modules/backup/service";

export const dynamic = "force-dynamic";
// A backup streams the whole dataset; give it room to build.
export const maxDuration = 300;

/** Download a full data backup as a .axivo file (SDS Doc 17 Ch7). */
export async function GET(): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (!user.permissions.has("settings.backup.manage")) {
    return NextResponse.json({ error: "Permission denied." }, { status: 403 });
  }

  const archive = await createBackup();
  const requestHeaders = await headers();
  await recordAudit(
    {
      actorUserId: user.userId,
      actorPersonId: user.personId,
      actorLabel: user.username,
      actorName: user.displayName,
      companyId: user.companyId,
      ipAddress: getClientIp(requestHeaders),
      userAgent: requestHeaders.get("user-agent")?.slice(0, 512) ?? null,
      correlationId: crypto.randomUUID(),
    },
    {
      module: "system",
      eventType: "backup.created",
      action: "Downloaded a full data backup",
    },
  );

  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(new Uint8Array(archive), {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename="axivo-backup-${stamp}.axivo"`,
      "Content-Length": String(archive.length),
      "Cache-Control": "no-store",
    },
  });
}
