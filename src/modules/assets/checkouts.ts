import { db, type DbClient } from "@/shared/db";
import { recordAudit, type AuditContext } from "@/shared/audit/audit";
import { BusinessRuleError, NotFoundError } from "@/shared/errors";
import { createGeneratedPdf } from "@/modules/documents/service";
import { formatDate } from "@/shared/utils";
import type { LeaveType } from "@prisma/client";

/**
 * Asset checkout (SDS Doc 11).
 *
 * An employee taking equipment they already hold off site for a period of
 * leave. Unlike a handover this is requested by the employee and approved
 * through a workflow, and unlike an asset request nothing is being granted:
 * the asset stays assigned to them throughout, and the checkout only records
 * that leaving the office with it was authorised, and when it came back.
 */

const MODULE = "assets";

/** Reserved field keys the checkout form submits its built-in answers under. */
export const CHECKOUT_FIELDS = {
  assetId: "checkout_asset_id",
  leaveType: "checkout_leave_type",
  startDate: "checkout_start_date",
  endDate: "checkout_end_date",
} as const;

export const LEAVE_TYPES: LeaveType[] = ["ANNUAL", "BUSINESS", "SICK", "OTHER"];

export interface CheckoutDraft {
  assetId: string;
  leaveType: LeaveType;
  startDate: Date;
  endDate: Date;
}

/**
 * Validate the built-in checkout answers against the employee's own holdings.
 * Errors are keyed by field so the public form can show them in place.
 */
export async function validateCheckoutValues(
  values: Record<string, unknown>,
  personId: string | null,
  client: DbClient = db,
): Promise<{ draft?: CheckoutDraft; fieldErrors: Record<string, string> }> {
  const fieldErrors: Record<string, string> = {};
  const assetId = String(values[CHECKOUT_FIELDS.assetId] ?? "").trim();
  const leaveType = String(values[CHECKOUT_FIELDS.leaveType] ?? "").trim().toUpperCase();
  const start = String(values[CHECKOUT_FIELDS.startDate] ?? "").trim();
  const end = String(values[CHECKOUT_FIELDS.endDate] ?? "").trim();

  if (!assetId) fieldErrors[CHECKOUT_FIELDS.assetId] = "Select the asset you are taking.";
  if (!LEAVE_TYPES.includes(leaveType as LeaveType)) {
    fieldErrors[CHECKOUT_FIELDS.leaveType] = "Select the type of leave.";
  }
  const startDate = start ? new Date(start) : null;
  const endDate = end ? new Date(end) : null;
  if (!startDate || Number.isNaN(startDate.getTime())) {
    fieldErrors[CHECKOUT_FIELDS.startDate] = "Enter the date you are leaving.";
  }
  if (!endDate || Number.isNaN(endDate.getTime())) {
    fieldErrors[CHECKOUT_FIELDS.endDate] = "Enter the date you are back.";
  }
  if (startDate && endDate && endDate < startDate) {
    fieldErrors[CHECKOUT_FIELDS.endDate] = "The return date cannot be before the start date.";
  }

  // The asset must actually be assigned to this employee. Without this an
  // employee could check out a colleague's laptop by editing the request.
  if (assetId && !fieldErrors[CHECKOUT_FIELDS.assetId]) {
    if (!personId) {
      fieldErrors[CHECKOUT_FIELDS.assetId] =
        "We could not match you to an employee record. Contact IT so your assets can be found.";
    } else {
      const holding = await client.assetAssignment.findFirst({
        where: { assetId, personId, status: "ASSIGNED", deletedAt: null },
      });
      if (!holding) {
        fieldErrors[CHECKOUT_FIELDS.assetId] = "That asset is not currently assigned to you.";
      }
    }
  }

  if (Object.keys(fieldErrors).length > 0) return { fieldErrors };
  return {
    draft: {
      assetId,
      leaveType: leaveType as LeaveType,
      startDate: startDate!,
      endDate: endDate!,
    },
    fieldErrors: {},
  };
}

/** Record the pending checkout alongside the request item that asks for it. */
export async function createCheckoutForRequestItem(
  tx: DbClient,
  params: {
    companyId: string;
    personId: string;
    requestItemId: string;
    draft: CheckoutDraft;
    createdById?: string | null;
  },
): Promise<void> {
  const assignment = await tx.assetAssignment.findFirst({
    where: { assetId: params.draft.assetId, personId: params.personId, status: "ASSIGNED", deletedAt: null },
  });
  await tx.assetCheckout.create({
    data: {
      companyId: params.companyId,
      personId: params.personId,
      assetId: params.draft.assetId,
      assetAssignmentId: assignment?.id ?? null,
      requestItemId: params.requestItemId,
      leaveType: params.draft.leaveType,
      startDate: params.draft.startDate,
      endDate: params.draft.endDate,
      status: "PENDING_APPROVAL",
      createdById: params.createdById ?? null,
    },
  });
}

