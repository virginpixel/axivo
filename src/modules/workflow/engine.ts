import { db, type DbClient } from "@/shared/db";
import { recordAudit, type AuditContext } from "@/shared/audit/audit";
import { BusinessRuleError, NotFoundError, AuthorizationError } from "@/shared/errors";
import { issueToken, tokenActionUrl, revokeTokensForTarget } from "@/shared/tokens/secure-tokens";
import { queueNotification } from "@/modules/notifications/service";
import type {
  ApprovalActionType,
  Person,
  RequestItemStatus,
  RequestStatus,
  WorkflowStepInstance,
} from "@prisma/client";

/**
 * Workflow execution engine (SDS Doc 13 Ch5-6, Doc 09 Ch5-6).
 *
 * - Each request item runs its own workflow instance created from the form's
 *   assigned workflow (active version at submission time).
 * - Steps execute sequentially; approvers are resolved at activation time from
 *   organizational assignments (Department Head steps via the Requested For
 *   person's department; other roles via company approval role assignments).
 * - Approvers act through secure email tokens (Doc 00 §5) or the portal.
 * - Rejection ends only the affected item; corrections return only the
 *   affected item to the requester; other items continue unaffected.
 * - Executed instances are immutable history: state only moves forward.
 */

const MODULE = "workflow";

const DEPARTMENT_ROLE_KEYS = new Set(["DEPARTMENT_HEAD", "ASSISTANT_DEPARTMENT_HEAD"]);

export interface ResolvedApprover {
  person: Person;
  /** Set when this approver acts on behalf of another via delegation. */
  delegatedFrom?: Person;
}

/**
 * Resolve the approvers for a workflow step (Doc 13 Ch4, Doc 06 Ch7/11).
 */
export async function resolveApprovers(
  client: DbClient,
  params: {
    companyId: string;
    approvalRoleId: string;
    requestedForDepartmentId: string | null;
    allowDelegation: boolean;
  },
): Promise<ResolvedApprover[]> {
  const role = await client.approvalRole.findUnique({ where: { id: params.approvalRoleId } });
  if (!role) return [];

  let people: Person[] = [];
  if (DEPARTMENT_ROLE_KEYS.has(role.key)) {
    if (params.requestedForDepartmentId) {
      const heads = await client.departmentHead.findMany({
        where: {
          departmentId: params.requestedForDepartmentId,
          isActive: true,
          deletedAt: null,
          person: { isActive: true, deletedAt: null },
        },
        include: { person: true },
      });
      people = heads.map((head) => head.person);
    }
  } else {
    const assignments = await client.approvalRoleAssignment.findMany({
      where: {
        companyId: params.companyId,
        approvalRoleId: params.approvalRoleId,
        isActive: true,
        deletedAt: null,
        person: { isActive: true, deletedAt: null },
      },
      include: { person: true },
    });
    people = assignments.map((assignment) => assignment.person);
  }

  // Apply active delegations (Doc 13 Ch7).
  const resolved: ResolvedApprover[] = [];
  const now = new Date();
  for (const person of people) {
    if (params.allowDelegation) {
      const delegation = await client.delegation.findFirst({
        where: {
          fromPersonId: person.id,
          isActive: true,
          deletedAt: null,
          startDate: { lte: now },
          endDate: { gte: now },
          toPerson: { isActive: true, deletedAt: null },
        },
        include: { toPerson: true },
      });
      if (delegation) {
        resolved.push({ person: delegation.toPerson, delegatedFrom: person });
        continue;
      }
    }
    resolved.push({ person });
  }

  // De-duplicate by acting person.
  const seen = new Set<string>();
  return resolved.filter((entry) => {
    if (seen.has(entry.person.id)) return false;
    seen.add(entry.person.id);
    return true;
  });
}

/**
 * Start a workflow instance for a request item using the workflow's currently
 * active version. Returns the instance id. Must be called inside a transaction
 * that also created the request item; notification side effects run afterwards
 * via activateStep.
 */
