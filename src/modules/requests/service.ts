import { db, type DbClient } from "@/shared/db";
import { recordAudit, type AuditContext } from "@/shared/audit/audit";
import { BusinessRuleError, NotFoundError, RateLimitedError, ValidationError } from "@/shared/errors";
import { nextRequestNumber } from "@/shared/counters";
import { getSetting, SETTING_KEYS } from "@/shared/settings/settings";
import { matchPersonByEmail } from "@/modules/people/service";
import { getPublicForm } from "@/modules/forms/service";
import { validateSubmissionValues } from "@/modules/forms/submission-validation";
import { listActiveRequestFieldsFor } from "@/modules/request-fields/service";
import * as engine from "@/modules/workflow/engine";
import * as applications from "@/modules/applications/service";
import * as licenses from "@/modules/licenses/service";
import * as assets from "@/modules/assets/service";
import * as credentials from "@/modules/credentials/service";
import { queueNotification } from "@/modules/notifications/service";
import type { AuthenticatedUser } from "@/shared/auth/session";
import type { Prisma } from "@prisma/client";
import type { PublicSubmissionInput, CorrectionSubmissionInput, ImplementationInput } from "./validators";

/**
 * Requests module business logic (SDS Doc 09).
 * Public single-page submission → one request with independent items, each
 * running its own workflow instance. Corrections affect only selected items;
 * implementation is completed by IT after final approval; timelines are
 * immutable and derived from audit events.
 */

const MODULE = "requests";

// ---------------------------------------------------------------------------
// Public submission (Doc 09 Ch3-5)
// ---------------------------------------------------------------------------

