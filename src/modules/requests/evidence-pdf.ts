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
  const isAppItem = (type: string) => type === "APPLICATION_ACCESS" || type === "ROLE_CHANGE";
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
    const detailFields = [
      ...Object.entries(answers)
        .map(([key, value]) => ({ label: labels[key] ?? key.replace(/_/g, " "), value: cell(value) }))
        .filter((entry) => entry.value !== "—"),
      ...(item.implementedAt ? [{ label: "Implemented", value: formatDateTime(item.implementedAt) }] : []),
      ...(item.implementedByLabel ? [{ label: "Implemented by", value: item.implementedByLabel }] : []),
    ];
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
    for (const step of steps) {
      if (step.actions.length > 0) {
        for (const action of step.actions) {
          historyRows.push([
            target,
            step.stepName,
            `${action.person.firstName} ${action.person.lastName}`,
            action.action.replace(/_/g, " "),
            formatDate(action.createdAt),
            action.comments ?? "",
          ]);
        }
      } else {
        historyRows.push([target, step.stepName, "—", step.status.replace(/_/g, " "), "—", ""]);
      }
    }
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
