import { db } from "@/shared/db";
import { renderPdf, type PdfSection } from "@/shared/pdf/pdf";
import { formatDate, formatDateTime } from "@/shared/utils";
import type { AuthenticatedUser } from "@/shared/auth/session";

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

  const sections: PdfSection[] = [
    {
      heading: "Request",
      fields: [
        { label: "Request number", value: request.requestNumber },
        // The form may since have been renamed or deleted; the snapshot holds.
        { label: "Form", value: request.form?.name ?? request.items[0]?.formNameSnapshot ?? "Removed" },
        { label: "Status", value: request.status.replace(/_/g, " ") },
        { label: "Submitted", value: formatDateTime(request.submittedAt) },
        { label: "Completed", value: request.completedAt ? formatDateTime(request.completedAt) : "Not yet" },
      ],
    },
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
    sections.push({
      heading: "Form responses",
      fields: formFields.map((field) => {
        const value = formValues[field.fieldKey];
        return {
          label: field.label,
          value: Array.isArray(value) ? value.join(", ") : value === undefined || value === "" ? "None" : String(value),
        };
      }),
    });
  }

  for (const [index, item] of request.items.entries()) {
    const target =
      item.application?.name ?? item.assetCategory?.name ?? item.targetNameSnapshot ?? item.description ?? "Item";
    const role = item.applicationRole?.name ?? item.roleNameSnapshot;
    const labels = (item.fieldLabelsSnapshot as Record<string, string> | null) ?? {};
    const answers = (item.itemData as Record<string, unknown> | null) ?? {};

    sections.push({
      heading: `Item ${index + 1}: ${target}`,
      fields: [
        { label: "Type", value: item.itemType.replace(/_/g, " ") },
        ...(role ? [{ label: "Access role", value: role }] : []),
        { label: "Status", value: item.status.replace(/_/g, " ") },
        ...Object.entries(answers).map(([key, value]) => ({
          label: labels[key] ?? key.replace(/_/g, " "),
          value: Array.isArray(value) ? value.join(", ") : value === null || value === "" ? "None" : String(value),
        })),
        ...(item.implementedAt ? [{ label: "Implemented", value: formatDateTime(item.implementedAt) }] : []),
      ],
    });

    const steps = item.workflowInstances.flatMap((instance) => instance.stepInstances);
    if (steps.length > 0) {
      sections.push({
        table: {
          headers: ["Step", "Status", "Decision by", "Decision", "Date", "Comments"],
          rows: steps.flatMap((step) =>
            step.actions.length > 0
              ? step.actions.map((action) => [
                  step.stepName,
                  step.status,
                  `${action.person.firstName} ${action.person.lastName}`,
                  action.action.replace(/_/g, " "),
                  formatDate(action.createdAt),
                  action.comments ?? "",
                ])
              : [[step.stepName, step.status, "", "", "", ""]],
          ),
        },
      });
    }
  }

  const pdf = await renderPdf({
    title: `Request ${request.requestNumber}`,
    subtitle: `${request.company.name} · ${request.requestedForName}`,
    branding: { systemName: "Axivo", companyName: request.company.name },
    sections,
    footerNote: "Approval evidence generated from the Axivo audit trail.",
  });

  return { fileName: `${request.requestNumber}.pdf`, data: pdf };
}