export async function createInstanceForItem(
  tx: DbClient,
  requestItemId: string,
  workflowId: string,
): Promise<string> {
  const version = await tx.workflowVersion.findFirst({
    where: { workflowId, isActive: true },
    include: { steps: { orderBy: { stepOrder: "asc" } } },
  });
  if (!version || version.steps.length === 0) {
    throw new BusinessRuleError("The assigned workflow has no active version with steps.");
  }
  const instance = await tx.workflowInstance.create({
    data: {
      requestItemId,
      workflowVersionId: version.id,
      status: "IN_PROGRESS",
      currentStepOrder: null,
      stepInstances: {
        create: version.steps.map((step) => ({
          stepOrder: step.stepOrder,
          stepName: step.stepName,
          stepType: step.stepType,
          approvalRoleId: step.approvalRoleId,
          approvalRule: step.approvalRule,
          status: "PENDING",
        })),
      },
    },
  });
  return instance.id;
}

interface InstanceContext {
  instanceId: string;
  requestItem: {
    id: string;
    requestId: string;
    label: string;
    /** The access role asked for, when the target defines roles. */
    roleName: string | null;
    /** The item's own request-field answers, already label-resolved. */
    details: { label: string; value: string }[];
  };
  request: {
    id: string;
    requestNumber: string;
    companyId: string;
    requestedForName: string;
    requestedForEmail: string;
    requesterName: string;
    requesterEmail: string;
    requestedForDepartmentId: string | null;
  };
}

async function loadInstanceContext(client: DbClient, instanceId: string): Promise<InstanceContext> {
  const instance = await client.workflowInstance.findUnique({
    where: { id: instanceId },
    include: {
      requestItem: {
        include: {
          request: true,
          application: true,
          assetCategory: true,
          applicationRole: true,
        },
      },
    },
  });
  if (!instance) throw new NotFoundError("Workflow instance not found.");
  const item = instance.requestItem;
  const label =
    item.application?.name ??
    item.assetCategory?.name ??
    item.targetNameSnapshot ??
    item.description ??
    item.itemType;

  // The answers to the target's own request fields (which outlets, which cost
  // centre, and so on). Labels come from the snapshot taken at submission, so
  // an approver reads the same wording the requester saw even if the field has
  // since been renamed.
  const labels = (item.fieldLabelsSnapshot as Record<string, string> | null) ?? {};
  const answers = (item.itemData as Record<string, unknown> | null) ?? {};
  const details = Object.entries(answers)
    .filter(([, value]) => value !== null && value !== "" && !(Array.isArray(value) && value.length === 0))
    .map(([key, value]) => ({
      label: labels[key] ?? key.replace(/_/g, " "),
      value: Array.isArray(value) ? value.join(", ") : String(value),
    }));

  return {
    instanceId,
    requestItem: {
      id: item.id,
      requestId: item.requestId,
      label,
      roleName: item.applicationRole?.name ?? item.roleNameSnapshot ?? null,
      details,
    },
    request: {
      id: item.request.id,
      requestNumber: item.request.requestNumber,
      companyId: item.request.companyId,
      requestedForName: item.request.requestedForName,
      requestedForEmail: item.request.requestedForEmail,
      requesterName: item.request.requesterName,
      requesterEmail: item.request.requesterEmail,
      requestedForDepartmentId: item.request.requestedForDepartmentId,
    },
  };
}

/**
 * Activate a workflow step: resolve approvers, create assignments, issue
 * secure tokens and queue notification emails. For IT Implementation steps the
 * item moves to Implementation Pending and IT portal users are notified
 * instead (Doc 09 Ch7-8: implementation notifications only after final
 * approval; no approval email before it).
 */
