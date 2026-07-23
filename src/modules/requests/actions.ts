"use server";

import { revalidatePath } from "next/cache";
import { requirePermission, publicAuditContext } from "@/shared/auth/guard";
import { ok, toActionError, BusinessRuleError, type ActionResult } from "@/shared/errors";
import { parseInput as parse } from "@/shared/validation/common";
import { validateToken, consumeToken } from "@/shared/tokens/secure-tokens";
import { db } from "@/shared/db";
import { recordAudit } from "@/shared/audit/audit";
import * as service from "./service";
import * as assetsService from "@/modules/assets/service";
import * as credentialsService from "@/modules/credentials/service";
import {
  publicSubmissionSchema,
  correctionSubmissionSchema,
  implementationSchema,
} from "./validators";

/** Requests server actions (SDS Doc 09) including public token flows. */

export async function submitPublicRequestAction(
  raw: unknown,
): Promise<ActionResult<{ requestNumber: string; confirmationMessage: string | null }>> {
  try {
    const input = parse(publicSubmissionSchema, raw);
    const context = await publicAuditContext(input.requesterEmail);
    const result = await service.submitPublicRequest(context, input);
    return ok({
      requestNumber: result.requestNumber,
      confirmationMessage: result.confirmationMessage,
    });
  } catch (error) {
    return toActionError(error);
  }
}

/** Correction resubmission through the secure email token (Doc 09 Ch6). */
export async function submitCorrectionAction(
  token: string,
  raw: unknown,
): Promise<ActionResult<undefined>> {
  try {
    const input = parse(correctionSubmissionSchema, raw);
    const validation = await validateToken(token, "CORRECTION_EDIT");
    if (!validation.valid) {
      const context = await publicAuditContext("email-token");
      await recordAudit(context, {
        module: "security",
        eventType: "token.validation_failed",
        action: `Correction token rejected (${validation.reason})`,
        outcome: "DENIED",
      });
      throw new BusinessRuleError("This correction link is no longer valid. Contact IT for assistance.");
    }
    const context = await publicAuditContext(validation.record.email);
    await service.submitCorrection(context, validation.record.targetId, input);
    await consumeToken(validation.record.id);
    return ok(undefined);
  } catch (error) {
    return toActionError(error);
  }
}

/** Handover acknowledgement through the secure email token (Doc 11 Ch6). */
export async function acknowledgeHandoverAction(token: string): Promise<ActionResult<undefined>> {
  try {
    const validation = await validateToken(token, "ASSET_HANDOVER");
    if (!validation.valid) {
      throw new BusinessRuleError("This handover link is no longer valid. Contact IT for assistance.");
    }
    const context = await publicAuditContext(validation.record.email);
    await assetsService.acknowledgeHandover(context, validation.record.targetId);
    await consumeToken(validation.record.id);
    // Progress any request item waiting on this acknowledgement.
    const handover = await db.handover.findUnique({
      where: { id: validation.record.targetId },
      include: { assets: { include: { assetAssignment: true } } },
    });
    const itemIds = new Set(
      (handover?.assets ?? [])
        .map((asset) => asset.assetAssignment.requestItemId)
        .filter((id): id is string => id !== null),
    );
    for (const itemId of itemIds) {
      await service.maybeCompleteItem(context, itemId);
    }
    // The item may have just reached COMPLETED; without this the requests list
    // keeps serving a cached "Implementation Pending".
    revalidatePath("/requests", "layout");
    return ok(undefined);
  } catch (error) {
    return toActionError(error);
  }
}

/** Credential acknowledgement + one-time reveal (Doc 08 Ch6). */
export async function acknowledgeCredentialsAction(
  token: string,
): Promise<ActionResult<credentialsService.RevealedCredentials>> {
  try {
    const validation = await validateToken(token, "CREDENTIAL_ACKNOWLEDGEMENT");
    if (!validation.valid) {
      throw new BusinessRuleError(
        "This credentials link is no longer valid. Contact IT to resend your credentials.",
      );
    }
    const context = await publicAuditContext(validation.record.email);
    const revealed = await credentialsService.acknowledgeAndReveal(context, validation.record.targetId);
    await consumeToken(validation.record.id);
    const delivery = await db.credentialDelivery.findUnique({
      where: { id: validation.record.targetId },
      select: { requestItemId: true },
    });
    if (delivery?.requestItemId) {
      await service.maybeCompleteItem(context, delivery.requestItemId);
    }
    revalidatePath("/requests", "layout");
    return ok(revealed);
  } catch (error) {
    return toActionError(error);
  }
}

// --- Portal actions ---

export async function completeImplementationAction(raw: unknown): Promise<ActionResult<undefined>> {
  try {
    const context = await requirePermission("requests.implement");
    const input = parse(implementationSchema, raw);
    await service.completeImplementation(context.audit, context.user, input);
    revalidatePath("/requests");
    return ok(undefined);
  } catch (error) {
    return toActionError(error);
  }
}

