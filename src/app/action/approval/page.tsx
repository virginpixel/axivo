import { validateToken } from "@/shared/tokens/secure-tokens";
import { db } from "@/shared/db";
import { ToastProvider } from "@/shared/ui/toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { StatusBadge } from "@/shared/ui/badge";
import { formatDateTime } from "@/shared/utils";
import { ApprovalActionForm } from "./approval-form";
import { ActionShell, InvalidTokenNotice } from "../shell";

export const dynamic = "force-dynamic";

/** Secure email approval page (SDS Doc 09 Ch6, Doc 05 Ch8). */
export default async function ApprovalActionPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  if (!token) return <InvalidTokenNotice reason="malformed" flow="approval" />;

  const validation = await validateToken(token, "APPROVAL_ACTION");
  if (!validation.valid) {
    return <InvalidTokenNotice reason={validation.reason} flow="approval" />;
  }

  const stepInstance = await db.workflowStepInstance.findUnique({
    where: { id: validation.record.targetId },
    include: {
      workflowInstance: {
        include: {
          requestItem: {
            include: {
              request: true,
              application: true,
              applicationRole: true,
              assetCategory: true,
            },
          },
        },
      },
      actions: { include: { person: true }, orderBy: { createdAt: "asc" } },
    },
  });
  if (!stepInstance) return <InvalidTokenNotice reason="not_found" flow="approval" />;

  const item = stepInstance.workflowInstance.requestItem;
  const request = item.request;
  const itemLabel =
    item.application?.name ?? item.assetCategory?.name ?? item.description ?? item.itemType;
  const alreadyDone = stepInstance.status !== "ACTIVE";
  const fieldData = (request.fieldData ?? {}) as Record<string, unknown>;

  return (
    <ToastProvider>
      <ActionShell title="Approval required" subtitle={`Request ${request.requestNumber}`}>
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>{itemLabel}</CardTitle>
              <StatusBadge status={item.status} />
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
              <Detail label="Request number" value={request.requestNumber} />
              <Detail label="Submitted" value={formatDateTime(request.submittedAt)} />
              <Detail label="Requested by" value={`${request.requesterName} (${request.requesterEmail})`} />
              <Detail label="Requested for" value={`${request.requestedForName} (${request.requestedForEmail})`} />
              {item.applicationRole ? <Detail label="Access role" value={item.applicationRole.name} /> : null}
              {item.description ? <Detail label="Notes" value={item.description} /> : null}
              <Detail label="Approval step" value={stepInstance.stepName} />
            </dl>

            {Object.keys(fieldData).length > 0 ? (
              <div className="rounded-md border bg-muted/40 p-3">
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

            {stepInstance.actions.length > 0 ? (
              <div className="rounded-md border p-3 text-sm">
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Actions on this step
                </h3>
                <ul className="space-y-1">
                  {stepInstance.actions.map((action) => (
                    <li key={action.id} className="text-muted-foreground">
                      {action.person.firstName} {action.person.lastName} — {action.action.toLowerCase().replace("_", " ")}
                      {action.comments ? `: "${action.comments}"` : ""}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {alreadyDone ? (
              <p className="rounded-md bg-muted px-4 py-3 text-sm text-muted-foreground">
                This approval step has already been completed (status:{" "}
                {stepInstance.status.toLowerCase().replace("_", " ")}). No further action is required.
              </p>
            ) : (
              <ApprovalActionForm token={token} />
            )}
          </CardContent>
        </Card>
      </ActionShell>
    </ToastProvider>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="text-foreground">{value}</dd>
    </div>
  );
}
