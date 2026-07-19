import { NextResponse } from "next/server";
import { getSetting, SETTING_KEYS } from "@/shared/settings/settings";
import { storage } from "@/shared/storage/storage";

/**
 * Public branding logo (shown on the login page and public request forms).
 * Logos are public marketing assets; no authentication is required.
 */
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const branding = await getSetting<{ logoStorageKey?: string; logoMimeType?: string }>(
    SETTING_KEYS.BRANDING,
  );
  if (!branding.logoStorageKey) {
    return NextResponse.json({ error: "No logo configured." }, { status: 404 });
  }
  try {
    const content = await storage.read(branding.logoStorageKey);
    return new Response(new Uint8Array(content), {
      headers: {
        "Content-Type": branding.logoMimeType ?? "image/png",
        "Cache-Control": "public, max-age=300",
      },
    });
  } catch {
    return NextResponse.json({ error: "Logo not available." }, { status: 404 });
  }
}