export async function submitPublicRequest(
  context: AuditContext,
  input: PublicSubmissionInput,
): Promise<{ requestId: string; requestNumber: string; confirmationMessage: string | null }> {
  // Rate limiting per source IP (Doc 05 Ch7).
  if (context.ipAddress) {
    const limit = await getSetting<number>(SETTING_KEYS.PUBLIC_FORM_RATE_PER_HOUR);
    const recent = await db.request.count({
      where: {
        sourceIp: context.ipAddress,
        submittedAt: { gte: new Date(Date.now() - 3_600_000) },
      },
    });
    if (recent >= limit) {
      await recordAudit(context, {
        module: "security",
        eventType: "public_form.rate_limited",
        action: "Public request submission rate limited",
        outcome: "DENIED",
      });
      throw new RateLimitedError("Too many submissions from your network. Please try again later.");
    }
  }

  const form = await getPublicForm(input.slug);
  if (!form || !form.currentVersion || !form.currentVersion.publishedAt) {
    throw new NotFoundError("This request form is not available.");
  }

  // Server-side validation of dynamic fields (Doc 22).
  const { values, fieldErrors } = validateSubmissionValues(
    form.currentVersion.fields,
    input.fieldValues as Record<string, string | string[]>,
    {},
  );
  if (Object.keys(fieldErrors).length > 0) {
    throw new ValidationError(undefined, fieldErrors);
  }

  // Validate items against the form's company catalogue, then validate each
  // item's answers against the request fields defined on the application or
  // asset category it targets (Doc 08/11). Errors are keyed per item so the
  // form can show them against the right row.
  const itemPayloads: {
    itemData: Record<string, unknown> | null;
    workflowId: string;
  }[] = [];
  const itemFieldErrors: Record<string, string> = {};

  for (const [index, item] of input.items.entries()) {
    let workflowId = form.workflowId;
    let targetFields: Awaited<ReturnType<typeof listActiveRequestFieldsFor>> = [];

    if (item.itemType === "APPLICATION") {
      const application = await db.application.findFirst({
        where: {
          id: item.applicationId,
          isActive: true,
          deletedAt: null,
          OR: [{ companyId: form.companyId }, { isShared: true }],
        },
      });
      if (!application) throw new BusinessRuleError("A selected application is not available.");
      if (item.applicationRoleId) {
        const role = await db.applicationRole.findFirst({
          where: { id: item.applicationRoleId, applicationId: item.applicationId, isActive: true, deletedAt: null },
        });
        if (!role) throw new BusinessRuleError("A selected application role is not available.");
      } else {
        // Only applications with no roles defined may be requested without one.
        const roleCount = await db.applicationRole.count({
          where: { applicationId: application.id, isActive: true, deletedAt: null },
        });
        if (roleCount > 0) {
          throw new BusinessRuleError(`Select an access role for "${application.name}".`);
        }
      }
      // The application's own approval chain wins over the form's, so a mixed
      // request routes each item to the people who actually own it.
      if (application.workflowId) workflowId = application.workflowId;
      targetFields = await listActiveRequestFieldsFor([application.id], []);
    }

    if (item.itemType === "ASSET") {
      const category = await db.assetCategory.findFirst({
        where: { id: item.assetCategoryId, isActive: true, deletedAt: null },
      });
      if (!category) throw new BusinessRuleError("A selected asset category is not available.");
      if (category.workflowId) workflowId = category.workflowId;
      targetFields = await listActiveRequestFieldsFor([], [category.id]);
    }

    let itemData: Record<string, unknown> | null = null;
    if (targetFields.length > 0) {
      const result = validateSubmissionValues(
        targetFields,
        (item.fieldValues ?? {}) as Record<string, string | string[]>,
        {},
      );
      for (const [key, message] of Object.entries(result.fieldErrors)) {
        itemFieldErrors[`item_${index}_${key}`] = message;
      }
      itemData = result.values;
    }
    itemPayloads.push({ itemData, workflowId });
  }
  if (Object.keys(itemFieldErrors).length > 0) {
    throw new ValidationError(undefined, itemFieldErrors);
  }

  // Both participants name their own company (forms may be shared), so each
  // one's department and position are validated against their own company.
  const [requesterCompany, requestedForCompany] = await Promise.all([
    db.company.findFirst({ where: { id: input.requesterCompanyId, deletedAt: null, isActive: true } }),
    db.company.findFirst({ where: { id: input.requestedForCompanyId, deletedAt: null, isActive: true } }),
  ]);
  if (!requesterCompany) {
    throw new ValidationError(undefined, { requesterCompanyId: "Please select a valid company." });
  }
  if (!requestedForCompany) {
    throw new ValidationError(undefined, { requestedForCompanyId: "Please select a valid company." });
  }

  // Departments and positions are stored as immutable name snapshots; the
  // Requested For department drives Department Head routing (Doc 06 Ch3).
  const [requesterDepartment, requestedForDepartment] =
    await Promise.all([
      db.department.findFirst({
        where: { id: input.requesterDepartmentId, companyId: requesterCompany.id, deletedAt: null },
      }),
      db.department.findFirst({
        where: { id: input.requestedForDepartmentId, companyId: requestedForCompany.id, deletedAt: null },
      }),
    ]);
  if (!requesterDepartment || !requestedForDepartment) {
    throw new ValidationError(undefined, {
      requestedForDepartmentId: "Please select a valid department.",
    });
  }

  // Match participants to People (Doc 00 §6): company + employee ID first,
  // then email as a fallback. This is what implementation later assigns to.
  const matchByEmployeeId = (companyId: string, employeeId: string) =>
    db.person.findFirst({
      where: { companyId, employeeId: { equals: employeeId, mode: "insensitive" }, deletedAt: null },
    });
  const [requesterById, requestedForById] = await Promise.all([
    matchByEmployeeId(requesterCompany.id, input.requesterEmployeeId),
    matchByEmployeeId(requestedForCompany.id, input.requestedForEmployeeId),
  ]);
  const [requesterMatch, requestedForMatch] = await Promise.all([
    requesterById ?? matchPersonByEmail(requesterCompany.id, input.requesterEmail),
    requestedForById ?? matchPersonByEmail(requestedForCompany.id, input.requestedForEmail),
  ]);

  const { requestId, requestNumber, instanceIds } = await db.$transaction(async (tx) => {
    const number = await nextRequestNumber(tx);
    const request = await tx.request.create({
      data: {
        requestNumber: number,
        companyId: form.companyId,
        formId: form.id,
        formVersionId: form.currentVersion!.id,
        status: "PENDING_APPROVAL",
        requesterPersonId: requesterMatch?.id ?? null,
        requesterName: input.requesterName,
        requesterEmail: input.requesterEmail,
        requesterEmployeeId: input.requesterEmployeeId,
        requesterDepartment: requesterDepartment.name,
        requesterPosition: input.requesterPositionTitle,
        requesterCompanyId: requesterCompany.id,
        requestedForPersonId: requestedForMatch?.id ?? null,
        requestedForName: input.requestedForName,
        requestedForEmail: input.requestedForEmail,
        requestedForEmployeeId: input.requestedForEmployeeId,
        requestedForDepartment: requestedForDepartment.name,
        requestedForPosition: input.requestedForPositionTitle,
        requestedForDepartmentId: requestedForDepartment.id,
        requestedForCompanyId: requestedForCompany.id,
        fieldData: values as Prisma.InputJsonValue,
        sourceIp: context.ipAddress,
      },
    });

    const createdInstanceIds: string[] = [];
    for (const [index, item] of input.items.entries()) {
      const payload = itemPayloads[index]!;
      const requestItem = await tx.requestItem.create({
        data: {
          requestId: request.id,
          itemType: item.itemType,
          applicationId: item.applicationId ?? null,
          applicationRoleId: item.applicationRoleId ?? null,
          assetCategoryId: item.assetCategoryId ?? null,
          description: item.description ?? null,
          itemData: (payload.itemData ?? undefined) as Prisma.InputJsonValue | undefined,
          status: "PENDING_APPROVAL",
        },
      });
      // Every item runs its own workflow instance (Doc 00 §4), taken from the
      // application or category when it names one and the form's otherwise.
      const instanceId = await engine.createInstanceForItem(tx, requestItem.id, payload.workflowId);
      createdInstanceIds.push(instanceId);
    }

    await recordAudit(
      { ...context, companyId: form.companyId },
      {
        module: MODULE,
        eventType: "request.submitted",
        action: `Request ${number} submitted via form "${form.name}" (${input.items.length} item(s))`,
        targetType: "request",
        targetId: request.id,
        targetLabel: number,
      },
      tx,
    );
    return { requestId: request.id, requestNumber: number, instanceIds: createdInstanceIds };
  });

  // Activate first steps after commit (sends approval emails).
  for (const instanceId of instanceIds) {
    try {
      await engine.activateStep(context, instanceId, 1);
    } catch (error) {
      console.error(`[axivo] Failed to activate workflow instance ${instanceId}:`, error);
    }
  }

  // Submission confirmation to the requester.
  await queueNotification({
    companyId: form.companyId,
    eventType: "REQUEST_SUBMITTED",
    subject: `Request ${requestNumber} received`,
    body: `Dear ${input.requesterName},<br/><br/>Your request <strong>${requestNumber}</strong> has been received and routed for approval. You will be notified of progress by email.`,
    recipients: [{ email: input.requesterEmail, name: input.requesterName }],
    entityType: "request",
    entityId: requestId,
    dedupeKey: `request-submitted:${requestId}`,
  });

  return { requestId, requestNumber, confirmationMessage: form.confirmationMessage };
}

