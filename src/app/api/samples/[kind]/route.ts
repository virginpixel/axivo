import { NextResponse } from "next/server";
import { getCurrentUser } from "@/shared/auth/session";
import { buildSample, SAMPLE_KINDS, type SampleKind } from "@/modules/samples/samples";

/** A sample file for one of the spreadsheet imports, with the headings it reads. */
export async function GET(_request: Request, { params }: { params: Promise<{ kind: string }> }): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { kind } = await params;
  if (!SAMPLE_KINDS.includes(kind as SampleKind)) return NextResponse.json({ error: "No such sample." }, { status: 404 });
  const needs = kind === "opex" || kind === "capex" ? "budgets.manage" : "infrastructure.manage";
  if (!user.permissions.has(needs)) return NextResponse.json({ error: "You cannot import these." }, { status: 403 });
  const { file, buffer } = await buildSample(kind as SampleKind);
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${file}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
