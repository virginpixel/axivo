import { notFound } from "next/navigation";
import { requirePermission } from "@/shared/auth/guard";
import { db } from "@/shared/db";
import { getRequestTimeline } from "@/modules/requests/service";
import { FileDown } from "lucide-react";
import { PageHeader } from "@/shared/ui/page";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { StatusBadge } from "@/shared/ui/badge";
import { formatDateTime } from "@/shared/utils";
import { RequestAdminActions, ImplementationPanel, StepAdminControls, RequestedForResolution } from "./request-actions";
import { ResendAckButton } from "@/shared/ui/resend-ack-button";
import { isStoredSecretResendable } from "@/modules/credentials/service";
import { AutoRefresh } from "@/shared/ui/auto-refresh";
import { fullName } from "@/shared/utils";
import { listActiveRequestFieldsFor } from "@/modules/request-fields/service";
import { resolveApprovers } from "@/modules/workflow/engine";

export const dynamic = "force-dynamic";

/** Request detail with per-item workflow progress and immutable timeline (SDS Doc 09 Ch9). */
export default async function RequestDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { user } = await requirePermission("requests.view");
  const { id } = await params;

  const request = await db.request.findUnique({
    where: { id },
    include: {
      company: true,
      requestedFor: { select: { id: true, firstName: true, lastName: true } },
      form: { select: { name: true } },
      items: {
        include: {
          application: { include: { credentialFields: { where: { isActive: true, deletedAt: null }, orderBy: { displayOrder: "asc" } } } },
          applicationRole: true,
          assetCategory: true,
          workflowInstances: {
            orderBy: { startedAt: "desc" },
            include: {
              stepInstances: {
                orderBy: { stepOrder: "asc" },
                include: {
                  assignments: { include: { person: true } },
                  actions: { include: { person: true }, orderBy: { createdAt: "asc" } },
                },
              },
            },
          },
          credentialDeliveries: { include: { application: true } },
          assetAssignments: { include: { asset: true } },
        },
      },
    },
  });
  if (!request) notFound();
  if (request.companyId !== user.companyId && user.systemRoleKey !== "SYSTEM_ADMINISTRATOR") {
    notFound();
  }

  const timeline = await getRequestTimeline(id);
  const canImplement = user.permissions.has("requests.implement");
  const canDeliver = user.permissions.has("applications.credentials.deliver");

  // Company of the requested-for employee (forms may be shared across companies).
  const requestedForCompanyName = request.requestedForCompanyId
    ? (await db.company.findUnique({ where: { id: request.requestedForCompanyId }, select: { name: true } }))?.name ?? null
    : request.company.name;
  const canAdmin = user.permissions.has("requests.admin");
  const canWorkflowAdmin = user.permissions.has("workflows.admin");
  const fieldData = (request.fieldData ?? {}) as Record<string, unknown>;

  // People selectable when transferring an approval step.
  const companyPeople = canWorkflowAdmin
    ? await db.person.findMany({
        where: { companyId: request.companyId, deletedAt: null, isActive: true },
        orderBy: { lastName: "asc" },
        select: { id: true, firstName: true, lastName: true },
      })
    : [];
  const transferOptions = companyPeople.map((person) => ({ id: person.id, name: fullName(person) }));

  // Licenses selectable during implementation for applications that need one.
  const activeLicenses = await db.license.findMany({
    where: { companyId: request.companyId, status: "ACTIVE", deletedAt: null },
    orderBy: { name: "asc" },
    select: { id: true, name: true, applicationId: true },
  });
  // Field keys are stored on the item; look up their labels for display.
  const itemRequestFields = await listActiveRequestFieldsFor(
    request.items.map((item) => item.applicationId).filter((id): id is string => !!id),
    request.items.map((item) => item.assetCategoryId).filter((id): id is string => !!id),
  );
  const itemFieldLabels = new Map(itemRequestFields.map((field) => [field.fieldKey, field.label]));

  // Resolve approvers live for every active approval step, so someone added to
  // the role after the step went active is shown and can act. Keyed by step id.
  const liveApprovers = new Map<string, string[]>();
  for (const item of request.items) {
    for (const instance of item.workflowInstances) {
      for (const step of instance.stepInstances) {
        if (step.status !== "ACTIVE" || step.stepType === "IT_IMPLEMENTATION") continue;
        const resolved = await resolveApprovers(db, {
          companyId: request.companyId,
          approvalRoleId: step.approvalRoleId,
          requestedForDepartmentId: request.requestedForDepartmentId,
          allowDelegation: true,
        });
        liveApprovers.set(
          step.id,
          resolved.map((approver) => `${approver.person.firstName} ${approver.person.lastName}`),
        );
      }
    }
  }

  // Offered when IT confirms the details before creating the employee record.
  const requestedForDepartments = await db.department.findMany({
    where: { deletedAt: null, companyId: request.requestedForCompanyId ?? request.companyId },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
  const requestedForPositions = (
    await db.position.findMany({
      where: { deletedAt: null, companyId: request.requestedForCompanyId ?? request.companyId },
      orderBy: { name: "asc" },
      select: { name: true },
    })
  ).map((position) => position.name);

  const availableAssets = await db.asset.findMany({
    where: { companyId: request.companyId, status: "AVAILABLE", deletedAt: null },
    orderBy: { assetTag: "asc" },
    select: { id: true, assetTag: true, model: true, categoryId: true },
  });

  return (
    <div>
      <AutoRefresh />
      <PageHeader
        title={request.requestNumber}
        breadcrumbs={[{ label: "Requests", href: "/requests" }, { label: request.requestNumber }]}
        description={`${request.form.name} · ${request.company.name}`}
        actions={
          <div className="flex items-center gap-2">
            {/* Audit evidence: form, answers and the full approval trail. */}
            <a
              href={`/api/requests/${request.id}/pdf`}
              className="inline-flex h-9 items-center gap-2 rounded-md border px-3 text-sm font-medium hover:bg-accent"
            >
              <FileDown className="h-4 w-4" /> Download PDF
            </a>
            {canAdmin && !["COMPLETED", "CANCELLED"].includes(request.status) ? (
              <RequestAdminActions requestId={request.id} />
            ) : null}
          </div>
        }
      />

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Request information</CardTitle>
                <StatusBadge status={request.status} />
              </div>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                <Detail
                  label="Requested by"
                  value={`${request.requesterName}${request.requesterEmployeeId ? ` (${request.requesterEmployeeId})` : ""} · ${request.requesterEmail}`}
                />
                <Detail
                  label="Requested for"
                  value={`${request.requestedForName}${request.requestedForEmployeeId ? ` (${request.requestedForEmployeeId})` : ""} · ${request.requestedForEmail}`}
                />
                <Detail
                  label="Requester dept / position"
                  value={[request.requesterDepartment, request.requesterPosition].filter(Boolean).join(" · ") || "None"}
                />
                <Detail
                  label="Requested for dept / position"
                  value={[request.requestedForDepartment, request.requestedForPosition].filter(Boolean).join(" · ") || "None"}
                />
                <Detail label="Submitted" value={formatDateTime(request.submittedAt)} />
                <Detail label="Completed" value={request.completedAt ? formatDateTime(request.completedAt) : "None"} />
              </dl>
              {Object.keys(fieldData).length > 0 ? (
                <div className="mt-4 rounded-md border bg-muted/40 p-3">
                  <h3 className="mb-2 label-caps text-muted-foreground">
                    Submitted details
                  </h3>
                  <dl className="grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
                    {Object.entries(fieldData).map(([key, value]) => (
                      <Detail
                        key={key}
                        label={key.replace(/_/g, " ")}
                        value={Array.isArray(value) ? value.join(", ") : String(value ?? "None")}
                      />
                    ))}
                  </dl>
                </div>
              ) : null}
            </CardContent>
          </Card>

          {canImplement && request.items.some((item) => item.status === "IMPLEMENTATION_PENDING") ? (
            <RequestedForResolution
              requestId={request.id}
              personId={request.requestedFor?.id ?? null}
              personName={request.requestedFor ? fullName(request.requestedFor) : null}
              requestedForEmail={request.requestedForEmail}
              requestedForPosition={request.requestedForPosition}
              requestedForDepartmentId={request.requestedForDepartmentId}
              departments={requestedForDepartments}
              positions={requestedForPositions}
              requestedForName={request.requestedForName}
              requestedForEmployeeId={request.requestedForEmployeeId}
              companyName={requestedForCompanyName}
            />
          ) : null}

          {request.items.map((item, index) => {
            const instance = item.workflowInstances[0];
            const label =
              item.application?.name ?? item.assetCategory?.name ?? item.description ?? item.itemType;
            return (
              <Card key={item.id}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle>
                      Item {index + 1}: {label}
                      {item.applicationRole ? (
                        <span className="ml-2 text-sm font-normal text-muted-foreground">
                          ({item.applicationRole.name})
                        </span>
                      ) : null}
                    </CardTitle>
                    <StatusBadge status={item.status} />
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <dl className="grid gap-x-6 gap-y-2 rounded-md border bg-muted/30 p-3 text-sm sm:grid-cols-3">
                    <Detail label="Item type" value={item.itemType.replace(/_/g, " ").toLowerCase()} />
                    {/* Snapshots win: the live record may have been renamed or
                        deleted since the request was submitted. */}
                    {item.application || (item.itemType === "APPLICATION" && item.targetNameSnapshot) ? (
                      <Detail
                        label="Application"
                        value={item.application?.name ?? item.targetNameSnapshot ?? "Removed"}
                      />
                    ) : null}
                    {item.applicationRole || item.roleNameSnapshot ? (
                      <Detail
                        label="Access role"
                        value={item.applicationRole?.name ?? item.roleNameSnapshot ?? "Removed"}
                      />
                    ) : null}
                    {item.assetCategory || (item.itemType === "ASSET" && item.targetNameSnapshot) ? (
                      <Detail
                        label="Asset category"
                        value={item.assetCategory?.name ?? item.targetNameSnapshot ?? "Removed"}
                      />
                    ) : null}
                    {item.description ? <Detail label="Notes" value={item.description} /> : null}
                    {/* Answers to the questions the application or category defines. */}
                    {Object.entries((item.itemData as Record<string, unknown> | null) ?? {}).map(
                      ([key, value]) => (
                        <Detail
                          key={key}
                          label={
                            ((item.fieldLabelsSnapshot as Record<string, string> | null) ?? {})[key] ??
                            itemFieldLabels.get(key) ??
                            key.replace(/_/g, " ")
                          }
                          value={
                            Array.isArray(value)
                              ? value.join(", ")
                              : value === null || value === ""
                                ? "None"
                                : String(value)
                          }
                        />
                      ),
                    )}
                  </dl>
                  {instance ? (
                    <ol className="space-y-2">
                      {instance.stepInstances.map((step) => (
                        <li key={step.id} className="flex items-start gap-3 rounded-md border p-3">
                          <span
                            className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                              step.status === "APPROVED"
                                ? "bg-success text-white"
                                : step.status === "REJECTED"
                                  ? "bg-destructive text-white"
                                  : step.status === "ACTIVE"
                                    ? "bg-warning text-white"
                                    : "bg-muted text-muted-foreground"
                            }`}
                            aria-hidden
                          >
                            {step.stepOrder}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-sm font-medium">{step.stepName}</p>
                              <div className="flex items-center gap-1.5">
                                {canWorkflowAdmin && step.status === "ACTIVE" && step.stepType !== "IT_IMPLEMENTATION" ? (
                                  <StepAdminControls stepInstanceId={step.id} people={transferOptions} />
                                ) : null}
                                {/* An ACTIVE step is awaiting its approver: shown as Pending. */}
                                <StatusBadge status={step.status === "ACTIVE" ? "PENDING" : step.status} />
                              </div>
                            </div>
                            {(() => {
                              // Live-resolved approvers for active steps; the
                              // frozen assignment list otherwise (history).
                              const live = liveApprovers.get(step.id);
                              const names =
                                live && live.length > 0
                                  ? live
                                  : step.assignments.map(
                                      (assignment) =>
                                        `${assignment.person.firstName} ${assignment.person.lastName}`,
                                    );
                              if (names.length > 0) {
                                return (
                                  <p className="mt-0.5 text-xs text-muted-foreground">
                                    Approver(s): {names.join(", ")}
                                  </p>
                                );
                              }
                              // Implementation steps never carry assignees by
                              // design (permission-gated), so no warning there.
                              if (step.status === "ACTIVE" && step.stepType !== "IT_IMPLEMENTATION") {
                                return (
                                  <p className="mt-0.5 text-xs text-destructive">
                                    No approvers resolved for this step.{" "}
                                    <a href="/organization" className="underline">
                                      Assign people to its approval role
                                    </a>
                                    , then use the resend button, or transfer this step to a specific approver.
                                  </p>
                                );
                              }
                              return null;
                            })()}
                            {step.actions.map((action) => (
                              <p key={action.id} className="mt-1 text-xs">
                                <span className="font-medium">
                                  {action.person.firstName} {action.person.lastName}
                                </span>{" "}
                                {action.action.toLowerCase().replace("_", " ")}
                                {action.comments ? <span className="text-muted-foreground">: “{action.comments}”</span> : null}
                              </p>
                            ))}
                          </div>
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <p className="text-sm text-muted-foreground">No workflow instance.</p>
                  )}

                  {item.credentialDeliveries.length > 0 ? (
                    <div className="rounded-md border p-3 text-sm">
                      <h4 className="mb-1 label-caps text-muted-foreground">
                        Credential deliveries
                      </h4>
                      {item.credentialDeliveries.map((delivery) => (
                        <div key={delivery.id} className="flex items-center justify-between gap-2 py-1">
                          <span>
                            {delivery.application.name} · {delivery.username}
                          </span>
                          <span className="flex items-center gap-1">
                            {/* Resend when a link was missed; revoked ones can't. */}
                            {canDeliver && delivery.status !== "REVOKED" ? (
                              <ResendAckButton
                                kind="credential"
                                targetId={delivery.id}
                                defaultEmail={request.requestedForEmail}
                                secretResendable={isStoredSecretResendable(delivery)}
                              />
                            ) : null}
                            <StatusBadge status={delivery.status} />
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : null}
                  {item.assetAssignments.length > 0 ? (
                    <div className="rounded-md border p-3 text-sm">
                      <h4 className="mb-1 label-caps text-muted-foreground">
                        Assigned assets
                      </h4>
                      {item.assetAssignments.map((assignment) => (
                        <div key={assignment.id} className="flex items-center justify-between py-1">
                          <span>
                            {assignment.asset.assetTag} {assignment.asset.model ? `· ${assignment.asset.model}` : ""}
                          </span>
                          <StatusBadge status={assignment.status} />
                        </div>
                      ))}
                    </div>
                  ) : null}

                  {canImplement && item.status === "IMPLEMENTATION_PENDING" ? (
                    <ImplementationPanel
                      requestItemId={item.id}
                      itemType={item.itemType}
                      applicationName={item.application?.name ?? null}
                      requiresLicense={item.application?.requiresLicense ?? false}
                      credentialFields={(item.application?.credentialFields ?? []).map((field) => ({
                        fieldName: field.fieldName,
                        isRequired: field.isRequired,
                        helpText: field.helpText,
                      }))}
                      licenses={activeLicenses
                        .filter((license) => license.applicationId === item.applicationId)
                        .map((license) => ({ id: license.id, name: license.name }))}
                      assets={availableAssets
                        .filter((asset) => !item.assetCategoryId || asset.categoryId === item.assetCategoryId)
                        .map((asset) => ({ id: asset.id, label: `${asset.assetTag}${asset.model ? ` · ${asset.model}` : ""}` }))}
                    />
                  ) : null}
                </CardContent>
              </Card>
            );
          })}
        </div>

        <Card className="h-fit">
          <CardHeader>
            <CardTitle>Timeline</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="relative space-y-4 border-l pl-4">
              {timeline.map((event) => (
                <li key={event.id} className="relative">
                  <span className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-card bg-primary" aria-hidden />
                  <p className="text-sm">{event.action}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatDateTime(event.occurredAt)} · {event.actorLabel}
                  </p>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
