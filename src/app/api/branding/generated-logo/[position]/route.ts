import { NextResponse } from "next/server";
import { getCurrentUser } from "@/shared/auth/session";
import { getSetting, SETTING_KEYS } from "@/shared/settings/settings";
import { storage } from "@/shared/storage/storage";

/** Preview of a generated-document logo (session-gated; used in Settings). */
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ position: string }> }): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { position } = await params;
  const logos = await getSetting<Record<string, { storageKey: string; mime: string } | null>>(SETTING_KEYS.GENERATED_LOGOS);
  const logo = logos[position];
  if (!logo?.storageKey) return NextResponse.json({ error: "No logo." }, { status: 404 });
  try {
    const content = await storage.read(logo.storageKey);
    return new Response(new Uint8Array(content), {
      headers: { "Content-Type": logo.mime ?? "image/png", "Cache-Control": "private, max-age=60" },
    });
  } catch {
    return NextResponse.json({ error: "Logo not available." }, { status: 404 });
  }
}
