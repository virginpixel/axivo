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
): Promise<ActionResult<undefined>> {
  try {
    const { audit } = await requirePermission("applications.credentials.deliver");
    await credentialsService.resendDelivery(audit, deliveryId, newSecret || undefined);
    revalidatePath("/requests");
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
