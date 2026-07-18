import { validateToken } from "@/shared/tokens/secure-tokens";
import { db } from "@/shared/db";
import { ToastProvider } from "@/shared/ui/toast";
import { ActionShell, InvalidTokenNotice } from "../shell";
import { CorrectionForm } from "./correction-form";

export const dynamic = "force-dynamic";

/** Secure correction resubmission page (SDS Doc 09 Ch6). */
export default async function CorrectionActionPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  if (!token) return <InvalidTokenNotice reason="malformed" flow="correction" />;

  const validation = await validateToken(token, "CORRECTION_EDIT");
  if (!validation.valid) {
    return <InvalidTokenNotice reason={validation.reason} flow="correction" />;
  }

  const item = await db.requestItem.findUnique({
    where: { id: validation.record.targetId },
    include: {
      request: { include: { formVersion: { include: { fields: { orderBy: { displayOrder: "asc" } } } } } },
      application: true,
      assetCategory: true,
      corrections: { where: { submittedAt: null }, orderBy: { requestedAt: "desc" }, take: 1 },
    },
  });
  if (!item) return <InvalidTokenNotice reason="not_found" flow="correction" />;
  if (item.status !== "CORRECTION_REQUESTED" || item.corrections.length === 0) {
    return (
      <ActionShell title="Nothing to correct">
        <div className="rounded-lg border bg-card p-8 text-center shadow-sm text-sm text-muted-foreground">
          This item is no longer awaiting correction. It may already have been resubmitted.
        </div>
      </ActionShell>
    );
  }

  const itemLabel =
    item.application?.name ?? item.assetCategory?.name ?? item.description ?? item.itemType;

  return (
    <ToastProvider>
      <ActionShell
        title="Correction requested"
        subtitle={`${itemLabel} on request ${item.request.requestNumber}`}
      >
        <div className="mb-4 rounded-lg border border-warning/40 bg-warning/5 p-4 text-sm">
          <p className="font-medium text-warning">Approver comments</p>
          <p className="mt-1">{item.corrections[0]!.requestComments}</p>
        </div>
        <CorrectionForm
          token={token}
          itemDescription={item.description}
          fields={item.request.formVersion.fields.map((field) => ({
            fieldKey: field.fieldKey,
            label: field.label,
            fieldType: field.fieldType,
            isRequired: field.isRequired,
            options: (field.options as string[] | null) ?? [],
          }))}
          currentValues={(item.request.fieldData ?? {}) as Record<string, string | string[]>}
        />
      </ActionShell>
    </ToastProvider>
  );
}
