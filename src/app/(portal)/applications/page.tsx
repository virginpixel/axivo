import { requirePermission } from "@/shared/auth/guard";
import { db } from "@/shared/db";
import { PageHeader } from "@/shared/ui/page";
import { Table, THead, TBody, TR, TH, TD, EmptyState } from "@/shared/ui/table";
import { StatusBadge } from "@/shared/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { fullName } from "@/shared/utils";
import {
  ApplicationDialog,
  ApplicationToggle,
  AppRoleDialog,
  CredentialFieldDialog,
  AssignmentDialog,
  AssignmentRowActions,
} from "./application-dialogs";

export const metadata = { title: "Applications" };
export const dynamic = "force-dynamic";

/** Applications catalogue and assignment management (SDS Doc 08). */
export default async function ApplicationsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { user } = await requirePermission("applications.view");
  const params = await searchParams;
  const q = params.q?.trim() ?? "";
  const isGlobalAdmin = user.systemRoleKey === "SYSTEM_ADMINISTRATOR";
  const canManage = user.permissions.has("applications.manage");
  const canAssign = user.permissions.has("applications.assignments.manage");
  const companyScope = isGlobalAdmin ? {} : { companyId: user.companyId };

  const [applications, companies, people, assignments] = await Promise.all([
    db.application.findMany({
      where: {
        deletedAt: null,
        ...companyScope,
        ...(q ? { name: { contains: q, mode: "insensitive" } } : {}),
      },
      orderBy: [{ company: { name: "asc" } }, { name: "asc" }],
      include: {
        company: { select: { name: true } },
        roles: { where: { deletedAt: null }, orderBy: { name: "asc" } },
        credentialFields: { where: { deletedAt: null }, orderBy: { displayOrder: "asc" } },
        _count: { select: { assignments: { where: { status: { in: ["ACTIVE", "PENDING", "SUSPENDED"] } } } } },
      },
    }),
    db.company.findMany({
      where: { deletedAt: null, isActive: true, ...(isGlobalAdmin ? {} : { id: user.companyId }) },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    db.person.findMany({
      where: { deletedAt: null, isActive: true, ...companyScope },
      orderBy: { lastName: "asc" },
      select: { id: true, firstName: true, lastName: true, companyId: true },
    }),
    db.applicationAssignment.findMany({
      where: {
        deletedAt: null,
        application: { deletedAt: null, ...companyScope },
        ...(q
          ? {
              OR: [
                { application: { name: { contains: q, mode: "insensitive" } } },
                { username: { contains: q, mode: "insensitive" } },
                { person: { lastName: { contains: q, mode: "insensitive" } } },
              ],
            }
          : {}),
      },
      orderBy: { assignedAt: "desc" },
      take: 100,
      include: {
        person: true,
        application: { select: { id: true, name: true } },
        applicationRole: { select: { name: true } },
      },
    }),
  ]);

  const peopleByCompany: Record<string, { id: string; name: string }[]> = {};
  for (const person of people) {
    (peopleByCompany[person.companyId] ??= []).push({ id: person.id, name: fullName(person) });
  }

  return (
    <div>
      <PageHeader
        title="Applications"
        description="Business applications, access roles, credential fields and assignments."
        actions={canManage ? <ApplicationDialog companies={companies} /> : undefined}
      />

      <form method="get" className="mb-4 flex gap-2">
        <input
          name="q"
          defaultValue={q}
          placeholder="Search applications, users, usernames…"
          aria-label="Search"
          className="h-9 w-full rounded-md border border-input bg-card px-3 text-sm sm:w-72"
        />
        <button type="submit" className="h-9 rounded-md border bg-card px-4 text-sm hover:bg-accent">
          Search
        </button>
      </form>

      {applications.length === 0 ? (
        <EmptyState title="No applications" description="Add the business applications your employees request access to." />
      ) : (
        <div className="space-y-4">
          {applications.map((application) => (
            <Card key={application.id}>
              <CardHeader>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <CardTitle>
                      {application.name}
                      <span className="ml-2 text-sm font-normal text-muted-foreground">
                        {application.company.name}
                        {application.category ? ` · ${application.category}` : ""}
                      </span>
                    </CardTitle>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {application._count.assignments} active assignment(s)
                      {application.requiresLicense ? " · requires license" : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={application.isActive ? "ACTIVE" : "CANCELLED"} />
                    {canManage ? (
                      <>
                        <ApplicationDialog
                          companies={companies}
                          application={{
                            id: application.id,
                            companyId: application.companyId,
                            name: application.name,
                            description: application.description,
                            category: application.category,
                            loginUrl: application.loginUrl,
                            allowMultipleAssignments: application.allowMultipleAssignments,
                            requiresLicense: application.requiresLicense,
                          }}
                        />
                        <ApplicationToggle id={application.id} isActive={application.isActive} />
                      </>
                    ) : null}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="grid gap-4 lg:grid-cols-2">
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Access roles</h3>
                    {canManage ? <AppRoleDialog applicationId={application.id} /> : null}
                  </div>
                  {application.roles.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No roles defined.</p>
                  ) : (
                    <ul className="flex flex-wrap gap-1.5">
                      {application.roles.map((role) => (
                        <li
                          key={role.id}
                          className={`rounded-full border px-3 py-1 text-xs ${role.isActive ? "" : "opacity-50"}`}
                        >
                          {role.name}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Custom credential fields
                    </h3>
                    {canManage ? <CredentialFieldDialog applicationId={application.id} /> : null}
                  </div>
                  {application.credentialFields.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Username and temporary password only.</p>
                  ) : (
                    <ul className="flex flex-wrap gap-1.5">
                      {application.credentialFields.map((field) => (
                        <li
                          key={field.id}
                          className={`rounded-full border px-3 py-1 text-xs ${field.isActive ? "" : "opacity-50"}`}
                        >
                          {field.fieldName}
                          {field.isRequired ? <span className="text-destructive"> *</span> : null}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <section aria-label="Assignments" className="mt-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold">Recent assignments</h2>
          {canAssign ? (
            <AssignmentDialog
              applications={applications.map((application) => ({
                id: application.id,
                name: application.name,
                companyId: application.companyId,
                roles: application.roles.filter((role) => role.isActive).map((role) => ({ id: role.id, name: role.name })),
              }))}
              peopleByCompany={peopleByCompany}
            />
          ) : null}
        </div>
        {assignments.length === 0 ? (
          <EmptyState title="No assignments" description="Application assignments appear here, including those created by request implementations." />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Employee</TH><TH>Application</TH><TH>Role</TH><TH>Username</TH><TH>Status</TH>
                {canAssign ? <TH className="text-right">Actions</TH> : null}
              </TR>
            </THead>
            <TBody>
              {assignments.map((assignment) => (
                <TR key={assignment.id}>
                  <TD className="font-medium">{fullName(assignment.person)}</TD>
                  <TD>{assignment.application.name}</TD>
                  <TD>{assignment.applicationRole?.name ?? "—"}</TD>
                  <TD>{assignment.username ?? "—"}</TD>
                  <TD><StatusBadge status={assignment.status} /></TD>
                  {canAssign ? (
                    <TD className="text-right">
                      <AssignmentRowActions assignmentId={assignment.id} status={assignment.status} />
                    </TD>
                  ) : null}
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </section>
    </div>
  );
}