// ---------------------------------------------------------------------------
// Corrections (Doc 09 Ch4/6)
// ---------------------------------------------------------------------------

export async function submitCorrection(
  context: AuditContext,
  requestItemId: string,
  input: CorrectionSubmissionInput,
): Promise<void> {
  const item = await db.requestItem.findFirst({
    where: { id: requestItemId },
    include: { request: { include: { formVersion: { include: { fields: true } } } } },
  });
  if (!item) throw new NotFoundError("Request item not found.");
  if (item.status !== "CORRECTION_REQUESTED") {
    throw new BusinessRuleError("This item is not awaiting correction.");
  }
  const correction = await db.requestCorrection.findFirst({
    where: { requestItemId, submittedAt: null },
    orderBy: { requestedAt: "desc" },
  });
  if (!correction) throw new BusinessRuleError("No open correction round for this item.");

  // Validate corrected shared field values if provided.
  let cleanedValues: Record<string, unknown> | undefined;
  if (input.fieldValues && Object.keys(input.fieldValues).length > 0) {
    const { values, fieldErrors } = validateSubmissionValues(
      item.request.formVersion.fields,
      input.fieldValues as Record<string, string | string[]>,
      {},
    );
    if (Object.keys(fieldErrors).length > 0) {
      throw new ValidationError(undefined, fieldErrors);
    }
    cleanedValues = values;
  }

  await db.$transaction(async (tx) => {
    await tx.requestCorrection.update({
      where: { id: correction.id },
      data: {
        submittedAt: new Date(),
        correctedData: {
          fieldValues: cleanedValues ?? null,
          itemDescription: input.itemDescription ?? null,
          comments: input.comments ?? null,
        } as Prisma.InputJsonValue,
      },
    });
    if (input.itemDescription) {
      await tx.requestItem.update({
        where: { id: requestItemId },
        data: { description: input.itemDescription },
      });
    }
    if (cleanedValues) {
      // Corrections update the request's field data; the original snapshot is
      // preserved in the correction record (Doc 09 Ch4).
      await tx.request.update({
        where: { id: item.requestId },
        data: { fieldData: cleanedValues as Prisma.InputJsonValue },
      });
    }
    await recordAudit(
      { ...context, companyId: item.request.companyId },
      {
        module: MODULE,
        eventType: "request.correction_submitted",
        action: `Correction submitted for item on ${item.request.requestNumber}`,
        targetType: "request_item",
        targetId: requestItemId,
        targetLabel: item.request.requestNumber,
      },
      tx,
    );
  });

  // Resume the item's workflow at the step that requested the correction.
  await engine.resumeAfterCorrection(context, requestItemId);
  await engine.rollupRequestStatus(context, item.requestId);
}

