import { NextResponse } from "next/server";
import { getSetting, SETTING_KEYS } from "@/shared/settings/settings";
import { storage } from "@/shared/storage/storage";

/**
 * Logo shown in the header of public request forms. Public request forms are
 * unauthenticated, so these are served without a session (like the login logo).
 */
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ position: string }> }): Promise<Response> {
  const { position } = await params;
  if (!["left", "center", "right"].includes(position)) {
    return NextResponse.json({ error: "Invalid position." }, { status: 400 });
  }
  const logos = await getSetting<Record<string, { storageKey: string; mime: string } | null>>(
    SETTING_KEYS.REQUEST_FORM_LOGOS,
  );
  const logo = logos[position];
  if (!logo?.storageKey) return NextResponse.json({ error: "No logo." }, { status: 404 });
  try {
    const content = await storage.read(logo.storageKey);
    return new Response(new Uint8Array(content), {
      headers: { "Content-Type": logo.mime ?? "image/png", "Cache-Control": "public, max-age=300" },
    });
  } catch {
    return NextResponse.json({ error: "Logo not available." }, { status: 404 });
  }
}
