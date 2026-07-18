import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { getCurrentUser, getClientIp } from "@/shared/auth/session";
import { getDocumentFileForUser } from "@/modules/documents/service";
import { AppError } from "@/shared/errors";

/**
 * Authorized document download endpoint (SDS Doc 12 Ch8).
 * This is an internal application route (not a public API): session-gated,
 * permission-checked, company-isolated and fully audited.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }
  const { id } = await params;
  const url = new URL(request.url);
  const versionParam = url.searchParams.get("version");
  const versionNumber = versionParam ? Number(versionParam) : undefined;
  if (versionParam && (!Number.isInteger(versionNumber) || versionNumber! < 1)) {
    return NextResponse.json({ error: "Invalid version." }, { status: 400 });
  }

  const requestHeaders = await headers();
  try {
    const { content, version, document } = await getDocumentFileForUser(
      user,
      {
        actorUserId: user.userId,
        actorPersonId: user.personId,
        actorLabel: user.username,
        companyId: user.companyId,
        ipAddress: getClientIp(requestHeaders),
        userAgent: requestHeaders.get("user-agent")?.slice(0, 512) ?? null,
      },
      id,
      versionNumber,
    );
    return new Response(new Uint8Array(content), {
      headers: {
        "Content-Type": version.mimeType,
        "Content-Length": String(version.fileSize),
        "Content-Disposition": `attachment; filename="${version.fileName.replace(/"/g, "")}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    if (error instanceof AppError) {
      const status = error.kind === "not_found" ? 404 : error.kind === "authorization" ? 403 : 400;
      return NextResponse.json({ error: error.message }, { status });
    }
    console.error("[axivo] Document download failed:", error);
    return NextResponse.json({ error: "Download failed." }, { status: 500 });
  }
}
