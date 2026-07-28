import { NextResponse } from "next/server";
import { db } from "@/shared/db";

/**
 * The assets currently assigned to one employee, for the public checkout form
 * (SDS Doc 11).
 *
 * Public by necessity - the requester is not signed in - so it is written to
 * give nothing away. It answers only for an exact company + employee ID pair,
 * returns just what is needed to identify equipment the caller already holds,
 * and replies with an empty list rather than an error when the employee does
 * not exist, so it cannot be used to discover who works where.
 */
export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const companyId = url.searchParams.get("companyId")?.trim();
  const employeeId = url.searchParams.get("employeeId")?.trim();
  const email = url.searchParams.get("email")?.trim();
  if (!companyId || (!employeeId && !email)) return NextResponse.json({ assets: [] });

  // Resolve the employee the same way the request submission does: employee ID
  // first, then work email as a fallback. The fallback matters because an
  // employee whose ID was entered with a stray character (a trailing backtick,
  // say) could otherwise never find their own equipment through this form, even
  // though the ID they naturally type is "correct". Still an exact match on
  // either field, so nobody can turn up somebody else's assets.
  const scoped = { companyId, deletedAt: null, isActive: true } as const;
  const person =
    (employeeId
      ? await db.person.findFirst({
          where: { ...scoped, employeeId: { equals: employeeId, mode: "insensitive" } },
          select: { id: true },
        })
      : null) ??
    (email
      ? await db.person.findFirst({
          where: { ...scoped, email: { equals: email, mode: "insensitive" } },
          select: { id: true },
        })
      : null);
  if (!person) return NextResponse.json({ assets: [] });

  const assignments = await db.assetAssignment.findMany({
    where: { personId: person.id, status: "ASSIGNED", deletedAt: null },
    include: { asset: { include: { category: { select: { id: true, name: true } } } } },
    orderBy: { assignedAt: "desc" },
  });

  return NextResponse.json(
    {
      assets: assignments.map((assignment) => ({
        id: assignment.assetId,
        name: assignment.asset.name,
        category: assignment.asset.category?.name ?? null,
        // The item is still an asset of this category, so the request records it
        // the same way every other asset item does.
        categoryId: assignment.asset.categoryId,
        model: assignment.asset.model,
        serialNumber: assignment.asset.serialNumber,
        assetTag: assignment.asset.assetTag,
      })),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