export async function cancelRequestAction(requestId: string, reason: string): Promise<ActionResult<undefined>> {
  try {
    const { audit } = await requirePermission("requests.admin");
    if (!reason || reason.trim().length === 0) {
      throw new BusinessRuleError("A cancellation reason is required.");
    }
    await service.cancelRequest(audit, requestId, reason.trim());
    revalidatePath("/requests");
    return ok(undefined);
  } catch (error) {
    return toActionError(error);
  }
}

export async function resendCredentialDeliveryAction(
  deliveryId: string,
  newSecret?: string,
  overrideEmail?: string,
): Promise<ActionResult<undefined>> {
  try {
    const { audit } = await requirePermission("applications.credentials.deliver");
    await credentialsService.resendDelivery(audit, deliveryId, newSecret || undefined, overrideEmail || undefined);
    revalidatePath("/requests", "layout");
    revalidatePath("/people", "layout");
    return ok(undefined);
  } catch (error) {
    return toActionError(error);
  }
}

export async function revokeCredentialDeliveryAction(deliveryId: string): Promise<ActionResult<undefined>> {
  try {
    const { audit } = await requirePermission("applications.credentials.deliver");
    await credentialsService.revokeDelivery(audit, deliveryId);
    revalidatePath("/requests");
    return ok(undefined);
  } catch (error) {
    return toActionError(error);
  }
}

/**
 * Create the People record for a request's Requested For employee (using the
 * details captured on the form) and link it, so implementation can proceed.
 */
export async function createRequestedForPersonAction(
  requestId: string,
  overrides?: {
    firstName?: string;
    lastName?: string;
    email?: string;
    employeeId?: string;
    departmentId?: string;
    positionTitle?: string;
  },
): Promise<ActionResult<{ personId: string }>> {
  try {
    const { audit } = await requirePermission("people.manage");
    const request = await db.request.findFirst({ where: { id: requestId } });
    if (!request) throw new BusinessRuleError("Request not found.");
    if (request.requestedForPersonId) {
      return ok({ personId: request.requestedForPersonId });
    }
    const companyId = request.requestedForCompanyId ?? request.companyId;
    // IT confirms and may correct the submitted details before the record is
    // created, so the overrides win over what the requester typed.
    const employeeId = (overrides?.employeeId ?? request.requestedForEmployeeId ?? "").trim();
    const email = (overrides?.email ?? request.requestedForEmail ?? "").trim();
    if (!employeeId) {
      throw new BusinessRuleError("This request has no employee ID for the Requested For employee.");
    }

    // Reuse an existing record when one now matches, otherwise create it.
    const existing = await db.person.findFirst({
      where: {
        companyId,
        OR: [
          { employeeId: { equals: employeeId, mode: "insensitive" } },
          { email: { equals: email, mode: "insensitive" } },
        ],
        deletedAt: null,
      },
    });

    let personId: string;
    if (existing) {
      personId = existing.id;
    } else {
      const [submittedFirst, ...submittedRest] = (request.requestedForName ?? "").trim().split(/\s+/);
      const firstName = (overrides?.firstName ?? submittedFirst ?? "").trim() || request.requestedForName;
      const lastName =
        (overrides?.lastName ?? submittedRest.join(" ")).trim() || firstName;
      const departmentId = overrides?.departmentId ?? request.requestedForDepartmentId ?? null;
      const department = departmentId
        ? await db.department.findFirst({ where: { id: departmentId, companyId, deletedAt: null } })
        : null;

      // The position was typed freely on the form, so create it in the
      // catalogue on first use rather than dropping it.
      const positionTitle = (overrides?.positionTitle ?? request.requestedForPosition ?? "").trim();
      let position = positionTitle
        ? await db.position.findFirst({
            where: { companyId, name: { equals: positionTitle, mode: "insensitive" }, deletedAt: null },
          })
        : null;
      if (positionTitle && !position) {
        position = await db.position.create({
          data: { companyId, name: positionTitle, createdById: audit.actorUserId ?? null },
        });
      }
      const created = await db.person.create({
        data: {
          companyId,
          employeeId,
          firstName,
          lastName,
          email,
          departmentId: department?.id ?? null,
          positionId: position?.id ?? null,
          createdById: audit.actorUserId ?? null,
        },
      });
      personId = created.id;
      await recordAudit(audit, {
        module: "people",
        eventType: "person.created",
        action: `Created employee "${request.requestedForName}" from request ${request.requestNumber}`,
        targetType: "person",
        targetId: personId,
        targetLabel: request.requestedForName,
      });
    }

    await db.request.update({ where: { id: requestId }, data: { requestedForPersonId: personId } });
    revalidatePath(`/requests/${requestId}`);
    revalidatePath("/people", "layout");
    return ok({ personId });
  } catch (error) {
    return toActionError(error);
  }
}