// ---------------------------------------------------------------------------
// Implementation stage (Doc 09 Ch8)
// ---------------------------------------------------------------------------

async function assertUserMayImplement(user: AuthenticatedUser, requestItemId: string): Promise<void> {
  if (user.systemRoleKey === "SYSTEM_ADMINISTRATOR") return;
  const item = await db.requestItem.findFirst({
    where: { id: requestItemId },
    include: { request: true },
  });
  if (!item) throw new NotFoundError("Request item not found.");
  const instance = await db.workflowInstance.findFirst({
    where: { requestItemId, status: "APPROVED" },
    orderBy: { startedAt: "desc" },
    include: { stepInstances: { where: { stepType: "IT_IMPLEMENTATION", status: "ACTIVE" } } },
  });
  const step = instance?.stepInstances[0];
  if (!step) throw new BusinessRuleError("This item is not awaiting implementation.");
  const implementers = await engine.resolveApprovers(db, {
    companyId: item.request.companyId,
    approvalRoleId: step.approvalRoleId,
    requestedForDepartmentId: item.request.requestedForDepartmentId,
    allowDelegation: true,
  });
  // Only assigned IT Implementation users may complete implementation (Doc 09 Ch8).
  if (!implementers.some((implementer) => implementer.person.id === user.personId)) {
    throw new BusinessRuleError("Only assigned IT Implementation users may complete this implementation.");
  }
}

/**
 * Pick the license a seat is taken from when implementing an application item
 * (Doc 10 Ch7). The application's own linked licenses are the only candidates,
 * so unrelated licenses can never be consumed by mistake. Only an application
 * with several linked licenses in the employee's company needs a choice.
 */
