import { notFound } from "next/navigation";
import Link from "next/link";
import { requirePermission } from "@/shared/auth/guard";
import { db } from "@/shared/db";
import { PageHeader } from "@/shared/ui/page";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { StatusBadge } from "@/shared/ui/badge";
import { Table, THead, TBody, TR, TH, TD } from "@/shared/ui/table";
import { formatDate, formatDateTime, fullName } from "@/shared/utils";
import { PersonDialog, EmploymentStatusSelect, CreateAccountDialog, AccountControls } from "../person-dialogs";

export const dynamic = "force-dynamic";

/** Employee profile with full operational history (SDS Doc 07). */
export default async function PersonDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { user } = await requirePermission("people.view");
  const { id } = await params;

  const person = await db.person.findFirst({
    where: { id, deletedAt: null },
    include: {
      company: true,
      department: true,
      position: true,
      location: true,
      systemUser: { include: { systemRole: true } },
      applicationAssignments: {
        include: { application: true, applicationRole: true },
        orderBy: { assignedAt: "desc" },
      },
      licenseAssignments: { include: { license: true }, orderBy: { assignedAt: "desc" } },
      assetAssignments: { include: { asset: true }, orderBy: { assignedAt: "desc" } },
      credentialDeliveries: { include: { application: true }, orderBy: { createdAt: "desc" } },
      orgAssignments: { orderBy: { effectiveAt: "desc" }, take: 10 },
    },
  });
  if (!person) notFound();
  if (person.companyId !== user.companyId && user.systemRoleKey !== "SYSTEM_ADMINISTRATOR") notFound();

  const canManage = user.permissions.has("people.manage");
  const canManageAccounts = user.permissions.has("people.accounts.manage");

  const [orgCompanies, orgDepartments, orgPositions, orgLocations, systemRoles] = await Promise.all([
    db.company.findMany({
      where: { deletedAt: null, ...(user.systemRoleKey === "SYSTEM_ADMINISTRATOR" ? {} : { id: user.companyId }) },
      orderBy: { name: "asc" }, select: { id: true, name: true },
    }),
    db.department.findMany({ where: { deletedAt: null, isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true, companyId: true } }),
    db.position.findMany({ where: { deletedAt: null, isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true, companyId: true } }),
    db.location.findMany({ where: { deletedAt: null, isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true, companyId: true } }),
    db.systemRole.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  return (
    <div>
      <PageHeader
        title={fullName(person)}
        breadcrumbs={[{ label: "People", href: "/people" }, { label: fullName(person) }]}
        description={`${person.employeeId} · ${person.company.name}`}
        actions={
          canManage ? (
            <div className="flex items-center gap-2">
              <EmploymentStatusSelect personId={person.id} current={person.employmentStatus} />
              <PersonDialog
                orgData={{ companies: orgCompanies, departments: orgDepartments, positions: orgPositions, locations: orgLocations }}
                person={{
                  id: person.id,
                  companyId: person.companyId,
                  departmentId: person.departmentId,
                  positionId: person.positionId,
                  locationId: person.locationId,
                  employeeId: person.employeeId,
                  firstName: person.firstName,
                  lastName: person.lastName,
                  email: person.email,
                  personalEmail: person.personalEmail,
                  phone: person.phone,
                  extension: person.extension,
                  employmentStatus: person.employmentStatus,
                }}
              />
            </div>
          ) : undefined
        }
      />

      <div className="grid gap-5 lg:grid-cols-3">
        <Card>
          <CardHeader><CardTitle>Profile</CardTitle></CardHeader>
          <CardContent>
            <dl className="space-y-2 text-sm">
              <ProfileRow label="Status" value={<StatusBadge status={person.employmentStatus} />} />
              <ProfileRow label="Work email" value={person.email} />
              <ProfileRow label="Personal email" value={person.personalEmail ?? "—"} />
              <ProfileRow label="Phone" value={person.phone ?? "—"} />
              <ProfileRow label="Department" value={person.department?.name ?? "—"} />
              <ProfileRow label="Position" value={person.position?.name ?? "—"} />
              <ProfileRow label="Location" value={person.location?.name ?? "—"} />
            </dl>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Portal account</CardTitle></CardHeader>
          <CardContent>
            {person.systemUser ? (
              <div className="space-y-3 text-sm">
                <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-3">
                  <ProfileRow label="Username" value={person.systemUser.username} />
                  <ProfileRow label="Role" value={person.systemUser.systemRole.name} />
                  <ProfileRow
                    label="Last login"
                    value={person.systemUser.lastLoginAt ? formatDateTime(person.systemUser.lastLoginAt) : "Never"}
                  />
                </dl>
                {canManageAccounts ? (
                  <AccountControls
                    systemUserId={person.systemUser.id}
                    isEnabled={person.systemUser.isEnabled}
                    currentRoleId={person.systemUser.systemRoleId}
                    roles={systemRoles}
                  />
                ) : null}
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  No portal account. This person interacts with Axivo through email links only.
                </p>
                {canManageAccounts && person.isActive ? (
                  <CreateAccountDialog personId={person.id} roles={systemRoles} />
                ) : null}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Application access</CardTitle></CardHeader>
          <CardContent>
            {person.applicationAssignments.length === 0 ? (
              <p className="text-sm text-muted-foreground">No application assignments.</p>
            ) : (
              <Table>
                <THead><TR><TH>Application</TH><TH>Role</TH><TH>Username</TH><TH>Status</TH></TR></THead>
                <TBody>
                  {person.applicationAssignments.map((assignment) => (
                    <TR key={assignment.id}>
                      <TD className="font-medium">{assignment.application.name}</TD>
                      <TD>{assignment.applicationRole?.name ?? "—"}</TD>
                      <TD>{assignment.username ?? "—"}</TD>
                      <TD><StatusBadge status={assignment.status} /></TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Assets</CardTitle></CardHeader>
          <CardContent>
            {person.assetAssignments.length === 0 ? (
              <p className="text-sm text-muted-foreground">No asset assignments.</p>
            ) : (
              <Table>
                <THead><TR><TH>Asset</TH><TH>Assigned</TH><TH>Returned</TH><TH>Status</TH></TR></THead>
                <TBody>
                  {person.assetAssignments.map((assignment) => (
                    <TR key={assignment.id}>
                      <TD>
                        <Link href={`/assets?q=${assignment.asset.assetTag}`} className="font-medium text-primary hover:underline">
                          {assignment.asset.assetTag}
                        </Link>
                        <p className="text-xs text-muted-foreground">{assignment.asset.model ?? ""}</p>
                      </TD>
                      <TD>{formatDate(assignment.assignedAt)}</TD>
                      <TD>{assignment.returnedAt ? formatDate(assignment.returnedAt) : "—"}</TD>
                      <TD><StatusBadge status={assignment.status} /></TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Licenses</CardTitle></CardHeader>
          <CardContent>
            {person.licenseAssignments.length === 0 ? (
              <p className="text-sm text-muted-foreground">No license assignments.</p>
            ) : (
              <Table>
                <THead><TR><TH>License</TH><TH>Assigned</TH><TH>Status</TH></TR></THead>
                <TBody>
                  {person.licenseAssignments.map((assignment) => (
                    <TR key={assignment.id}>
                      <TD className="font-medium">{assignment.license.name}</TD>
                      <TD>{formatDate(assignment.assignedAt)}</TD>
                      <TD><StatusBadge status={assignment.status} /></TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Credential deliveries</CardTitle></CardHeader>
          <CardContent>
            {person.credentialDeliveries.length === 0 ? (
              <p className="text-sm text-muted-foreground">No credential deliveries.</p>
            ) : (
              <Table>
                <THead><TR><TH>Application</TH><TH>Username</TH><TH>Sent</TH><TH>Status</TH></TR></THead>
                <TBody>
                  {person.credentialDeliveries.map((delivery) => (
                    <TR key={delivery.id}>
                      <TD className="font-medium">{delivery.application.name}</TD>
                      <TD>{delivery.username}</TD>
                      <TD>{delivery.sentAt ? formatDateTime(delivery.sentAt) : "—"}</TD>
                      <TD><StatusBadge status={delivery.status} /></TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function ProfileRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-0.5">{value}</dd>
    </div>
  );
}
