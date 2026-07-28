import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { getCurrentUser, getClientIp } from "@/shared/auth/session";
import { recordAudit } from "@/shared/audit/audit";
import { getReport } from "@/modules/reports/definitions";
import { createZip, safeEntryName } from "@/shared/zip";

/** Ticking more than this many rows would tie the request up rendering PDFs. */
const MAX_BUNDLE_SIZE = 100;

/**
 * Bulk evidence download: one PDF per selected row, zipped. Auditors sample a
 * handful of requests at a time, and clicking each row's download link in turn
 * is the part of that job nobody should have to do by hand.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ key: string }> },
): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (!user.permissions.has("reports.export")) {
    return NextResponse.json({ error: "Permission denied." }, { status: 403 });
  }
  const { key } = await params;
  const report = getReport(key);
  if (!report?.bundle) return NextResponse.json({ error: "Report not found." }, { status: 404 });

  const url = new URL(request.url);
  const ids = (url.searchParams.get("ids") ?? "").split(",").filter(Boolean);
  if (ids.length === 0) return NextResponse.json({ error: "Select at least one row." }, { status: 400 });
  if (ids.length > MAX_BUNDLE_SIZE) {
    return NextResponse.json(
      { error: `Select at most ${MAX_BUNDLE_SIZE} rows, or use the CSV export instead.` },
      { status: 400 },
    );
  }

  const requestHeaders = await headers();
  const context = {
    actorUserId: user.userId,
    actorPersonId: user.personId,
    actorLabel: user.username,
    companyId: user.companyId,
    ipAddress: getClientIp(requestHeaders),
    userAgent: requestHeaders.get("user-agent")?.slice(0, 512) ?? null,
  };

  const files = await report.bundle(user, context, ids);
  if (files.length === 0) return NextResponse.json({ error: "Nothing to download." }, { status: 404 });

  // Two rows can produce the same filename, and a ZIP with duplicates confuses
  // extractors, so suffix the repeats.
  const used = new Map<string, number>();
  const zip = createZip(
    files.map((file) => {
      const base = safeEntryName(file.fileName);
      const seen = used.get(base) ?? 0;
      used.set(base, seen + 1);
      const name = seen === 0 ? base : base.replace(/(\.[^.]+)?$/, (extension) => `_${seen + 1}${extension}`);
      return { name, data: file.data };
    }),
  );

  await recordAudit(context, {
    module: "reports",
    eventType: "report.exported",
    action: `Downloaded ${files.length} document(s) from report "${report.name}" as a ZIP`,
    targetType: "report",
    targetLabel: report.key,
  });

  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(new Uint8Array(zip), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="axivo-${report.key}-${stamp}.zip"`,
      "Cache-Control": "private, no-store",
    },
  });
}
