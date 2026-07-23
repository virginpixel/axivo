import { NextResponse } from "next/server";
import { getCurrentUser } from "@/shared/auth/session";
import { db } from "@/shared/db";
import { storage } from "@/shared/storage/storage";

/**
 * Authorized asset image (session-gated). Serves the per-asset image override
 * if set, otherwise falls back to the asset's model default image.
 */
export const dynamic = "force-dynamic";

const MIME: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp" };

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { id } = await params;
  const asset = await db.asset.findFirst({ where: { id, deletedAt: null }, select: { imagePath: true, model: true } });
  if (!asset) return NextResponse.json({ error: "Not found." }, { status: 404 });

  let key = asset.imagePath;
  if (!key && asset.model) {
    const model = await db.assetModel.findFirst({ where: { name: asset.model, deletedAt: null }, select: { imagePath: true } });
    key = model?.imagePath ?? null;
  }
  if (!key) return NextResponse.json({ error: "No image." }, { status: 404 });
  try {
    const content = await storage.read(key);
    const ext = key.split(".").pop()?.toLowerCase() ?? "png";
    return new Response(new Uint8Array(content), {
      headers: { "Content-Type": MIME[ext] ?? "application/octet-stream", "Cache-Control": "private, max-age=300" },
    });
  } catch {
    return NextResponse.json({ error: "Image not available." }, { status: 404 });
  }
}