export async function activateStep(
  context: AuditContext,
  instanceId: string,
  stepOrder: number,
): Promise<void> {
  const ic = await loadInstanceContext(db, instanceId);
  const stepInstance = await db.workflowStepInstance.findUnique({
    where: { workflowInstanceId_stepOrder: { workflowInstanceId: instanceId, stepOrder } },
  });
  if (!stepInstance) throw new NotFoundError("Workflow step not found.");
  if (stepInstance.status !== "PENDING" && stepInstance.status !== "CORRECTION_REQUESTED") {
    throw new BusinessRuleError("This workflow step cannot be activated.");
  }

  const step = await db.workflowStep.findFirst({
    where: {
      workflowVersion: { instances: { some: { id: instanceId } } },
      stepOrder,
    },
  });
  const allowDelegation = step?.allowDelegation ?? true;

  if (stepInstance.stepType === "IT_IMPLEMENTATION") {
    await db.$transaction(async (tx) => {
      await tx.workflowStepInstance.update({
        where: { id: stepInstance.id },
        data: { status: "ACTIVE", activatedAt: new Date() },
      });
      await tx.workflowInstance.update({
        where: { id: instanceId },
        data: { status: "APPROVED", currentStepOrder: stepOrder },
      });
      await tx.requestItem.update({
        where: { id: ic.requestItem.id },
        data: { status: "IMPLEMENTATION_PENDING" },
      });
      await recordAudit(
        { ...context, companyId: ic.request.companyId },
        {
          module: MODULE,
          eventType: "workflow.final_approval",
          action: `All approvals completed for "${ic.requestItem.label}" on ${ic.request.requestNumber}; implementation pending`,
          targetType: "workflow_instance",
          targetId: instanceId,
          targetLabel: ic.request.requestNumber,
        },
        tx,
      );
    });
    await rollupRequestStatus(context, ic.request.id);

    // Notify IT Implementation members (portal users) and mirror in-app.
    const approvers = await resolveApprovers(db, {
      companyId: ic.request.companyId,
      approvalRoleId: stepInstance.approvalRoleId,
      requestedForDepartmentId: ic.request.requestedForDepartmentId,
      allowDelegation,
    });
    await queueNotification({
      companyId: ic.request.companyId,
      eventType: "IMPLEMENTATION_REQUIRED",
      subject: `Implementation required: ${ic.requestItem.label} (${ic.request.requestNumber})`,
      body: `Request <strong>${ic.request.requestNumber}</strong> for <strong>${ic.request.requestedForName}</strong> has completed all approvals.<br/>The item "<strong>${ic.requestItem.label}</strong>" is ready for IT implementation. Sign in to the Axivo portal to complete it.`,
      recipients: approvers.map((approver) => ({
        email: approver.person.email,
        name: `${approver.person.firstName} ${approver.person.lastName}`,
        personId: approver.person.id,
      })),
      entityType: "request_item",
      entityId: ic.requestItem.id,
      dedupeKey: `implementation:${stepInstance.id}`,
    });
    for (const approver of approvers) {
      const portalUser = await db.systemUser.findFirst({
        where: { personId: approver.person.id, isEnabled: true, deletedAt: null },
      });
      if (portalUser) {
        await db.inAppNotification.create({
          data: {
            systemUserId: portalUser.id,
            title: `Implementation required: ${ic.requestItem.label}`,
            body: `Request ${ic.request.requestNumber} for ${ic.request.requestedForName}`,
            link: `/requests/${ic.request.id}`,
          },
        });
      }
    }
    return;
  }

  // Approval-type step.
  const approvers = await resolveApprovers(db, {
    companyId: ic.request.companyId,
    approvalRoleId: stepInstance.approvalRoleId,
    requestedForDepartmentId: ic.request.requestedForDepartmentId,
    allowDelegation,
  });

  await db.$transaction(async (tx) => {
    await tx.workflowStepInstance.update({
      where: { id: stepInstance.id },
      data: { status: "ACTIVE", activatedAt: new Date() },
    });
    await tx.workflowInstance.update({
      where: { id: instanceId },
      data: { status: "WAITING_APPROVAL", currentStepOrder: stepOrder },
    });
    for (const approver of approvers) {
      await tx.approvalAssignment.upsert({
        where: {
          workflowStepInstanceId_personId: {
            workflowStepInstanceId: stepInstance.id,
            personId: approver.person.id,
          },
        },
        create: {
          workflowStepInstanceId: stepInstance.id,
          personId: approver.person.id,
          delegatedFromPersonId: approver.delegatedFrom?.id ?? null,
        },
        update: {},
      });
    }
    await recordAudit(
      { ...context, companyId: ic.request.companyId },
      {
        module: MODULE,
        eventType: "workflow.step_assigned",
        action: `Step "${stepInstance.stepName}" activated for "${ic.requestItem.label}" on ${ic.request.requestNumber} (${approvers.length} approver(s))`,
        targetType: "workflow_step_instance",
        targetId: stepInstance.id,
        targetLabel: stepInstance.stepName,
      },
      tx,
    );
  });

  if (approvers.length === 0) {
    // No approvers resolvable - surface loudly to administrators (Doc 06 Ch7).
    await recordAudit(
      { ...context, companyId: ic.request.companyId },
      {
        module: MODULE,
        eventType: "workflow.no_approvers",
        action: `No approvers could be resolved for step "${stepInstance.stepName}" on ${ic.request.requestNumber}. Configure the approval role assignment and resend notifications.`,
        outcome: "FAILURE",
        targetType: "workflow_step_instance",
        targetId: stepInstance.id,
      },
    );
    return;
  }

  await sendApprovalEmails(context, stepInstance.id);
}

