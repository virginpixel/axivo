import { notFound } from "next/navigation";
import Link from "next/link";
import { requirePermission } from "@/shared/auth/guard";
import { db } from "@/shared/db";
import { PageHeader } from "@/shared/ui/page";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { StatusBadge, Badge } from "@/shared/ui/badge";
import { Table, THead, TBody, TR, TH, TD } from "@/shared/ui/table";
import { formatDate, formatDateTime, fullName } from "@/shared/utils";
import { PersonDialog, EmploymentStatusSelect, CreateAccountDialog, AccountControls } from "../person-dialogs";
import { ReturnAssetButton, GenerateHandoverButton, ClearanceControl, PersonDocumentDelete, CheckInButton } from "./person-clearance";
import { leaveTypeLabel } from "@/modules/assets/checkouts";
import { ChangeAccessDialog } from "./access-change";
import { ResendAckButton } from "@/shared/ui/resend-ack-button";
import { isStoredSecretResendable } from "@/modules/credentials/service";
import { getLicenseAvailability } from "@/modules/licenses/service";
import {
  AddApplicationAccessDialog,
  AddAssetAssignmentDialog,
  AddLicenseAssignmentDialog,
} from "./person-quick-add";
import { documentKindLabel } from "@/modules/documents/categories";
import { Eye, Download } from "lucide-react";
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

  // Handover and clearance forms carry their own lifecycle status, shown on the
  // Documents card and used to decide whether a resend is still possible.
  const [personHandovers, personClearances] = await Promise.all([
    db.handover.findMany({
      where: { personId: person.id },
      orderBy: { createdAt: "desc" },
      select: { id: true, status: true, documentId: true },
    }),
    db.clearance.findMany({
      where: { personId: person.id },
      orderBy: { createdAt: "desc" },
      select: { id: true, status: true, documentId: true },
    }),
  ]);
  const handoverByDocument = new Map(
    personHandovers.filter((h) => h.documentId).map((h) => [h.documentId!, h]),
  );
  const clearanceByDocument = new Map(
    personClearances.filter((c) => c.documentId).map((c) => [c.documentId!, c]),
  );

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

  // Equipment this employee has taken off site and not yet brought back.
  const openCheckouts = await db.assetCheckout.findMany({
    where: { personId: person.id, status: "APPROVED", returnedAt: null },
    include: { asset: { include: { category: true } } },
    orderBy: { endDate: "asc" },
  });

  // Roles and request-field definitions for the applications this person holds,
  // so their current values can be shown and changed in place.
  const heldApplicationIds = Array.from(
    new Set(person.applicationAssignments.map((assignment) => assignment.applicationId)),
  );
  const [heldRoles, heldRequestFields] = await Promise.all([
    heldApplicationIds.length > 0
      ? db.applicationRole.findMany({
          where: { applicationId: { in: heldApplicationIds }, isActive: true, deletedAt: null },
          orderBy: { name: "asc" },
          select: { id: true, name: true, applicationId: true },
        })
      : Promise.resolve([]),
    heldApplicationIds.length > 0
      ? db.requestField.findMany({
          where: { applicationId: { in: heldApplicationIds }, isActive: true, deletedAt: null },
          orderBy: { displayOrder: "asc" },
        })
      : Promise.resolve([]),
  ]);
  const rolesByApplication = new Map<string, { id: string; name: string }[]>();
  for (const role of heldRoles) {
    const list = rolesByApplication.get(role.applicationId) ?? [];
    list.push({ id: role.id, name: role.name });
    rolesByApplication.set(role.applicationId, list);
  }
  const requestFieldsByApplication = new Map<string, typeof heldRequestFields>();
  for (const field of heldRequestFields) {
    if (!field.applicationId) continue;
    const list = requestFieldsByApplication.get(field.applicationId) ?? [];
    list.push(field);
    requestFieldsByApplication.set(field.applicationId, list);
  }

  // Catalogues for the quick-add dialogs on this page. Scoped to the person's
  // own company (plus shared applications), so nothing from another company can
  // be granted by accident.
  const [assignableApplications, availableAssets, companyLicenses] = await Promise.all([
    canManageAppAssignments
      ? db.application.findMany({
          where: {
            deletedAt: null,
            isActive: true,
            OR: [{ companyId: person.companyId }, { isShared: true }],
          },
          orderBy: { name: "asc" },
          select: {
            id: true,
            name: true,
            roles: {
              where: { isActive: true, deletedAt: null },
              orderBy: { name: "asc" },
              select: { id: true, name: true },
            },
          },
        })
      : Promise.resolve([]),
    canManageAssets
      ? db.asset.findMany({
          where: { deletedAt: null, companyId: person.companyId, status: "AVAILABLE" },
          orderBy: { name: "asc" },
          select: { id: true, name: true, assetTag: true, model: true },
        })
      : Promise.resolve([]),
    canManageLicenseAssignments
      ? db.license.findMany({
          where: { deletedAt: null, companyId: person.companyId, status: "ACTIVE" },
          orderBy: { name: "asc" },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
  ]);

  // Seat counts decide which licences are even offerable.
  const licenseOptions = (
    await Promise.all(
      companyLicenses.map(async (license) => {
        const availability = await getLicenseAvailability(license.id);
        return { id: license.id, label: license.name, available: availability.available };
      }),
    )
  ).filter((license) => license.available > 0);

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
                  <ProfileRow
                    label="Username"
                    value={
                      <span className="flex items-center gap-1.5">
                        <span className="font-register">{person.systemUser.username}</span>
                        {!person.systemUser.isEnabled ? <Badge variant="destructive">Disabled</Badge> : null}
                      </span>
                    }
                  />
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
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle>Application access</CardTitle>
            {canManageAppAssignments ? (
              <AddApplicationAccessDialog personId={person.id} applications={assignableApplications} />
            ) : null}
          </CardHeader>
          <CardContent>
            {person.applicationAssignments.length === 0 ? (
              <p className="text-sm text-muted-foreground">No application assignments.</p>
            ) : (
              <Table>
                <THead>
                  <TR>
                    <TH>Application</TH><TH>Role</TH><TH>Holds</TH><TH>Username</TH><TH>Status</TH>
                    {canManageAppAssignments ? <TH /> : null}
                  </TR>
                </THead>
                <TBody>
                  {person.applicationAssignments.map((assignment) => {
                    const held = (assignment.fieldData as Record<string, unknown> | null) ?? {};
                    const appFields = requestFieldsByApplication.get(assignment.applicationId) ?? [];
                    const labels = new Map(appFields.map((field) => [field.fieldKey, field.label]));
                    // What this person actually holds on the application: which
                    // outlets, which cost centres, and so on.
                    const heldEntries = Object.entries(held)
                      .filter(([, value]) => value !== null && value !== "" && !(Array.isArray(value) && value.length === 0))
                      .map(([key, value]) => ({
                        label: labels.get(key) ?? key.replace(/_/g, " "),
                        value: Array.isArray(value) ? value.join(", ") : String(value),
                      }));
                    const active = assignment.status !== "REMOVED";
                    return (
                      <TR key={assignment.id}>
                        <TD className="font-medium">{assignment.application.name}</TD>
                        <TD>{assignment.applicationRole?.name ?? "None"}</TD>
                        <TD className="max-w-64">
                          {heldEntries.length === 0 ? (
                            <span className="text-muted-foreground">-</span>
                          ) : (
                            <div className="space-y-0.5">
                              {heldEntries.map((entry) => (
                                <p key={entry.label} className="text-xs">
                                  <span className="text-muted-foreground">{entry.label}: </span>
                                  {entry.value}
                                </p>
                              ))}
                            </div>
                          )}
                        </TD>
                        <TD className="font-register">{assignment.username ?? "None"}</TD>
                        <TD><StatusBadge status={assignment.status} /></TD>
                        {canManageAppAssignments ? (
                          <TD>
                            <div className="flex items-center justify-end gap-1">
                              {active ? (
                                <ChangeAccessDialog
                                  assignmentId={assignment.id}
                                  applicationName={assignment.application.name}
                                  currentRoleId={assignment.applicationRoleId}
                                  currentRoleName={assignment.applicationRole?.name ?? null}
                                  roles={rolesByApplication.get(assignment.applicationId) ?? []}
                                  fields={appFields.map((field) => ({
                                    fieldKey: field.fieldKey,
                                    label: field.label,
                                    fieldType: field.fieldType,
                                    options: (field.options as string[] | null) ?? [],
                                  }))}
                                  currentValues={held as Record<string, string | string[]>}
                                />
                              ) : null}
                              <AssignmentRowActions assignmentId={assignment.id} status={assignment.status} />
                            </div>
                          </TD>
                        ) : null}
                      </TR>
                    );
                  })}
                </TBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle>Assets</CardTitle>
            {canManageAssets ? (
              <AddAssetAssignmentDialog
                personId={person.id}
                assets={availableAssets.map((asset) => ({
                  id: asset.id,
                  label: [asset.name, asset.assetTag, asset.model].filter(Boolean).join(" · "),
                }))}
              />
            ) : null}
          </CardHeader>
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
                      <TD>{assignment.returnedAt ? formatDate(assignment.returnedAt) : "-"}</TD>
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

        {openCheckouts.length > 0 ? (
          <Card>
            <CardHeader><CardTitle>Off site on leave</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <THead>
                  <TR><TH>Asset</TH><TH>Leave</TH><TH>Until</TH>{canManageAssets ? <TH /> : null}</TR>
                </THead>
                <TBody>
                  {openCheckouts.map((checkout) => {
                    const overdue = checkout.endDate < new Date();
                    return (
                      <TR key={checkout.id}>
                        <TD className="font-medium">
                          {[checkout.asset.category?.name, checkout.asset.name]
                            .filter(Boolean)
                            .join(" · ")}
                        </TD>
                        <TD>{leaveTypeLabel(checkout.leaveType)}</TD>
                        <TD>
                          <span className={overdue ? "text-destructive" : undefined}>
                            {formatDate(checkout.endDate)}
                          </span>
                          {overdue ? <Badge variant="destructive" className="ml-2">Overdue</Badge> : null}
                        </TD>
                        {canManageAssets ? (
                          <TD className="text-right">
                            <CheckInButton checkoutId={checkout.id} />
                          </TD>
                        ) : null}
                      </TR>
                    );
                  })}
                </TBody>
              </Table>
            </CardContent>
          </Card>
        ) : null}

        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle>Licenses</CardTitle>
            {canManageLicenseAssignments ? (
              <AddLicenseAssignmentDialog personId={person.id} licenses={licenseOptions} />
            ) : null}
          </CardHeader>
          <CardContent>
            {person.licenseAssignments.length === 0 ? (
              <p className="text-sm text-muted-foreground">No license assignments.</p>
            ) : (
              <Table>
                <THead>
                  <TR>
                    <TH>License</TH><TH>Assigned</TH><TH>Removed</TH><TH>Status</TH>
                    {canManageLicenseAssignments ? <TH /> : null}
                  </TR>
                </THead>
                <TBody>
                  {person.licenseAssignments.map((assignment) => (
                    <TR key={assignment.id}>
                      <TD className="font-medium">{assignment.license.name}</TD>
                      <TD>{formatDate(assignment.assignedAt)}</TD>
                      <TD>{assignment.removedAt ? formatDate(assignment.removedAt) : "-"}</TD>
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
                      <TD className="font-register">{delivery.username}</TD>
                      <TD>{delivery.sentAt ? formatDateTime(delivery.sentAt) : "None"}</TD>
                      <TD><StatusBadge status={delivery.status} /></TD>
                      {canManageAppAssignments ? (
                        <TD className="text-right">
                          {delivery.status !== "REVOKED" ? (
                            <ResendAckButton
                              kind="credential"
                              targetId={delivery.id}
                              defaultEmail={person.email}
                              secretResendable={isStoredSecretResendable(delivery)}
                            />
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

        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Documents</CardTitle></CardHeader>
          <CardContent>
            {personDocuments.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No documents yet. Handover and clearance forms generated for this employee appear here.
              </p>
            ) : (
              <Table>
                <THead><TR><TH>Document</TH><TH>Type</TH><TH>Status</TH><TH>Created</TH><TH /></TR></THead>
                <TBody>
                  {personDocuments.map((document) => {
                    const handover = handoverByDocument.get(document!.id);
                    const clearance = clearanceByDocument.get(document!.id);
                    // Only handover and clearance forms have a lifecycle to show.
                    const resendableHandover = handover && handover.status !== "ACKNOWLEDGED";
                    return (
                      <TR key={document!.id}>
                        <TD className="font-medium">{document!.name}</TD>
                        <TD>{documentKindLabel(document!.kind)}</TD>
                        <TD>
                          {handover ? (
                            <StatusBadge
                              status={handover.status === "ACKNOWLEDGED" ? "ACKNOWLEDGED" : "PENDING"}
                              label={handover.status === "ACKNOWLEDGED" ? "Acknowledged" : "Pending acknowledgement"}
                            />
                          ) : clearance ? (
                            <StatusBadge status={clearance.status} />
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TD>
                        <TD>{formatDate(document!.createdAt)}</TD>
                        <TD className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            {canManageAssets && resendableHandover ? (
                              <ResendAckButton kind="handover" targetId={handover!.id} defaultEmail={person.email} label="" />
                            ) : null}
                            <a
                              href={`/api/documents/${document!.id}/download?inline=1`}
                              target="_blank"
                              rel="noopener"
                              aria-label={`View ${document!.name}`}
                              title="View in browser"
                              className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-accent"
                            >
                              <Eye className="h-4 w-4" />
                            </a>
                            <a
                              href={`/api/documents/${document!.id}/download`}
                              aria-label={`Download ${document!.name}`}
                              title="Download"
                              className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-accent"
                            >
                              <Download className="h-4 w-4" />
                            </a>
                            {canManage ? <PersonDocumentDelete personId={person.id} documentId={document!.id} /> : null}
                          </div>
                        </TD>
                      </TR>
                    );
                  })}
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
