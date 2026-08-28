import { NextResponse } from "next/server";
import { requirePermission } from "@/shared/auth/guard";
import { renderHandoverPreview } from "@/modules/assets/service";

/**
 * The handover form for a set of the employee's assignments, rendered on the
 * fly. Nothing is stored: a handover is only recorded in Documents once it is
 * actually sent, so reviewing one never leaves a stray form behind.
 */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  await requirePermission("assets.assignments.manage");
  const { id } = await context.params;
  const assignmentIds = (new URL(request.url).searchParams.get("assignments") ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (assignmentIds.length === 0) return new NextResponse("No assets selected", { status: 400 });

  const pdf = await renderHandoverPreview(id, assignmentIds);
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": 'inline; filename="handover-preview.pdf"',
      "Cache-Control": "no-store",
    },
  });
}
