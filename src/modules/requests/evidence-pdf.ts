import { db } from "@/shared/db";
import { storage } from "@/shared/storage/storage";
import { getSetting, SETTING_KEYS } from "@/shared/settings/settings";
import { BRAND_PRIMARY } from "@/shared/branding";
import { renderPdf, type PdfSection } from "@/shared/pdf/pdf";
import { formatDate, formatDateTime } from "@/shared/utils";
import type { AuthenticatedUser } from "@/shared/auth/session";

/** Read the configured request-form logos from storage, so the evidence PDF
 * carries the same header as the public request forms (Doc 03 Ch9). */
async function loadRequestFormLogos(): Promise<{ left?: Buffer; center?: Buffer; right?: Buffer } | null> {
  try {
    const config = await getSetting<Record<string, { storageKey: string } | null>>(SETTING_KEYS.REQUEST_FORM_LOGOS);
    const positions = ["left", "center", "right"] as const;
    const result: { left?: Buffer; center?: Buffer; right?: Buffer } = {};
    let any = false;
    for (const position of positions) {
      const key = config[position]?.storageKey;
      if (!key) continue;
      try {
        result[position] = await storage.read(key);
        any = true;
      } catch {
        /* ignore missing file */
      }
    }
    return any ? result : null;
  } catch {
    return null;
  }
}

const cell = (value: unknown): string =>
  Array.isArray(value)
    ? value.join(", ")
    : value === null || value === undefined || value === ""
      ? "—"
      : String(value);

/**
 * Per-request evidence PDF (SDS Doc 09 Ch9, Doc 16): the submitted form, its
 * answers and the full approval trail on one document, which is what an auditor
 * asks to be handed for a sampled request.
 *
 * Lives here rather than in the route so the audit report's bulk ZIP download
 * builds the exact same document one call at a time.
 */
