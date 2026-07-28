import { NextResponse } from "next/server";
import { requirePermission } from "@/shared/auth/guard";
import { buildRequestEvidencePdf } from "@/modules/requests/evidence-pdf";

/**
 * Per-request evidence PDF (SDS Doc 09 Ch9, Doc 16). `?inline=1` renders it in
 * the browser tab instead of downloading, which is what the reports eye button
 * uses.
 */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { user } = await requirePermission("requests.view");
  const { id } = await context.params;

  const pdf = await buildRequestEvidencePdf(user, id);
  if (!pdf) return new NextResponse("Not found", { status: 404 });

  const inline = new URL(request.url).searchParams.get("inline") === "1";
  return new NextResponse(new Uint8Array(pdf.data), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${pdf.fileName}"`,
      "Cache-Control": "no-store",
    },
  });
}
