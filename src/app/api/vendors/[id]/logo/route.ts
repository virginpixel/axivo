import { NextResponse } from "next/server";
import { getCurrentUser } from "@/shared/auth/session";
import { db } from "@/shared/db";
import { storage } from "@/shared/storage/storage";

/** Authorized vendor logo (session-gated internal route). */
export const dynamic = "force-dynamic";

const MIME: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", svg: "image/svg+xml" };

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { id } = await params;
  const vendor = await db.vendor.findFirst({ where: { id, deletedAt: null }, select: { logoPath: true } });
  if (!vendor?.logoPath) return NextResponse.json({ error: "No logo." }, { status: 404 });
  try {
    const content = await storage.read(vendor.logoPath);
    const ext = vendor.logoPath.split(".").pop()?.toLowerCase() ?? "png";
    return new Response(new Uint8Array(content), {
      headers: { "Content-Type": MIME[ext] ?? "application/octet-stream", "Cache-Control": "private, max-age=300" },
    });
  } catch {
    return NextResponse.json({ error: "Logo not available." }, { status: 404 });
  }
}
