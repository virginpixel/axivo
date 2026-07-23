import { notFound } from "next/navigation";
import { requirePermission } from "@/shared/auth/guard";
import { db } from "@/shared/db";
import { PageHeader } from "@/shared/ui/page";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { Table, THead, TBody, TR, TH, TD, EmptyState } from "@/shared/ui/table";
import { StatusBadge, Badge } from "@/shared/ui/badge";
import { fullName } from "@/shared/utils";
import {
  ApplicationDialog,
  ApplicationToggle,
  AppRoleDialog,
  RoleToggle,
  CredentialFieldDialog,
  CredentialFieldToggle,
  AssignmentRowActions,
} from "../application-dialogs";
import { RequestFieldsCard } from "@/shared/ui/request-fields-card";
import { listRequestFields } from "@/modules/request-fields/service";

export const dynamic = "force-dynamic";

/** Application detail: access roles, credential fields and its assignments (SDS Doc 08). */
export default async function ApplicationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { user } = await requirePermission("applications.view");
  const { id } = await params;
  const isGlobalAdmin = user.systemRoleKey === "SYSTEM_ADMINISTRATOR";
  const canManage = user.permissions.has("applications.manage");
  const canAssign = user.permissions.has("applications.assignments.manage");

  const application = await db.application.findFirst({
    where: { id, deletedAt: null },
    include: {
      company: { select: { name: true } },
      roles: { where: { deletedAt: null }, orderBy: { name: "asc" } },
      credentialFields: { where: { deletedAt: null }, orderBy: { displayOrder: "asc" } },
    },
  });
  if (!application) notFound();
  if (!application.isShared && application.companyId !== user.companyId && !isGlobalAdmin) notFound();

  const [companies, assignments, requestFields, workflows] = await Promise.all([
    db.company.findMany({
      where: { deletedAt: null, isActive: true, ...(isGlobalAdmin ? {} : { id: user.companyId }) },
      orderBy: { name: "asc" }, select: { id: true, name: true },
    }),
    db.applicationAssignment.findMany({
      where: { deletedAt: null, applicationId: application.id },
      orderBy: { assignedAt: "desc" },
      include: { person: true, applicationRole: { select: { name: true } } },
    }),
    listRequestFields({ applicationId: id }),
    db.workflow.findMany({
      where: { deletedAt: null, isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, companyId: true },
    }),
  ]);

  return (
    <div>
      <PageHeader
        title={application.name}
        breadcrumbs={[{ label: "Applications", href: "/applications" }, { label: application.name }]}
        description={application.isShared ? "Shared across all companies" : application.company.name}
        actions={
          <div className="flex items-center gap-2">
            {application.isShared ? <Badge variant="info">Shared</Badge> : null}
            <StatusBadge status={application.isActive ? "ACTIVE" : "CANCELLED"} />
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
        }
      />

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Access roles</CardTitle>
              {canManage ? <AppRoleDialog applicationId={application.id} /> : null}
            </div>
          </CardHeader>
          <CardContent>
            {application.roles.length === 0 ? (
              <p className="text-sm text-muted-foreground">No roles defined.</p>
            ) : (
              <ul className="space-y-2">
                {application.roles.map((role) => (
                  <li key={role.id} className={`flex items-center justify-between rounded-md border px-3 py-2 text-sm ${role.isActive ? "" : "opacity-50"}`}>
                    <div>
                      <p className="font-medium">{role.name}</p>
                      {role.description ? <p className="text-xs text-muted-foreground">{role.description}</p> : null}
                    </div>
                    {canManage ? (
                      <span className="flex items-center gap-1">
                        <AppRoleDialog applicationId={application.id} role={{ id: role.id, name: role.name, description: role.description }} />
                        <RoleToggle id={role.id} isActive={role.isActive} />
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Credential fields</CardTitle>
              {canManage ? <CredentialFieldDialog applicationId={application.id} /> : null}
            </div>
          </CardHeader>
          <CardContent>
            {application.credentialFields.length === 0 ? (
              <p className="text-sm text-muted-foreground">Username and temporary password only.</p>
            ) : (
              <ul className="space-y-2">
                {application.credentialFields.map((field) => (
                  <li key={field.id} className={`flex items-center justify-between rounded-md border px-3 py-2 text-sm ${field.isActive ? "" : "opacity-50"}`}>
                    <div>
                      <p className="font-medium">
                        {field.fieldName}{field.isRequired ? <span className="text-destructive"> *</span> : null}
                      </p>
                      {field.helpText ? <p className="text-xs text-muted-foreground">{field.helpText}</p> : null}
                    </div>
                    {canManage ? (
                      <span className="flex items-center gap-1">
                        <CredentialFieldDialog
                          applicationId={application.id}
                          field={{ id: field.id, fieldName: field.fieldName, fieldType: field.fieldType, isRequired: field.isRequired, helpText: field.helpText }}
                        />
                        <CredentialFieldToggle id={field.id} isActive={field.isActive} />
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="mt-5">
        <RequestFieldsCard
          owner={{ applicationId: application.id }}
          canManage={canManage}
          description="No extra questions yet. Add the details a requester must provide when asking for this application."
          fields={requestFields.map((field) => ({
            id: field.id,
            label: field.label,
            fieldType: field.fieldType,
            placeholder: field.placeholder,
            helpText: field.helpText,
            isRequired: field.isRequired,
            options: Array.isArray(field.options) ? (field.options as string[]) : [],
            displayOrder: field.displayOrder,
            isActive: field.isActive,
          }))}
        />
      </div>

      <Card className="mt-5">
        <CardHeader><CardTitle>Assignments ({assignments.length})</CardTitle></CardHeader>
        <CardContent>
          {assignments.length === 0 ? (
            <EmptyState title="No assignments" description="Assignments for this application appear here." />
          ) : (
            <Table>
              <THead>
                <TR><TH>Employee</TH><TH>Role</TH><TH>Username</TH><TH>Status</TH>{canAssign ? <TH className="text-right">Actions</TH> : null}</TR>
              </THead>
              <TBody>
                {assignments.map((assignment) => (
                  <TR key={assignment.id}>
                    <TD className="font-medium">{fullName(assignment.person)}</TD>
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
        </CardContent>
      </Card>
    </div>
  );
}