/**
 * Issue tokens and queue approval emails for every un-acted assignment of an
 * active step.
 *
 * The dedupe key deserves a note. It used to be `approval:<step>:<assignment>`,
 * which never changes for a given approver on a given step, and the dedupe
 * lookup matches notifications that were already delivered. That silently
 * swallowed two legitimate sends: resuming a step after a correction, and the
 * "resend approval email" button, both of which reuse the same step and
 * assignment. The key now includes the activation instant, so each fresh
 * activation is its own business event, and an explicit resend bypasses dedupe
 * entirely - the operator pressing the button is the intent.
 */
export async function sendApprovalEmails(
  context: AuditContext,
  stepInstanceId: string,
  options: { force?: boolean } = {},
): Promise<void> {
  const stepInstance = await db.workflowStepInstance.findUnique({
    where: { id: stepInstanceId },
    include: { assignments: { include: { person: true } } },
  });
  if (!stepInstance || stepInstance.status !== "ACTIVE") return;
  const ic = await loadInstanceContext(db, stepInstance.workflowInstanceId);
  const round = stepInstance.activatedAt?.getTime() ?? 0;

  for (const assignment of stepInstance.assignments) {
    if (assignment.actedAt) continue;
    const { token } = await issueToken({
      purpose: "APPROVAL_ACTION",
      email: assignment.person.email,
      personId: assignment.person.id,
      targetType: "workflow_step_instance",
      targetId: stepInstanceId,
      metadata: { approvalAssignmentId: assignment.id },
    });
    const url = await tokenActionUrl("/action/approval", token);
    await queueNotification({
      companyId: ic.request.companyId,
      eventType: "APPROVAL_REQUIRED",
      subject: `Approval required: ${ic.requestItem.label} for ${ic.request.requestedForName} (${ic.request.requestNumber})`,
      body: [
        `Dear ${assignment.person.firstName},`,
        ``,
        `Your approval is required for request <strong>${ic.request.requestNumber}</strong>.`,
        `Item: <strong>${ic.requestItem.label}</strong>`,
        ...(ic.requestItem.roleName ? [`Access role: <strong>${ic.requestItem.roleName}</strong>`] : []),
        // What was actually asked for. An approver deciding on "Micros Simphony"
        // needs to see which outlets, not just the application name.
        ...(ic.requestItem.details.length > 0
          ? [``, `<strong>Details requested</strong>`,
             ...ic.requestItem.details.map((detail) => `${detail.label}: ${detail.value}`)]
          : []),
        ``,
        `Requested for: <strong>${ic.request.requestedForName}</strong> (${ic.request.requestedForEmail})`,
        `Requested by: ${ic.request.requesterName} (${ic.request.requesterEmail})`,
        ``,
        `<a href="${url}">Review and act on this request</a>`,
        ``,
        `This secure link is personal to you and expires automatically.`,
      ].join("<br/>"),
      recipients: [
        {
          email: assignment.person.email,
          name: `${assignment.person.firstName} ${assignment.person.lastName}`,
          personId: assignment.person.id,
        },
      ],
      entityType: "workflow_step_instance",
      entityId: stepInstanceId,
      dedupeKey: options.force ? undefined : `approval:${stepInstanceId}:${assignment.id}:${round}`,
    });
  }
}

export interface ApplyActionParams {
  stepInstanceId: string;
  actingPersonId: string;
  action: ApprovalActionType;
  comments?: string;
  viaSecureToken: boolean;
}

/**
 * Apply an approver's action to an active step (Doc 13 Ch6).
 */
