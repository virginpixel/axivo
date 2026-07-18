import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { db } from "@/shared/db";
import { getCurrentUser, getClientIp } from "@/shared/auth/session";
import { recordAudit } from "@/shared/audit/audit";
import { buildAuditCsv, buildAuditXlsx } from "@/modules/audit/export";
import type { Prisma } from "@prisma/client";

/** Audit log export (SDS Doc 16 Ch6): CSV/XLSX, permission-gated and audited. */
export async function GET(request: Request): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (!user.permissions.has("audit.export")) {
    return NextResponse.json({ error: "Permission denied." }, { status: 403 });
  }

  const url = new URL(request.url);
  const format = url.searchParams.get("format") === "xlsx" ? "xlsx" : "csv";
  const moduleFilter = url.searchParams.get("module") ?? undefined;
  const eventType = url.searchParams.get("eventType") ?? undefined;
  const actor = url.searchParams.get("actor") ?? undefined;
  const from = url.searchParams.get("from") ?? undefined;
  const to = url.searchParams.get("to") ?? undefined;

  const isGlobalAdmin = user.systemRoleKey === "SYSTEM_ADMINISTRATOR";
  const where: Prisma.AuditEventWhereInput = {
    ...(isGlobalAdmin ? {} : { OR: [{ companyId: user.companyId }, { companyId: null }] }),
    ...(moduleFilter ? { module: moduleFilter } : {}),
    ...(eventType ? { eventType: { contains: eventType, mode: "insensitive" } } : {}),
    ...(actor ? { actorLabel: { contains: actor, mode: "insensitive" } } : {}),
    ...(from || to
      ? {
          occurredAt: {
            ...(from ? { gte: new Date(from) } : {}),
            ...(to ? { lte: new Date(`${to}T23:59:59.999Z`) } : {}),
          },
        }
      : {}),
  };

  const events = await db.auditEvent.findMany({
    where,
    orderBy: { occurredAt: "desc" },
    take: 10000,
  });

  const requestHeaders = await headers();
  const meta = {
    exportedBy: user.username,
    exportedAt: new Date(),
    filters: Object.fromEntries(
      Object.entries({ module: moduleFilter, eventType, actor, from, to }).filter(
        (entry): entry is [string, string] => entry[1] !== undefined,
      ),
    ),
  };
  await recordAudit(
    {
      actorUserId: user.userId,
      actorPersonId: user.personId,
      actorLabel: user.username,
      companyId: user.companyId,
      ipAddress: getClientIp(requestHeaders),
      userAgent: requestHeaders.get("user-agent")?.slice(0, 512) ?? null,
    },
    {
      module: "audit",
      eventType: "audit.exported",
      action: `Exported ${events.length} audit event(s) as ${format.toUpperCase()}`,
      details: meta.filters,
    },
  );

  const fileStamp = meta.exportedAt.toISOString().slice(0, 10);
  if (format === "xlsx") {
    const buffer = await buildAuditXlsx(events, meta);
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="axivo-audit-${fileStamp}.xlsx"`,
        "Cache-Control": "private, no-store",
      },
    });
  }
  const csv = buildAuditCsv(events, meta);
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="axivo-audit-${fileStamp}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
