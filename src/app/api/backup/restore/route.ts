import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { getCurrentUser, getClientIp } from "@/shared/auth/session";
import { recordAudit } from "@/shared/audit/audit";
import { restoreBackup } from "@/modules/backup/service";
import { BusinessRuleError } from "@/shared/errors";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Restore a full data backup from an uploaded .axivo file (SDS Doc 17 Ch7).
 * Destructive: replaces ALL current data. System Administrators only. Everyone
 * is signed out afterwards (sessions are cleared during the restore).
 */
export async function POST(request: Request): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  // Restore wipes the whole database, so it is limited to full System
  // Administrators, not merely holders of the backup permission.
  if (user.systemRoleKey !== "SYSTEM_ADMINISTRATOR") {
    return NextResponse.json({ error: "Only System Administrators may restore." }, { status: 403 });
  }

  const requestHeaders = await headers();
  const audit = {
    actorUserId: user.userId,
    actorPersonId: user.personId,
    actorLabel: user.username,
    actorName: user.displayName,
    companyId: user.companyId,
    ipAddress: getClientIp(requestHeaders),
    userAgent: requestHeaders.get("user-agent")?.slice(0, 512) ?? null,
    correlationId: crypto.randomUUID(),
  };

  let archive: Buffer;
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No backup file was provided." }, { status: 400 });
    }
    archive = Buffer.from(await file.arrayBuffer());
  } catch {
    return NextResponse.json({ error: "Could not read the uploaded file." }, { status: 400 });
  }

  try {
    // Audit the intent BEFORE wiping, since the restore replaces the audit log
    // itself with the backup's contents.
    await recordAudit(audit, {
      module: "system",
      eventType: "backup.restore_started",
      action: "Started restoring data from a backup file",
    });
    const summary = await restoreBackup(archive);
    return NextResponse.json({ ok: true, summary });
  } catch (error) {
    const message =
      error instanceof BusinessRuleError
        ? error.message
        : "The restore failed. No changes were applied.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
