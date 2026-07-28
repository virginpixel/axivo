import Link from "next/link";
import { requirePermission } from "@/shared/auth/guard";
import { db } from "@/shared/db";
import { PageHeader, Pagination } from "@/shared/ui/page";
import { Table, THead, TBody, TR, TH, TD, EmptyState } from "@/shared/ui/table";
import { StatusBadge, Badge } from "@/shared/ui/badge";
import { Card, CardHeader, CardTitle } from "@/shared/ui/card";
import { fullName } from "@/shared/utils";
import { LiveSearch } from "@/shared/ui/live-search";
import {
  ApplicationDialog,
  ApplicationToggle,
  AssignmentDialog,
  AssignmentRowActions,
} from "./application-dialogs";

export const metadata = { title: "Applications" };
export const dynamic = "force-dynamic";

/** Applications catalogue and assignment management (SDS Doc 08). */
export default async function ApplicationsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string; apage?: string }>;
}) {
  const { user } = await requirePermission("applications.view");
  const params = await searchParams;
  const q = params.q?.trim() ?? "";
  const page = Math.max(1, Number(params.page) || 1);
  const pageSize = 25;
  // Assignments paginate independently of the application cards above them.
  const assignmentPage = Math.max(1, Number(params.apage) || 1);
  const assignmentPageSize = 25;
  const isGlobalAdmin = user.systemRoleKey === "SYSTEM_ADMINISTRATOR";
  const canManage = user.permissions.has("applications.manage");
  const canAssign = user.permissions.has("applications.assignments.manage");
  const companyScope = isGlobalAdmin ? {} : { companyId: user.companyId };

  const applicationWhere = {
    deletedAt: null,
    ...companyScope,
    ...(q ? { name: { contains: q, mode: "insensitive" as const } } : {}),
  };
  const assignmentWhere = {
    deletedAt: null,
    application: { deletedAt: null, ...companyScope },
    ...(q
      ? {
          OR: [
            { application: { name: { contains: q, mode: "insensitive" as const } } },
            { username: { contains: q, mode: "insensitive" as const } },
            { person: { lastName: { contains: q, mode: "insensitive" as const } } },
          ],
        }
      : {}),
  };
  const [applications, total, companies, people, assignments, assignmentTotal, workflows] = await Promise.all([
    db.application.findMany({
      where: applicationWhere,
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: [{ company: { name: "asc" } }, { name: "asc" }],
      include: {
        company: { select: { name: true } },
        roles: { where: { deletedAt: null }, orderBy: { name: "asc" } },
        credentialFields: { where: { deletedAt: null }, orderBy: { displayOrder: "asc" } },
        _count: { select: { assignments: { where: { status: { in: ["ACTIVE", "PENDING", "SUSPENDED"] } } } } },
      },
    }),
    db.application.count({ where: applicationWhere }),
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
      where: assignmentWhere,
      orderBy: { assignedAt: "desc" },
      skip: (assignmentPage - 1) * assignmentPageSize,
      take: assignmentPageSize,
      include: {
        person: true,
        application: { select: { id: true, name: true } },
        applicationRole: { select: { name: true } },
      },
    }),
    db.applicationAssignment.count({ where: assignmentWhere }),
    db.workflow.findMany({
      where: { deletedAt: null, isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, companyId: true },
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
        actions={canManage ? <ApplicationDialog companies={companies} workflows={workflows} /> : undefined}
      />

      <div className="mb-4">
        <LiveSearch placeholder="Search applications, users, usernames" />
      </div>

      {applications.length === 0 ? (
        <EmptyState title="No applications" description="Add the business applications your employees request access to." />
      ) : (
        <div className="space-y-4">
          {applications.map((application) => (
            <Card key={application.id}>
              <CardHeader>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Link href={`/applications/${application.id}`} className="hover:underline">{application.name}</Link>
                      <span className="text-sm font-normal text-muted-foreground">
                        {application.isShared ? "All companies" : application.company.name}
                      </span>
                      {application.isShared ? <Badge variant="info">Shared</Badge> : null}
                    </CardTitle>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {application._count.assignments} active assignment(s) · {application.roles.length} role(s) · {application.credentialFields.length} field(s)
                      {application.requiresLicense ? " · requires license" : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={application.isActive ? "ACTIVE" : "CANCELLED"} />
                    <Link href={`/applications/${application.id}`} className="text-xs text-primary hover:underline">Manage</Link>
                    {canManage ? (
                      <>
                        <ApplicationDialog
                          workflows={workflows}
                          companies={companies}
                          application={{
                            id: application.id,
                            companyId: application.companyId,
                            name: application.name,
                            description: application.description,
                            allowMultipleAssignments: application.allowMultipleAssignments,
                            requiresLicense: application.requiresLicense,
                            isShared: application.isShared,
                workflowId: application.workflowId,
                          }}
                        />
                        <ApplicationToggle id={application.id} isActive={application.isActive} />
                      </>
                    ) : null}
                  </div>
                </div>
              </CardHeader>
            </Card>
          ))}
        </div>
      )}
      <Pagination
        page={page}
        pageCount={Math.max(1, Math.ceil(total / pageSize))}
        total={total}
        buildHref={(next) => {
          const search = new URLSearchParams();
          if (q) search.set("q", q);
          search.set("page", String(next));
          return `/applications?${search.toString()}`;
        }}
      />

      <section aria-label="Assignments" className="mt-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold">Recent assignments</h2>
          {canAssign ? (
            <AssignmentDialog
              applications={applications.map((application) => ({
                id: application.id,
                name: application.name,
                companyId: application.companyId,
                isShared: application.isShared,
                workflowId: application.workflowId,
                roles: application.roles.filter((role) => role.isActive).map((role) => ({ id: role.id, name: role.name })),
              }))}
              peopleByCompany={peopleByCompany}
              allPeople={people.map((person) => ({ id: person.id, name: fullName(person) }))}
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
                  <TD>{assignment.applicationRole?.name ?? "None"}</TD>
                  <TD>{assignment.username ?? "None"}</TD>
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
        <Pagination
          page={assignmentPage}
          pageCount={Math.max(1, Math.ceil(assignmentTotal / assignmentPageSize))}
          total={assignmentTotal}
          buildHref={(next) => {
            const search = new URLSearchParams();
            if (q) search.set("q", q);
            if (page > 1) search.set("page", String(page));
            search.set("apage", String(next));
            return `/applications?${search.toString()}`;
          }}
        />
      </section>
    </div>
  );
}