async function resolveLicenseForApplication(
  tx: DbClient,
  applicationId: string | null,
  personId: string,
  chosenLicenseId: string | undefined,
): Promise<string> {
  const person = await tx.person.findFirst({ where: { id: personId }, select: { companyId: true } });
  if (!person) throw new NotFoundError("Employee not found.");
  const candidates = await tx.license.findMany({
    where: {
      applicationId,
      companyId: person.companyId,
      status: "ACTIVE",
      isActive: true,
      deletedAt: null,
    },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  if (candidates.length === 0) {
    throw new BusinessRuleError(
      "This application requires a license but has none linked in the employee's company. Link a license to the application first.",
    );
  }
  if (chosenLicenseId) {
    if (!candidates.some((candidate: { id: string }) => candidate.id === chosenLicenseId)) {
      throw new ValidationError(undefined, {
        licenseId: "Choose one of the licenses linked to this application.",
      });
    }
    return chosenLicenseId;
  }
  if (candidates.length > 1) {
    throw new ValidationError(undefined, {
      licenseId: `This application has ${candidates.length} linked licenses. Select which one to assign.`,
    });
  }
  const only = candidates[0];
  if (!only) throw new BusinessRuleError("No license is linked to this application.");
  return only.id;
}

/**
 * Complete IT implementation for an approved request item: create the
 * application/license/asset assignments, prepare credential delivery, close
 * the workflow instance and progress the item (Doc 09 Ch8, Doc 10 Ch7,
 * Doc 11 Ch12).
 */
export async function completeImplementation(
  context: AuditContext,
  user: AuthenticatedUser,
  input: ImplementationInput,
): Promise<void> {
  const item = await db.requestItem.findFirst({
    where: { id: input.requestItemId },
    include: {
      request: true,
      application: { include: { credentialFields: true } },
      assetCategory: true,
    },
  });
  if (!item) throw new NotFoundError("Request item not found.");
  if (item.status !== "IMPLEMENTATION_PENDING") {
    throw new BusinessRuleError("This item is not awaiting implementation.");
  }
  await assertUserMayImplement(user, input.requestItemId);

  const requestedForPersonId = item.request.requestedForPersonId;
  let deliveryId: string | null = null;
  const handoverAssignmentIds: string[] = [];
  let requiresCredentialAck = false;
  let requiresHandoverAck = false;

  await db.$transaction(async (tx) => {
    if (item.itemType === "APPLICATION") {
      if (!item.applicationId) throw new BusinessRuleError("This item has no application.");
      if (!requestedForPersonId) {
        throw new BusinessRuleError(
          "The Requested For employee has no People record yet. Create the employee record first, then complete implementation.",
        );
      }
      if (!input.username) {
        throw new ValidationError(undefined, { username: "Username is required for application implementation." });
      }
      const assignment = await applications.createAssignment(
        context,
        {
          personId: requestedForPersonId,
          applicationId: item.applicationId,
          applicationRoleId: item.applicationRoleId ?? undefined,
          username: input.username,
          notes: input.notes,
        },
        { requestItemId: item.id, status: "ACTIVE", implementedById: user.userId },
        tx,
      );
      // License consumption (Doc 10 Ch7): assigned during implementation only.
      // The application already names its licenses, so a seat is taken from the
      // linked license automatically rather than making the implementer pick
      // one out of every license in the company.
      if (item.application?.requiresLicense) {
        const licenseId = await resolveLicenseForApplication(
          tx,
          item.applicationId,
          requestedForPersonId,
          input.licenseId,
        );
        await licenses.assignLicense(
          context,
          { licenseId, personId: requestedForPersonId, notes: undefined },
          { requestItemId: item.id },
          tx,
        );
      }
      // Credential delivery preparation (Doc 08 Ch6).
      if (input.temporaryPassword) {
        deliveryId = await credentials.prepareDelivery(context, tx, {
          personId: requestedForPersonId,
          applicationId: item.applicationId,
          applicationAssignmentId: assignment.id,
          requestItemId: item.id,
          username: input.username,
          temporarySecret: input.temporaryPassword,
          customFields: input.credentialFields,
        });
        requiresCredentialAck = true;
      }
    } else if (item.itemType === "ASSET") {
      if (!requestedForPersonId) {
        throw new BusinessRuleError(
          "The Requested For employee has no People record yet. Create the employee record first, then complete implementation.",
        );
      }
      if (input.assetIds.length === 0) {
        throw new ValidationError(undefined, { assetIds: "Select at least one asset to assign." });
      }
      for (const assetId of input.assetIds) {
        const result = await assets.assignAsset(
          context,
          { assetId, personId: requestedForPersonId, notes: input.notes },
          { requestItemId: item.id, skipHandover: true },
          tx,
        );
        if (result.requiresHandover) {
          requiresHandoverAck = true;
          handoverAssignmentIds.push(result.assignment.id);
        }
      }
    }
    // ROLE_CHANGE / GENERAL items are completed with notes only.

    await engine.completeImplementationStep(context, tx, item.id);
    await tx.requestItem.update({
      where: { id: item.id },
      data: {
        status: requiresCredentialAck || requiresHandoverAck ? "IMPLEMENTED" : "COMPLETED",
        implementedAt: new Date(),
        implementedById: user.userId,
        implementationNotes: input.notes ?? null,
      },
    });
    await recordAudit(
      { ...context, companyId: item.request.companyId },
      {
        module: MODULE,
        eventType: "request.implementation_completed",
        action: `Implementation completed for item on ${item.request.requestNumber}`,
        targetType: "request_item",
        targetId: item.id,
        targetLabel: item.request.requestNumber,
      },
      tx,
    );
  });

  // Post-commit side effects: emails and PDFs.
  if (deliveryId) {
    await credentials.sendDeliveryEmail(context, deliveryId);
  }
  if (handoverAssignmentIds.length > 0 && requestedForPersonId) {
    await assets.createHandoverForAssignments(context, requestedForPersonId, handoverAssignmentIds);
  }
  await engine.rollupRequestStatus(context, item.requestId);
}

/**
 * Called when a required acknowledgement completes (credential or handover) to
 * progress IMPLEMENTED items to COMPLETED (Doc 09 Ch4 completion rules).
 */
export async function maybeCompleteItem(context: AuditContext, requestItemId: string): Promise<void> {
  const item = await db.requestItem.findFirst({
    where: { id: requestItemId },
    include: {
      credentialDeliveries: true,
      assetAssignments: { include: { asset: { include: { category: true } } } },
    },
  });
  if (!item || item.status !== "IMPLEMENTED") return;

  const credentialsPending = item.credentialDeliveries.some(
    (delivery) => delivery.status === "PENDING" || delivery.status === "DELIVERED",
  );
  const handoverPending = item.assetAssignments.some(
    (assignment) =>
      assignment.status === "ASSIGNED" &&
      assignment.asset.category.requireHandoverAcceptance &&
      !assignment.acknowledgedAt,
  );
  if (credentialsPending || handoverPending) return;

  await db.requestItem.update({ where: { id: requestItemId }, data: { status: "COMPLETED" } });
  await engine.rollupRequestStatus(context, item.requestId);
}

// ---------------------------------------------------------------------------
// Administration (Doc 09 Ch10)
// ---------------------------------------------------------------------------

export async function cancelRequest(context: AuditContext, requestId: string, reason: string): Promise<void> {
  const request = await db.request.findFirst({
    where: { id: requestId },
    include: { items: true },
  });
  if (!request) throw new NotFoundError("Request not found.");
  if (["COMPLETED", "CANCELLED"].includes(request.status)) {
    throw new BusinessRuleError("Completed or cancelled requests cannot be cancelled.");
  }
  await db.$transaction(async (tx) => {
    for (const item of request.items) {
      if (!["COMPLETED", "REJECTED", "CANCELLED"].includes(item.status)) {
        await engine.cancelItemWorkflow(context, tx, item.id);
        await tx.requestItem.update({ where: { id: item.id }, data: { status: "CANCELLED" } });
      }
    }
    await tx.request.update({
      where: { id: requestId },
      data: { status: "CANCELLED", cancelledAt: new Date(), cancelledById: context.actorUserId ?? null },
    });
    await recordAudit(
      { ...context, companyId: request.companyId },
      {
        module: MODULE,
        eventType: "request.cancelled",
        action: `Cancelled request ${request.requestNumber}`,
        targetType: "request",
        targetId: requestId,
        targetLabel: request.requestNumber,
        details: { reason },
      },
      tx,
    );
  });
}

/** Request timeline derived from immutable audit events (Doc 09 Ch9). */
export async function getRequestTimeline(requestId: string) {
  const request = await db.request.findUnique({
    where: { id: requestId },
    include: { items: { select: { id: true } } },
  });
  if (!request) throw new NotFoundError("Request not found.");
  const itemIds = request.items.map((item) => item.id);
  const stepInstances = await db.workflowStepInstance.findMany({
    where: { workflowInstance: { requestItemId: { in: itemIds } } },
    select: { id: true },
  });
  const targetIds = [requestId, ...itemIds, ...stepInstances.map((step) => step.id)];
  return db.auditEvent.findMany({
    where: { targetId: { in: targetIds } },
    orderBy: { occurredAt: "asc" },
    include: { fieldChanges: true },
  });
}