export async function applyApprovalAction(
  context: AuditContext,
  params: ApplyActionParams,
): Promise<{ requestId: string; requestNumber: string; result: ApprovalActionType }> {
  const stepInstance = await db.workflowStepInstance.findUnique({
    where: { id: params.stepInstanceId },
    include: {
      assignments: true,
      workflowInstance: true,
    },
  });
  if (!stepInstance) throw new NotFoundError("Workflow step not found.");
  if (stepInstance.status !== "ACTIVE") {
    throw new BusinessRuleError("This approval step has already been completed.");
  }
  if (stepInstance.stepType === "IT_IMPLEMENTATION") {
    throw new BusinessRuleError("Implementation steps are completed through the IT portal.");
  }
  let assignment = stepInstance.assignments.find((a) => a.personId === params.actingPersonId);
  if (!assignment) {
    // Approvers are resolved live rather than only from the list frozen at
    // activation, so someone added to the approval role after the step went
    // active can still act (Doc 13 Ch6). Materialise their assignment now so
    // the ANY/ALL rule and acted-at bookkeeping keep working.
    const ic = await loadInstanceContext(db, stepInstance.workflowInstanceId);
    const step = await db.workflowStep.findFirst({
      where: {
        workflowVersion: { instances: { some: { id: stepInstance.workflowInstanceId } } },
        stepOrder: stepInstance.stepOrder,
      },
    });
    const currentApprovers = await resolveApprovers(db, {
      companyId: ic.request.companyId,
      approvalRoleId: stepInstance.approvalRoleId,
      requestedForDepartmentId: ic.request.requestedForDepartmentId,
      allowDelegation: step?.allowDelegation ?? true,
    });
    const resolved = currentApprovers.find((approver) => approver.person.id === params.actingPersonId);
    if (!resolved) {
      throw new AuthorizationError("You are not an assigned approver for this step.");
    }
    assignment = await db.approvalAssignment.create({
      data: {
        workflowStepInstanceId: stepInstance.id,
        personId: resolved.person.id,
        delegatedFromPersonId: resolved.delegatedFrom?.id ?? null,
      },
    });
    stepInstance.assignments.push(assignment);
  }
  if (assignment.actedAt) {
    throw new BusinessRuleError("You have already acted on this step.");
  }
  if ((params.action === "REJECTED" || params.action === "CORRECTION_REQUESTED") && !params.comments) {
    throw new BusinessRuleError("Comments are required when rejecting or requesting a correction.");
  }

  const ic = await loadInstanceContext(db, stepInstance.workflowInstanceId);
  const now = new Date();
  let stepCompleted = false;

  await db.$transaction(async (tx) => {
    await tx.approvalAction.create({
      data: {
        workflowStepInstanceId: params.stepInstanceId,
        personId: params.actingPersonId,
        onBehalfOfPersonId: assignment.delegatedFromPersonId,
        action: params.action,
        comments: params.comments ?? null,
        viaSecureToken: params.viaSecureToken,
      },
    });
    await tx.approvalAssignment.update({
      where: { id: assignment.id },
      data: { actedAt: now },
    });

    if (params.action === "APPROVED") {
      const remaining = stepInstance.assignments.filter(
        (a) => a.id !== assignment.id && !a.actedAt,
      ).length;
      stepCompleted = stepInstance.approvalRule === "ANY" || remaining === 0;
      if (stepCompleted) {
        await tx.workflowStepInstance.update({
          where: { id: params.stepInstanceId },
          data: { status: "APPROVED", completedAt: now },
        });
        await revokeTokensForTarget("workflow_step_instance", params.stepInstanceId, tx);
      }
    } else if (params.action === "REJECTED") {
      await tx.workflowStepInstance.update({
        where: { id: params.stepInstanceId },
        data: { status: "REJECTED", completedAt: now },
      });
      // A rejection ends the item, so nothing downstream will ever run. Mark
      // the remaining steps (including IT implementation) as cancelled rather
      // than leaving them "pending", which reads as still-awaiting-action.
      await tx.workflowStepInstance.updateMany({
        where: {
          workflowInstanceId: stepInstance.workflowInstanceId,
          status: { in: ["PENDING", "ACTIVE"] },
        },
        data: { status: "CANCELLED", completedAt: now },
      });
      await tx.workflowInstance.update({
        where: { id: stepInstance.workflowInstanceId },
        data: { status: "REJECTED", completedAt: now },
      });
      await tx.requestItem.update({
        where: { id: ic.requestItem.id },
        data: { status: "REJECTED" },
      });
      await revokeTokensForTarget("workflow_step_instance", params.stepInstanceId, tx);
    } else {
      // CORRECTION_REQUESTED
      await tx.workflowStepInstance.update({
        where: { id: params.stepInstanceId },
        data: { status: "CORRECTION_REQUESTED" },
      });
      await tx.workflowInstance.update({
        where: { id: stepInstance.workflowInstanceId },
        data: { status: "CORRECTION_REQUESTED" },
      });
      const item = await tx.requestItem.findUnique({ where: { id: ic.requestItem.id } });
      await tx.requestItem.update({
        where: { id: ic.requestItem.id },
        data: { status: "CORRECTION_REQUESTED" },
      });
      await tx.requestCorrection.create({
        data: {
          requestId: ic.request.id,
          requestItemId: ic.requestItem.id,
          requestedById: params.actingPersonId,
          requestComments: params.comments ?? "",
          previousData: item?.itemData ?? undefined,
        },
      });
      await revokeTokensForTarget("workflow_step_instance", params.stepInstanceId, tx);
    }

    await recordAudit(
      { ...context, companyId: ic.request.companyId },
      {
        module: MODULE,
        eventType: `workflow.${params.action.toLowerCase()}`,
        action: `${params.action === "APPROVED" ? "Approved" : params.action === "REJECTED" ? "Rejected" : "Requested correction for"} "${ic.requestItem.label}" on ${ic.request.requestNumber} (step "${stepInstance.stepName}")`,
        targetType: "workflow_step_instance",
        targetId: params.stepInstanceId,
        targetLabel: stepInstance.stepName,
        details: params.comments ? { comments: params.comments } : undefined,
      },
      tx,
    );
  });

  // Post-transaction side effects.
  if (params.action === "APPROVED" && stepCompleted) {
    const next = await db.workflowStepInstance.findFirst({
      where: { workflowInstanceId: stepInstance.workflowInstanceId, stepOrder: { gt: stepInstance.stepOrder }, status: "PENDING" },
      orderBy: { stepOrder: "asc" },
    });
    if (next) {
      await activateStep(context, stepInstance.workflowInstanceId, next.stepOrder);
    } else {
      // No further steps (defensive: workflows normally end with implementation).
      await db.$transaction(async (tx) => {
        await tx.workflowInstance.update({
          where: { id: stepInstance.workflowInstanceId },
          data: { status: "COMPLETED", completedAt: new Date() },
        });
        await tx.requestItem.update({
          where: { id: ic.requestItem.id },
          data: { status: "COMPLETED" },
        });
      });
    }
  } else if (params.action === "REJECTED") {
    await notifyRequesterOfRejection(ic, params.comments ?? "");
  } else if (params.action === "CORRECTION_REQUESTED") {
    await sendCorrectionEmail(ic, params.comments ?? "");
  }
  await rollupRequestStatus(context, ic.request.id);
  return { requestId: ic.request.id, requestNumber: ic.request.requestNumber, result: params.action };
}