/**
 * Follow the request item's outcome. Called after every workflow action, so an
 * approval, rejection or cancellation lands on the checkout too. Idempotent:
 * a settled checkout is never rewritten, and the document is generated once.
 */
export async function syncCheckoutsForRequest(
  context: AuditContext,
  requestId: string,
): Promise<void> {
  const checkouts = await db.assetCheckout.findMany({
    where: { requestItem: { requestId }, status: "PENDING_APPROVAL" },
    include: {
      requestItem: true,
      person: { include: { company: true, department: true, position: true } },
      asset: { include: { category: true } },
    },
  });

  for (const checkout of checkouts) {
    const itemStatus = checkout.requestItem?.status;
    if (itemStatus === "REJECTED" || itemStatus === "CANCELLED") {
      await db.assetCheckout.update({
        where: { id: checkout.id },
        data: { status: itemStatus === "REJECTED" ? "REJECTED" : "CANCELLED" },
      });
      continue;
    }
    if (itemStatus !== "COMPLETED" && itemStatus !== "IMPLEMENTED") continue;

    // Approved: file the authorisation in the employee's documents so there is
    // a record they can be shown at the gate.
    let documentId: string | null = null;
    try {
      const document = await createGeneratedPdf(context, {
        companyId: checkout.companyId,
        name: `Asset Checkout - ${checkout.person.firstName} ${checkout.person.lastName} - ${formatDate(checkout.startDate)}`,
        categoryName: "Asset Checkout",
        links: [
          { entityType: "person", entityId: checkout.personId },
          { entityType: "asset", entityId: checkout.assetId },
        ],
        definition: {
          title: "Asset Checkout Authorisation",
          branding: { systemName: "Axivo", companyName: checkout.person.company.name },
          sections: [
            {
              heading: "Employee",
              fields: [
                { label: "Name", value: `${checkout.person.firstName} ${checkout.person.lastName}` },
                { label: "Employee ID", value: checkout.person.employeeId },
                { label: "Company", value: checkout.person.company.name },
                { label: "Department", value: checkout.person.department?.name ?? "None" },
                { label: "Position", value: checkout.person.position?.name ?? "None" },
              ],
            },
            {
              heading: "Asset",
              fields: [
                { label: "Category", value: checkout.asset.category?.name ?? "None" },
                { label: "Asset", value: checkout.asset.name },
                { label: "Model", value: checkout.asset.model ?? "None" },
                { label: "Serial number", value: checkout.asset.serialNumber ?? "None" },
                { label: "Asset tag", value: checkout.asset.assetTag ?? "None" },
              ],
            },
            {
              heading: "Period",
              fields: [
                { label: "Leave type", value: leaveTypeLabel(checkout.leaveType) },
                { label: "From", value: formatDate(checkout.startDate) },
                { label: "Until", value: formatDate(checkout.endDate) },
              ],
            },
            {
              heading: "Terms",
              paragraphs: [
                "This asset remains the property of the company and remains assigned to me for the period above. I will keep it secure while it is off site, and return it on or before the date shown. I will report loss, theft or damage to the IT department immediately.",
              ],
            },
          ],
          footerNote: "Authorised through the Axivo approval workflow.",
        },
      });
      documentId = document.id;
    } catch (error) {
      // A missing PDF must not leave an approved checkout unrecorded.
      console.error("[axivo] Checkout approved but document generation failed:", error);
    }

    await db.assetCheckout.update({
      where: { id: checkout.id },
      data: { status: "APPROVED", documentId },
    });
    await recordAudit(
      { ...context, companyId: checkout.companyId },
      {
        module: MODULE,
        eventType: "asset.checkout_approved",
        action: `Asset checkout approved for ${checkout.person.firstName} ${checkout.person.lastName} (${checkout.asset.name})`,
        targetType: "asset_checkout",
        targetId: checkout.id,
      },
    );
  }
}

/** Check the asset back in when the employee returns (Doc 11). */
export async function checkInAsset(context: AuditContext, checkoutId: string): Promise<void> {
  const checkout = await db.assetCheckout.findUnique({
    where: { id: checkoutId },
    include: { person: true, asset: true },
  });
  if (!checkout) throw new NotFoundError("Checkout not found.");
  if (checkout.status !== "APPROVED") {
    throw new BusinessRuleError("Only an approved checkout that is still out can be checked in.");
  }
  await db.assetCheckout.update({
    where: { id: checkoutId },
    data: { status: "RETURNED", returnedAt: new Date(), returnedById: context.actorUserId ?? null },
  });
  await recordAudit(
    { ...context, companyId: checkout.companyId },
    {
      module: MODULE,
      eventType: "asset.checkout_returned",
      action: `${checkout.asset.name} checked back in from ${checkout.person.firstName} ${checkout.person.lastName}`,
      targetType: "asset_checkout",
      targetId: checkoutId,
    },
  );
}

export function leaveTypeLabel(value: string): string {
  return { ANNUAL: "Annual leave", BUSINESS: "Business travel", SICK: "Sick leave", OTHER: "Other" }[
    value
  ] ?? value;
}
