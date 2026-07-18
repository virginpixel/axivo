import { notFound } from "next/navigation";
import { requirePermission } from "@/shared/auth/guard";
import { db } from "@/shared/db";
import { getRequestTimeline } from "@/modules/requests/service";
import { PageHeader } from "@/shared/ui/page";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { StatusBadge } from "@/shared/ui/badge";
import { formatDateTime } from "@/shared/utils";
import { RequestAdminActions, ImplementationPanel } from "./request-actions";

export const dynamic = "force-dynamic";

/** Request detail with per-item workflow progress and immutable timeline (SDS Doc 09 Ch9). */
export default async function RequestDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { user } = await requirePermission("requests.view");
  const { id } = await params;

  const request = await db.request.findUnique({
    where: { id },
    include: {
      company: true,
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
  const canAdmin = user.permissions.has("requests.admin");
  const fieldData = (request.fieldData ?? {}) as Record<string, unknown>;

  // Licenses selectable during implementation for applications that need one.
  const activeLicenses = await db.license.findMany({
    where: { companyId: request.companyId, status: "ACTIVE", deletedAt: null },
    orderBy: { name: "asc" },
    select: { id: true, name: true, applicationId: true },
  });
  const availableAssets = await db.asset.findMany({
    where: { companyId: request.companyId, status: "AVAILABLE", deletedAt: null },
    orderBy: { assetTag: "asc" },
    select: { id: true, assetTag: true, model: true, categoryId: true },
  });

  return (
    <div>
      <PageHeader
        title={request.requestNumber}
        breadcrumbs={[{ label: "Requests", href: "/requests" }, { label: request.requestNumber }]}
        description={`${request.form.name} · ${request.company.name}`}
        actions={
          canAdmin && !["COMPLETED", "CANCELLED"].includes(request.status) ? (
            <RequestAdminActions requestId={request.id} />
          ) : undefined
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
                <Detail label="Requested by" value={`${request.requesterName} (${request.requesterEmail})`} />
                <Detail label="Requested for" value={`${request.requestedForName} (${request.requestedForEmail})`} />
                <Detail label="Submitted" value={formatDateTime(request.submittedAt)} />
                <Detail label="Completed" value={request.completedAt ? formatDateTime(request.completedAt) : "—"} />
              </dl>
              {Object.keys(fieldData).length > 0 ? (
                <div className="mt-4 rounded-md border bg-muted/40 p-3">
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Submitted details
                  </h3>
                  <dl className="grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
                    {Object.entries(fieldData).map(([key, value]) => (
                      <Detail
                        key={key}
                        label={key.replace(/_/g, " ")}
                        value={Array.isArray(value) ? value.join(", ") : String(value ?? "—")}
                      />
                    ))}
                  </dl>
                </div>
              ) : null}
            </CardContent>
          </Card>

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
                                    ? "bg-primary text-white"
                                    : "bg-muted text-muted-foreground"
                            }`}
                            aria-hidden
                          >
                            {step.stepOrder}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-sm font-medium">{step.stepName}</p>
                              <StatusBadge status={step.status} />
                            </div>
                            {step.assignments.length > 0 ? (
                              <p className="mt-0.5 text-xs text-muted-foreground">
                                Approver(s):{" "}
                                {step.assignments
                                  .map((assignment) => `${assignment.person.firstName} ${assignment.person.lastName}`)
                                  .join(", ")}
                              </p>
                            ) : null}
                            {step.actions.map((action) => (
                              <p key={action.id} className="mt-1 text-xs">
                                <span className="font-medium">
                                  {action.person.firstName} {action.person.lastName}
                                </span>{" "}
                                {action.action.toLowerCase().replace("_", " ")}
                                {action.comments ? <span className="text-muted-foreground"> — “{action.comments}”</span> : null}
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
                      <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Credential deliveries
                      </h4>
                      {item.credentialDeliveries.map((delivery) => (
                        <div key={delivery.id} className="flex items-center justify-between py-1">
                          <span>
                            {delivery.application.name} · {delivery.username}
                          </span>
                          <StatusBadge status={delivery.status} />
                        </div>
                      ))}
                    </div>
                  ) : null}
                  {item.assetAssignments.length > 0 ? (
                    <div className="rounded-md border p-3 text-sm">
                      <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
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