async function notifyRequesterOfRejection(ic: InstanceContext, comments: string): Promise<void> {
  const { getSetting, SETTING_KEYS } = await import("@/shared/settings/settings");
  const enabled = await getSetting<boolean>(SETTING_KEYS.NOTIFY_REQUESTER_ON_REJECTION, ic.request.companyId);
  if (!enabled) return;
  await queueNotification({
    companyId: ic.request.companyId,
    eventType: "REQUEST_REJECTED",
    subject: `Request ${ic.request.requestNumber}: "${ic.requestItem.label}" was rejected`,
    body: [
      `Dear ${ic.request.requesterName},`,
      ``,
      `The item "<strong>${ic.requestItem.label}</strong>" on request <strong>${ic.request.requestNumber}</strong> was rejected.`,
      `Reason: ${comments}`,
      ``,
      `Other items on the same request continue independently.`,
    ].join("<br/>"),
    recipients: [{ email: ic.request.requesterEmail, name: ic.request.requesterName }],
    entityType: "request_item",
    entityId: ic.requestItem.id,
  });
}

async function sendCorrectionEmail(ic: InstanceContext, comments: string): Promise<void> {
  const { token } = await issueToken({
    purpose: "CORRECTION_EDIT",
    email: ic.request.requesterEmail,
    targetType: "request_item",
    targetId: ic.requestItem.id,
  });
  const url = await tokenActionUrl("/action/correction", token);
  await queueNotification({
    companyId: ic.request.companyId,
    eventType: "CORRECTION_REQUESTED",
    subject: `Correction requested: ${ic.requestItem.label} (${ic.request.requestNumber})`,
    body: [
      `Dear ${ic.request.requesterName},`,
      ``,
      `An approver has requested a correction for the item "<strong>${ic.requestItem.label}</strong>" on request <strong>${ic.request.requestNumber}</strong>.`,
      `Comments: ${comments}`,
      ``,
      `<a href="${url}">Review and correct this item</a>`,
      ``,
      `Only this item requires correction; other items continue unaffected.`,
    ].join("<br/>"),
    recipients: [{ email: ic.request.requesterEmail, name: ic.request.requesterName }],
    entityType: "request_item",
    entityId: ic.requestItem.id,
  });
}