export async function buildRequestEvidencePdf(
  user: AuthenticatedUser,
  requestId: string,
): Promise<{ fileName: string; data: Buffer } | null> {
  const request = await db.request.findFirst({
    where: { id: requestId },
    include: {
      company: true,
      form: { select: { name: true } },
      formVersion: { include: { fields: { orderBy: { displayOrder: "asc" } } } },
      items: {
        include: {
          application: { select: { name: true } },
          applicationRole: { select: { name: true } },
          assetCategory: { select: { name: true } },
          workflowInstances: {
            include: {
              stepInstances: {
                orderBy: { stepOrder: "asc" },
                include: { actions: { include: { person: true }, orderBy: { createdAt: "asc" } } },
              },
            },
          },
        },
      },
    },
  });
  if (!request) return null;
  if (request.companyId !== user.companyId && user.systemRoleKey !== "SYSTEM_ADMINISTRATOR") return null;

  const formName = request.form?.name ?? request.items[0]?.formNameSnapshot ?? "Request";

  const sections: PdfSection[] = [
    {
      heading: "Requested by",
      fields: [
        { label: "Name", value: request.requesterName },
        { label: "Employee ID", value: request.requesterEmployeeId ?? "None" },
        { label: "Email", value: request.requesterEmail },
        { label: "Department", value: request.requesterDepartment ?? "None" },
        { label: "Position", value: request.requesterPosition ?? "None" },
      ],
    },
    {
      heading: "Requested for",
      fields: [
        { label: "Name", value: request.requestedForName },
        { label: "Employee ID", value: request.requestedForEmployeeId ?? "None" },
        { label: "Email", value: request.requestedForEmail },
        { label: "Department", value: request.requestedForDepartment ?? "None" },
        { label: "Position", value: request.requestedForPosition ?? "None" },
      ],
    },
  ];

  // Answers to the form's own questions.
  const formValues = (request.fieldData ?? {}) as Record<string, unknown>;
  const formFields = request.formVersion?.fields ?? [];
  if (formFields.length > 0) {
    const answered = formFields
      .map((field) => ({ label: field.label, value: cell(formValues[field.fieldKey]) }))
      .filter((entry) => entry.value !== "—");
    if (answered.length > 0) {
      sections.push({ heading: "Form responses", fields: answered });
    }
  }

  // Group items by kind: applications/role-changes into one table, asset
  // requests/checkouts into another. Each is shown only when it has items.
  const isAppItem = (type: string) => type === "APPLICATION" || type === "ROLE_CHANGE";
  const appItems = request.items.filter((item) => isAppItem(item.itemType));
  const assetItems = request.items.filter((item) => !isAppItem(item.itemType));

  if (appItems.length > 0) {
    sections.push({
      heading: "Applications requested",
      table: {
        headers: ["Application", "Access role", "Status"],
        rows: appItems.map((item) => [
          item.application?.name ?? item.targetNameSnapshot ?? item.description ?? "—",
          item.applicationRole?.name ?? item.roleNameSnapshot ?? "—",
          item.status.replace(/_/g, " "),
        ]),
      },
    });
  }

  if (assetItems.length > 0) {
    sections.push({
      heading: "Assets requested",
      table: {
        headers: ["Asset", "Category", "Status"],
        rows: assetItems.map((item) => [
          item.targetNameSnapshot ?? item.assetCategory?.name ?? item.description ?? "—",
          item.assetCategory?.name ?? "—",
          item.status.replace(/_/g, " "),
        ]),
      },
    });
  }

  // Per-item answers to item-level custom fields, kept compact and only when present.
  for (const item of request.items) {
    const labels = (item.fieldLabelsSnapshot as Record<string, string> | null) ?? {};
    const answers = (item.itemData as Record<string, unknown> | null) ?? {};
    const target =
      item.application?.name ?? item.assetCategory?.name ?? item.targetNameSnapshot ?? item.description ?? "Item";
    // Only the extra requested fields belong here; dates live in Approval history.
    const detailFields = Object.entries(answers)
      .map(([key, value]) => ({ label: labels[key] ?? key.replace(/_/g, " "), value: cell(value) }))
      .filter((entry) => entry.value !== "—");
    if (detailFields.length > 0) {
      sections.push({ heading: `Details — ${target}`, fields: detailFields });
    }
  }

  // Consolidated approval history across every item, with an Item column so a
  // single table tells the whole approval story.
  const historyRows: string[][] = [];
  for (const item of request.items) {
    const target =
      item.application?.name ?? item.assetCategory?.name ?? item.targetNameSnapshot ?? item.description ?? "Item";
    const steps = item.workflowInstances.flatMap((instance) => instance.stepInstances);
    // Collect every event for this item so the history reads as a true timeline.
    // A correction restart re-approves earlier steps, so the same step can carry
    // several dated decisions; grouping a step's rows together would place, e.g.,
    // both Department Head approvals side by side and hide the correction that
    // happened between them. Sorting by date puts each event where it occurred.
    const events: { order: number; date: Date | null; row: string[] }[] = [];
    for (const step of steps) {
      for (const action of step.actions) {
        events.push({
          order: step.stepOrder,
          date: action.createdAt,
          row: [
            target,
            step.stepName,
            `${action.person.firstName} ${action.person.lastName}`,
            action.action.replace(/_/g, " "),
            // Date on top, time below, so the timeline is precise to the minute.
            formatDateTime(action.createdAt).replace(" ", "\n"),
            action.comments ?? "",
          ],
        });
      }
      // A pending row when the step still awaits a decision: either it has no
      // decision yet, or it was re-activated after a correction (in which case
      // its earlier correction row would otherwise make it look finished). An
      // ACTIVE step reads as "Pending" to the approver.
      if (step.actions.length === 0 || step.status === "ACTIVE") {
        const shown = step.status === "ACTIVE" ? "PENDING" : step.status.replace(/_/g, " ");
        events.push({ order: step.stepOrder, date: null, row: [target, step.stepName, "—", shown, "—", ""] });
      }
    }
    // Dated events first, in the order they happened; still-pending steps after,
    // in workflow order (they have no date and lie in the request's future).
    events.sort((a, b) => {
      if (a.date && b.date) return a.date.getTime() - b.date.getTime();
      if (a.date) return -1;
      if (b.date) return 1;
      return a.order - b.order;
    });
    for (const event of events) historyRows.push(event.row);
  }
  if (historyRows.length > 0) {
    sections.push({
      heading: "Approval history",
      table: {
        headers: ["Item", "Step", "Decision by", "Decision", "Date", "Comments"],
        rows: historyRows,
      },
    });
  }

  // Forensic signature evidence: where each signing act (the submission and each
  // approval decision) originated, and a hash of the exact content signed, so the
  // integrity of the record can be verified by re-hashing later.
  const evidenceRows: string[][] = [
    [
      "Submission",
      request.requesterName,
      formatDate(request.submittedAt),
      request.sourceIp ?? "—",
      request.submissionHash ?? "—",
    ],
  ];
  for (const item of request.items) {
    for (const instance of item.workflowInstances) {
      for (const step of instance.stepInstances) {
        for (const action of step.actions) {
          evidenceRows.push([
            `${step.stepName} — ${action.action.replace(/_/g, " ")}`,
            `${action.person.firstName} ${action.person.lastName}`,
            formatDate(action.createdAt),
            action.ipAddress ?? "—",
            action.contentHash ?? "—",
          ]);
        }
      }
    }
  }
  sections.push({
    heading: "Signature evidence",
    table: {
      headers: ["Event", "By", "Date", "IP address", "Verification hash (SHA-256)"],
      rows: evidenceRows,
    },
  });

  const logos = await loadRequestFormLogos();

  const pdf = await renderPdf({
    title: formName,
    subtitle: request.company.name,
    meta: [
      { label: "Request number", value: request.requestNumber },
      { label: "Submitted", value: formatDate(request.submittedAt) },
      { label: "Status", value: request.status.replace(/_/g, " ") },
    ],
    branding: {
      systemName: "Axivo",
      companyName: request.company.name,
      primaryColor: BRAND_PRIMARY,
      ...(logos ? { logos } : {}),
    },
    sections,
    footerNote: "Approval evidence generated from the Axivo audit trail.",
  });

  return { fileName: `${request.requestNumber}.pdf`, data: pdf };
}
