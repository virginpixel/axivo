import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { getCurrentUser, getClientIp } from "@/shared/auth/session";
import { exportBudget } from "@/modules/budgets/service";
import { AppError } from "@/shared/errors";

/** A budget's lines as a workbook: what the page shows, month by month for OPEX (SDS Doc 25). */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (!user.permissions.has("budgets.view")) return NextResponse.json({ error: "You cannot see budgets." }, { status: 403 });
  const { id } = await params;
  const url = new URL(request.url);
  const requestHeaders = await headers();
  try {
    const { name, buffer } = await exportBudget(
      {
        actorUserId: user.userId,
        actorPersonId: user.personId,
        actorLabel: user.username,
        companyId: user.companyId,
        ipAddress: getClientIp(requestHeaders),
        userAgent: requestHeaders.get("user-agent")?.slice(0, 512) ?? null,
      },
      id,
      url.searchParams.get("company") || undefined,
      url.searchParams.get("q") || undefined,
    );
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${name}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    if (error instanceof AppError) return NextResponse.json({ error: error.message }, { status: error.kind === "not_found" ? 404 : 400 });
    console.error("[axivo] Budget export failed:", error);
    return NextResponse.json({ error: "Export failed." }, { status: 500 });
  }
}