/**
 * Resume an item's workflow after the requester submits a correction
 * (Doc 09 Ch4/6): the step that requested the correction re-activates and the
 * original timeline is preserved.
 */
export async function resumeAfterCorrection(context: AuditContext, requestItemId: string): Promise<void> {
  const instance = await db.workflowInstance.findFirst({
    where: { requestItemId, status: "CORRECTION_REQUESTED" },
    orderBy: { startedAt: "desc" },
    include: { stepInstances: { orderBy: { stepOrder: "asc" } } },
  });
  if (!instance) throw new BusinessRuleError("No workflow is awaiting correction for this item.");
  const step = instance.stepInstances.find((s) => s.status === "CORRECTION_REQUESTED");
  if (!step) throw new BusinessRuleError("No step is awaiting correction.");

  await db.$transaction(async (tx) => {
    // Clear acted flags so the step's approvers act again on the corrected data.
    await tx.approvalAssignment.updateMany({
      where: { workflowStepInstanceId: step.id },
      data: { actedAt: null },
    });
    await tx.workflowStepInstance.update({
      where: { id: step.id },
      data: { status: "PENDING", activatedAt: null, completedAt: null },
    });
    await tx.workflowInstance.update({
      where: { id: instance.id },
      data: { status: "IN_PROGRESS" },
    });
    await tx.requestItem.update({
      where: { id: requestItemId },
      data: { status: "PENDING_APPROVAL" },
    });
  });
  await activateStep(context, instance.id, step.stepOrder);
}

/**
 * Complete the IT Implementation step for an item (called by the Requests
 * module once IT records credentials/assets). Ends the workflow instance.
 */
export async function completeImplementationStep(
  context: AuditContext,
  tx: DbClient,
  requestItemId: string,
): Promise<void> {
  const instance = await tx.workflowInstance.findFirst({
    where: { requestItemId, status: "APPROVED" },
    orderBy: { startedAt: "desc" },
    include: { stepInstances: true },
  });
  if (!instance) throw new BusinessRuleError("This item is not awaiting implementation.");
  const step = instance.stepInstances.find(
    (s) => s.stepType === "IT_IMPLEMENTATION" && s.status === "ACTIVE",
  );
  if (!step) throw new BusinessRuleError("No active implementation step found.");
  const now = new Date();
  await tx.workflowStepInstance.update({
    where: { id: step.id },
    data: { status: "APPROVED", completedAt: now },
  });
  await tx.workflowInstance.update({
    where: { id: instance.id },
    data: { status: "COMPLETED", completedAt: now },
  });
}

/** Cancel an item's running workflow (admin action; history retained). */
export async function cancelItemWorkflow(
  context: AuditContext,
  tx: DbClient,
  requestItemId: string,
): Promise<void> {
  const instance = await tx.workflowInstance.findFirst({
    where: {
      requestItemId,
      status: { in: ["PENDING", "IN_PROGRESS", "WAITING_APPROVAL", "CORRECTION_REQUESTED", "APPROVED"] },
    },
    orderBy: { startedAt: "desc" },
    include: { stepInstances: true },
  });
  if (!instance) return;
  const now = new Date();
  for (const step of instance.stepInstances) {
    if (step.status === "ACTIVE" || step.status === "PENDING" || step.status === "CORRECTION_REQUESTED") {
      await tx.workflowStepInstance.update({
        where: { id: step.id },
        data: { status: "CANCELLED", completedAt: now },
      });
      await revokeTokensForTarget("workflow_step_instance", step.id, tx);
    }
  }
  await tx.workflowInstance.update({
    where: { id: instance.id },
    data: { status: "CANCELLED", cancelledAt: now, cancelledById: context.actorUserId ?? null },
  });
}

