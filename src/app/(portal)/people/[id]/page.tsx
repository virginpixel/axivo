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
import { ReturnAssetButton, GenerateHandoverButton, ClearanceControl, PersonDocumentDelete } from "./person-clearance";
import { ResendAckButton } from "@/shared/ui/resend-ack-button";
import { AssignmentRowActions } from "../../applications/application-dialogs";
import { LicenseAssignmentActions } from "../../licenses/license-dialogs";

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
  const canManageAssets = user.permissions.has("assets.assignments.manage");
  const canManageAppAssignments = user.permissions.has("applications.assignments.manage");
  const canManageLicenseAssignments = user.permissions.has("licenses.assignments.manage");

  const openClearance = await db.clearance.findFirst({
    where: { personId: person.id, status: "IN_PROGRESS" },
    include: {
      items: {
        include: {
          assetAssignment: { include: { asset: true } },
          applicationAssignment: { include: { application: true } },
          licenseAssignment: { include: { license: true } },
        },
      },
    },
  });

  // Documents linked to this person (handover / clearance forms and any others).
  const personDocumentLinks = await db.documentLink.findMany({
    where: { entityType: "person", entityId: person.id, removedAt: null },
    include: { document: { select: { id: true, name: true, kind: true, currentVersion: true, createdAt: true } } },
    orderBy: { createdAt: "desc" },
  });
  const personDocuments = personDocumentLinks
    .filter((link) => link.document)
    .map((link) => link.document);

  // Handovers awaiting acknowledgement, so a missed email can be resent.
  const pendingHandovers = await db.handover.findMany({
    where: { personId: person.id, status: { not: "ACKNOWLEDGED" } },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { assets: true } } },
  });

  // Assets currently assigned to this person, offered when generating a handover.
  const assignedAssets = person.assetAssignments
    .filter((assignment) => assignment.status === "ASSIGNED")
    .map((assignment) => ({
      assignmentId: assignment.id,
      label: assignment.asset.name || assignment.asset.assetTag || "Asset",
      reference: assignment.asset.assetTag ?? assignment.asset.model ?? null,
    }));

  const clearanceItems = (openClearance?.items ?? []).map((item) => ({
    id: item.id,
    kind: item.kind,
    label:
      item.assetAssignment?.asset.name ??
      item.applicationAssignment?.application.name ??
      item.licenseAssignment?.license.name ??
      "Item",
    reference:
      item.kind === "ASSET"
        ? item.assetAssignment?.asset.assetTag ?? item.assetAssignment?.asset.model ?? null
        : item.kind === "APPLICATION"
          ? item.applicationAssignment?.username ?? null
          : "seat",
    status: item.status,
    comments: item.comments,
  }));

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
          canManage || canManageAssets ? (
            <div className="flex items-center gap-2">
              {canManageAssets ? (
                <GenerateHandoverButton personId={person.id} assets={assignedAssets} />
              ) : null}
              {canManageAssets ? (
                <ClearanceControl
                  personId={person.id}
                  personName={fullName(person)}
                  clearance={openClearance ? { id: openClearance.id, items: clearanceItems } : null}
                  canManage={canManageAssets}
                />
              ) : null}
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

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Profile</CardTitle></CardHeader>
          <CardContent>
            <dl className="grid grid-cols-1 gap-x-6 gap-y-2.5 text-sm sm:grid-cols-2">
              <ProfileRow label="Status" value={<StatusBadge status={person.employmentStatus} />} />
              <ProfileRow label="Employee ID" value={person.employeeId} />
              <ProfileRow label="Work email" value={person.email} />
              <ProfileRow label="Personal email" value={person.personalEmail ?? "None"} />
              <ProfileRow label="Phone" value={person.phone ?? "None"} />
              <ProfileRow label="Extension" value={person.extension ?? "None"} />
              <ProfileRow label="Company" value={person.company.name} />
              <ProfileRow label="Department" value={person.department?.name ?? "None"} />
              <ProfileRow label="Position" value={person.position?.name ?? "None"} />
              <ProfileRow label="Location" value={person.location?.name ?? "None"} />
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Portal account</CardTitle></CardHeader>
          <CardContent>
            {person.systemUser ? (
              <div className="flex flex-col gap-4 text-sm sm:flex-row sm:items-start sm:justify-between">
                <dl className="space-y-2">
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
              <div className="space-y-3">
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
                <THead>
                  <TR>
                    <TH>Application</TH><TH>Role</TH><TH>Username</TH><TH>Status</TH>
                    {canManageAppAssignments ? <TH /> : null}
                  </TR>
                </THead>
                <TBody>
                  {person.applicationAssignments.map((assignment) => (
                    <TR key={assignment.id}>
                      <TD className="font-medium">{assignment.application.name}</TD>
                      <TD>{assignment.applicationRole?.name ?? "None"}</TD>
                      <TD>{assignment.username ?? "None"}</TD>
                      <TD><StatusBadge status={assignment.status} /></TD>
                      {canManageAppAssignments ? (
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

        <Card>
          <CardHeader><CardTitle>Assets</CardTitle></CardHeader>
          <CardContent>
            {person.assetAssignments.length === 0 ? (
              <p className="text-sm text-muted-foreground">No asset assignments.</p>
            ) : (
              <Table>
                <THead>
                  <TR>
                    <TH>Asset</TH><TH>Assigned</TH><TH>Returned</TH><TH>Status</TH>
                    {canManageAssets ? <TH /> : null}
                  </TR>
                </THead>
                <TBody>
                  {person.assetAssignments.map((assignment) => (
                    <TR key={assignment.id}>
                      <TD>
                        <Link href={`/assets/${assignment.asset.id}`} className="font-medium text-primary hover:underline">
                          {assignment.asset.name || assignment.asset.assetTag}
                        </Link>
                        <p className="text-xs text-muted-foreground">
                          {[assignment.asset.assetTag, assignment.asset.model].filter(Boolean).join(" · ")}
                        </p>
                      </TD>
                      <TD>{formatDate(assignment.assignedAt)}</TD>
                      <TD>{assignment.returnedAt ? formatDate(assignment.returnedAt) : "None"}</TD>
                      <TD><StatusBadge status={assignment.status} /></TD>
                      {canManageAssets ? (
                        <TD className="text-right">
                          {assignment.status === "ASSIGNED" ? (
                            <ReturnAssetButton assignmentId={assignment.id} />
                          ) : null}
                        </TD>
                      ) : null}
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
                <THead>
                  <TR>
                    <TH>License</TH><TH>Assigned</TH><TH>Status</TH>
                    {canManageLicenseAssignments ? <TH /> : null}
                  </TR>
                </THead>
                <TBody>
                  {person.licenseAssignments.map((assignment) => (
                    <TR key={assignment.id}>
                      <TD className="font-medium">{assignment.license.name}</TD>
                      <TD>{formatDate(assignment.assignedAt)}</TD>
                      <TD><StatusBadge status={assignment.status} /></TD>
                      {canManageLicenseAssignments ? (
                        <TD className="text-right">
                          <LicenseAssignmentActions assignmentId={assignment.id} status={assignment.status} />
                        </TD>
                      ) : null}
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
                <THead><TR><TH>Application</TH><TH>Username</TH><TH>Sent</TH><TH>Status</TH>{canManageAppAssignments ? <TH className="text-right">Resend</TH> : null}</TR></THead>
                <TBody>
                  {person.credentialDeliveries.map((delivery) => (
                    <TR key={delivery.id}>
                      <TD className="font-medium">{delivery.application.name}</TD>
                      <TD>{delivery.username}</TD>
                      <TD>{delivery.sentAt ? formatDateTime(delivery.sentAt) : "None"}</TD>
                      <TD><StatusBadge status={delivery.status} /></TD>
                      {canManageAppAssignments ? (
                        <TD className="text-right">
                          {delivery.status !== "REVOKED" ? (
                            <ResendAckButton kind="credential" targetId={delivery.id} defaultEmail={person.email} />
                          ) : null}
                        </TD>
                      ) : null}
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {pendingHandovers.length > 0 ? (
          <Card>
            <CardHeader><CardTitle>Asset handovers awaiting acknowledgement</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <THead><TR><TH>Assets</TH><TH>Sent</TH><TH>Status</TH>{canManageAssets ? <TH className="text-right">Resend</TH> : null}</TR></THead>
                <TBody>
                  {pendingHandovers.map((handover) => (
                    <TR key={handover.id}>
                      <TD>{handover._count.assets} asset(s)</TD>
                      <TD>{handover.sentAt ? formatDateTime(handover.sentAt) : "Not sent"}</TD>
                      <TD><StatusBadge status={handover.status} /></TD>
                      {canManageAssets ? (
                        <TD className="text-right">
                          <ResendAckButton kind="handover" targetId={handover.id} defaultEmail={person.email} />
                        </TD>
                      ) : null}
                    </TR>
                  ))}
                </TBody>
              </Table>
            </CardContent>
          </Card>
        ) : null}

        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Documents</CardTitle></CardHeader>
          <CardContent>
            {personDocuments.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No documents yet. Handover and clearance forms generated for this employee appear here.
              </p>
            ) : (
              <Table>
                <THead><TR><TH>Document</TH><TH>Type</TH><TH>Version</TH><TH>Created</TH><TH /></TR></THead>
                <TBody>
                  {personDocuments.map((document) => (
                    <TR key={document!.id}>
                      <TD className="font-medium">{document!.name}</TD>
                      <TD>{document!.kind.replace(/_/g, " ").toLowerCase()}</TD>
                      <TD>v{document!.currentVersion}</TD>
                      <TD>{formatDate(document!.createdAt)}</TD>
                      <TD className="text-right">
                        <div className="flex items-center justify-end gap-3 text-sm">
                          <a href={`/api/documents/${document!.id}/download?inline=1`} target="_blank" rel="noopener" className="text-primary hover:underline">View</a>
                          <a href={`/api/documents/${document!.id}/download`} className="text-primary hover:underline">Download</a>
                          {canManage ? <PersonDocumentDelete personId={person.id} documentId={document!.id} /> : null}
                        </div>
                      </TD>
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
