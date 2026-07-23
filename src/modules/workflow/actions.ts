"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/shared/auth/guard";
import { publicAuditContext } from "@/shared/auth/guard";
import { ok, toActionError, BusinessRuleError, type ActionResult } from "@/shared/errors";
import { parseInput as parse } from "@/shared/validation/common";
import { validateToken, consumeToken } from "@/shared/tokens/secure-tokens";
import { db } from "@/shared/db";
import { recordAudit } from "@/shared/audit/audit";
import * as definitions from "./definitions";
import * as engine from "./engine";
import { workflowSchema, approvalActionSchema, delegationSchema } from "./validators";

/** Workflow server actions (SDS Doc 13). */

export async function createWorkflowAction(raw: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const { audit } = await requirePermission("workflows.manage");
    const workflow = await definitions.createWorkflow(audit, parse(workflowSchema, raw));
    revalidatePath("/workflows");
    return ok({ id: workflow.id });
  } catch (error) {
    return toActionError(error);
  }
}

export async function updateWorkflowAction(id: string, raw: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const { audit } = await requirePermission("workflows.manage");
    const version = await definitions.updateWorkflow(audit, id, parse(workflowSchema, raw));
    revalidatePath("/workflows");
    return ok({ id: version.id });
  } catch (error) {
    return toActionError(error);
  }
}

export async function setWorkflowActiveAction(id: string, isActive: boolean): Promise<ActionResult<undefined>> {
  try {
    const { audit } = await requirePermission("workflows.manage");
    await definitions.setWorkflowActive(audit, id, isActive);
    revalidatePath("/workflows");
    return ok(undefined);
  } catch (error) {
    return toActionError(error);
  }
}

export async function deleteWorkflowAction(id: string): Promise<ActionResult<{ id: string }>> {
  try {
    const { audit } = await requirePermission("workflows.manage");
    const result = await definitions.deleteWorkflow(audit, id);
    revalidatePath("/workflows");
    return ok(result);
  } catch (error) {
    return toActionError(error);
  }
}

export async function createDelegationAction(raw: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const { audit } = await requirePermission("workflows.manage");
    const delegation = await definitions.createDelegation(audit, parse(delegationSchema, raw));
    revalidatePath("/workflows");
    return ok({ id: delegation.id });
  } catch (error) {
    return toActionError(error);
  }
}

export async function setDelegationActiveAction(id: string, isActive: boolean): Promise<ActionResult<undefined>> {
  try {
    const { audit } = await requirePermission("workflows.manage");
    await definitions.setDelegationActive(audit, id, isActive);
    revalidatePath("/workflows");
    return ok(undefined);
  } catch (error) {
    return toActionError(error);
  }
}

/**
 * Approver action through a secure email token (Doc 05 Ch8, Doc 09 Ch6).
 * The token authorizes exactly one step for one approver; it is consumed when
 * the action succeeds.
 */
export async function tokenApprovalAction(token: string, raw: unknown): Promise<ActionResult<{ result: string }>> {
  try {
    const input = parse(approvalActionSchema, raw);
    const validation = await validateToken(token, "APPROVAL_ACTION");
    if (!validation.valid) {
      const audit = await publicAuditContext("email-token");
      await recordAudit(audit, {
        module: "security",
        eventType: "token.validation_failed",
        action: `Approval token rejected (${validation.reason})`,
        outcome: "DENIED",
      });
      throw new BusinessRuleError(tokenFailureMessage(validation.reason));
    }
    const record = validation.record;
    if (!record.personId) {
      throw new BusinessRuleError("This approval link is no longer valid.");
    }
    const person = await db.person.findFirst({
      where: { id: record.personId, deletedAt: null, isActive: true },
    });
    if (!person) {
      throw new BusinessRuleError("This approval link is no longer valid.");
    }
    const audit = await publicAuditContext(person.email);
    const result = await engine.applyApprovalAction(
      { ...audit, actorPersonId: person.id, actorLabel: `${person.firstName} ${person.lastName}` },
      {
        stepInstanceId: record.targetId,
        actingPersonId: person.id,
        action: input.action,
        comments: input.comments,
        viaSecureToken: true,
      },
    );
    await consumeToken(record.id);
    return ok({ result: result.result });
  } catch (error) {
    return toActionError(error);
  }
}

/** Approver acting from within the portal (IT Approval role members, etc.). */
export async function portalApprovalAction(
  stepInstanceId: string,
  raw: unknown,
): Promise<ActionResult<{ result: string }>> {
  try {
    const context = await requirePermission("workflows.view");
    const input = parse(approvalActionSchema, raw);
    const result = await engine.applyApprovalAction(context.audit, {
      stepInstanceId,
      actingPersonId: context.user.personId,
      action: input.action,
      comments: input.comments,
      viaSecureToken: false,
    });
    revalidatePath("/requests");
    return ok({ result: result.result });
  } catch (error) {
    return toActionError(error);
  }
}

