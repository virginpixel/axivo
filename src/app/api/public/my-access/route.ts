import { NextResponse } from "next/server";
import { db } from "@/shared/db";
import { listActiveRequestFieldsFor } from "@/modules/request-fields/service";

/**
 * The application access an employee already holds, for the public access
 * role-change form (SDS Doc 08). A role change edits access someone already
 * has, so the form must first show them what they hold: which applications,
 * the current role and the current request-field values, plus the roles and
 * fields they can change it to.
 *
 * Public by necessity - the requester is not signed in - so, like the checkout
 * lookup, it answers only for an exact company + employee ID (or work email)
 * pair and returns an empty list rather than an error for an unknown employee,
 * giving nothing away about who works where.
 */
export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const companyId = url.searchParams.get("companyId")?.trim();
  const employeeId = url.searchParams.get("employeeId")?.trim();
  const email = url.searchParams.get("email")?.trim();
  if (!companyId || (!employeeId && !email)) return NextResponse.json({ access: [] });

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
  if (!person) return NextResponse.json({ access: [] });

  const assignments = await db.applicationAssignment.findMany({
    where: { personId: person.id, status: { in: ["ACTIVE", "SUSPENDED"] }, deletedAt: null },
    include: {
      application: { select: { id: true, name: true } },
      applicationRole: { select: { id: true, name: true } },
    },
    orderBy: { assignedAt: "desc" },
  });

  // The roles and request fields that each application offers, so the form can
  // present the same choices the requester would see when granting access.
  const access = await Promise.all(
    assignments.map(async (assignment) => {
      const [roles, fields] = await Promise.all([
        db.applicationRole.findMany({
          where: { applicationId: assignment.applicationId, isActive: true, deletedAt: null },
          select: { id: true, name: true },
          orderBy: { name: "asc" },
        }),
        listActiveRequestFieldsFor([assignment.applicationId], []),
      ]);
      return {
        assignmentId: assignment.id,
        applicationId: assignment.applicationId,
        applicationName: assignment.application.name,
        currentRoleId: assignment.applicationRoleId,
        currentRoleName: assignment.applicationRole?.name ?? null,
        roles,
        fields: fields.map((field) => ({
          fieldKey: field.fieldKey,
          label: field.label,
          fieldType: field.fieldType,
          isRequired: field.isRequired,
          options: (field.options as string[] | null) ?? [],
        })),
        currentValues: (assignment.fieldData ?? {}) as Record<string, string | string[]>,
      };
    }),
  );

  return NextResponse.json({ access }, { headers: { "Cache-Control": "no-store" } });
}