/**
 * Recompute the parent request status from its items (Doc 09 Ch4): the request
 * remains open until every item reaches a final state.
 */
export async function rollupRequestStatus(context: AuditContext, requestId: string): Promise<void> {
  const request = await db.request.findUnique({
    where: { id: requestId },
    include: {
      // Names are included so the completion email can say what was granted
      // rather than only quoting the request number.
      items: {
        include: {
          application: { select: { name: true } },
          applicationRole: { select: { name: true } },
          assetCategory: { select: { name: true } },
        },
      },
    },
  });
  if (!request) return;
  const statuses = new Set<RequestItemStatus>(request.items.map((item) => item.status));

  let next: RequestStatus;
  const terminal: RequestItemStatus[] = ["COMPLETED", "REJECTED", "CANCELLED"];
  const allTerminal = request.items.every((item) => terminal.includes(item.status));
  if (allTerminal) {
    next = statuses.has("COMPLETED")
      ? "COMPLETED"
      : statuses.has("REJECTED")
        ? "REJECTED"
        : "CANCELLED";
  } else if (statuses.has("CORRECTION_REQUESTED")) {
    next = "CORRECTION_REQUESTED";
  } else if (statuses.has("PENDING_APPROVAL")) {
    next = "PENDING_APPROVAL";
  } else if (statuses.has("IMPLEMENTATION_PENDING") || statuses.has("APPROVED")) {
    next = "IMPLEMENTATION_PENDING";
  } else if (statuses.has("IMPLEMENTED")) {
    // IT has done the work; the only thing left is the employee acknowledging
    // their credentials or asset handover, so do not keep telling IT that an
    // implementation is outstanding.
    next = "PENDING_ACKNOWLEDGEMENT";
  } else {
    next = request.status;
  }

  // Anything hanging off a request item's outcome is settled here, so it is
  // reached by every path that changes an item: approval, rejection,
  // cancellation and correction alike.
  try {
    const { syncCheckoutsForRequest } = await import("@/modules/assets/checkouts");
    await syncCheckoutsForRequest(context, requestId);
  } catch (error) {
    console.error("[axivo] Failed to sync asset checkouts for request:", error);
  }

  if (next !== request.status) {
    await db.request.update({
      where: { id: requestId },
      data: {
        status: next,
        completedAt: allTerminal && !request.completedAt ? new Date() : request.completedAt,
      },
    });
    if (next === "COMPLETED") {
      const { getSetting, SETTING_KEYS } = await import("@/shared/settings/settings");
      const notify = await getSetting<boolean>(
        SETTING_KEYS.NOTIFY_REQUESTER_ON_FINAL_APPROVAL,
        request.companyId,
      );
      if (notify) {
        await queueNotification({
          companyId: request.companyId,
          eventType: "REQUEST_COMPLETED",
          subject: `Request ${request.requestNumber} completed`,
          body: [
            `Dear ${request.requesterName},`,
            "",
            `Your request <strong>${request.requestNumber}</strong> has been completed.`,
            "",
            `<strong>Granted for ${request.requestedForName}:</strong>`,
            "<ul>",
            ...request.items
              .filter((item) => item.status === "COMPLETED")
              .map((item) => {
                const target =
                  item.application?.name ?? item.assetCategory?.name ?? item.description ?? "Item";
                const role = item.applicationRole?.name ? ` (${item.applicationRole.name})` : "";
                return `<li>${target}${role}</li>`;
              }),
            "</ul>",
          ].join("<br/>"),
          recipients: [{ email: request.requesterEmail, name: request.requesterName }],
          entityType: "request",
          entityId: request.id,
          dedupeKey: `request-completed:${request.id}`,
        });
      }
    }
  }
}