/** Re-resolve approvers and resend notification emails for a stalled step. */
export async function resendApprovalNotificationsAction(stepInstanceId: string): Promise<ActionResult<undefined>> {
  try {
    const { audit } = await requirePermission("workflows.admin");
    const step = await db.workflowStepInstance.findUnique({
      where: { id: stepInstanceId },
      include: { workflowInstance: { include: { requestItem: { include: { request: true } } } } },
    });
    if (!step || step.status !== "ACTIVE") {
      throw new BusinessRuleError("Only active steps can have notifications resent.");
    }
    if (step.stepType !== "IT_IMPLEMENTATION") {
      // Re-resolve in case assignments changed since activation.
      const request = step.workflowInstance.requestItem.request;
      const approvers = await engine.resolveApprovers(db, {
        companyId: request.companyId,
        approvalRoleId: step.approvalRoleId,
        requestedForDepartmentId: request.requestedForDepartmentId,
        allowDelegation: true,
      });
      for (const approver of approvers) {
        await db.approvalAssignment.upsert({
          where: {
            workflowStepInstanceId_personId: {
              workflowStepInstanceId: stepInstanceId,
              personId: approver.person.id,
            },
          },
          create: {
            workflowStepInstanceId: stepInstanceId,
            personId: approver.person.id,
            delegatedFromPersonId: approver.delegatedFrom?.id ?? null,
          },
          update: {},
        });
      }
    }
    await engine.sendApprovalEmails(audit, stepInstanceId);
    await recordAudit(audit, {
      module: "workflow",
      eventType: "workflow.notifications_resent",
      action: "Resent approval notifications",
      targetType: "workflow_step_instance",
      targetId: stepInstanceId,
    });
    return ok(undefined);
  } catch (error) {
    return toActionError(error);
  }
}

/**
 * Transfer an active approval step to another approver: un-acted assignments
 * are replaced, their tokens revoked, and the new approver is notified.
 */
export async function transferStepApproverAction(
  stepInstanceId: string,
  personId: string,
): Promise<ActionResult<undefined>> {
  try {
    const { audit } = await requirePermission("workflows.admin");
    const step = await db.workflowStepInstance.findUnique({
      where: { id: stepInstanceId },
      include: {
        assignments: true,
        workflowInstance: { include: { requestItem: { include: { request: true } } } },
      },
    });
    if (!step || step.status !== "ACTIVE") {
      throw new BusinessRuleError("Only active approval steps can be transferred.");
    }
    if (step.stepType === "IT_IMPLEMENTATION") {
      throw new BusinessRuleError("Implementation steps are completed through the IT portal.");
    }
    const request = step.workflowInstance.requestItem.request;
    const person = await db.person.findFirst({
      where: { id: personId, companyId: request.companyId, deletedAt: null, isActive: true },
    });
    if (!person) {
      throw new BusinessRuleError("The new approver must be an active person of the same company.");
    }

    await db.$transaction(async (tx) => {
      // Remove approvers who have not acted; acted decisions remain history.
      await tx.approvalAssignment.deleteMany({
        where: { workflowStepInstanceId: stepInstanceId, actedAt: null, personId: { not: personId } },
      });
      await tx.approvalAssignment.upsert({
        where: {
          workflowStepInstanceId_personId: { workflowStepInstanceId: stepInstanceId, personId },
        },
        create: { workflowStepInstanceId: stepInstanceId, personId },
        update: {},
      });
      const { revokeTokensForTarget } = await import("@/shared/tokens/secure-tokens");
      await revokeTokensForTarget("workflow_step_instance", stepInstanceId, tx);
      await recordAudit(
        { ...audit, companyId: request.companyId },
        {
          module: "workflow",
          eventType: "workflow.approver_transferred",
          action: `Transferred step "${step.stepName}" on ${request.requestNumber} to ${person.firstName} ${person.lastName}`,
          targetType: "workflow_step_instance",
          targetId: stepInstanceId,
          targetLabel: step.stepName,
        },
        tx,
      );
    });
    await engine.sendApprovalEmails(audit, stepInstanceId);
    revalidatePath("/requests");
    return ok(undefined);
  } catch (error) {
    return toActionError(error);
  }
}

function tokenFailureMessage(reason: string): string {
  switch (reason) {
    case "expired":
      return "This approval link has expired. Ask IT to resend the notification.";
    case "consumed":
      return "This approval link has already been used.";
    case "revoked":
      return "This approval link is no longer valid because the step has moved on.";
    default:
      return "This approval link is invalid.";
  }
}
