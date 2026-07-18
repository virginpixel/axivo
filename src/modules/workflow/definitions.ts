import { db } from "@/shared/db";
import { recordAudit, type AuditContext } from "@/shared/audit/audit";
import { BusinessRuleError, NotFoundError, ValidationError } from "@/shared/errors";
import type { WorkflowInput, DelegationInput } from "./validators";

/**
 * Workflow definition management (SDS Doc 13 Ch2-3).
 * Editing an active workflow creates a new version; running instances continue
 * on the version they started with. Only one version is active at a time.
 */

const MODULE = "workflow";

async function validateStepRoles(input: WorkflowInput): Promise<void> {
  const roleIds = Array.from(new Set(input.steps.map((step) => step.approvalRoleId)));
  const roles = await db.approvalRole.findMany({
    where: { id: { in: roleIds }, deletedAt: null, isActive: true },
  });
  if (roles.length !== roleIds.length) {
    throw new BusinessRuleError("Every workflow step must reference an active approval role.");
  }
}

export async function createWorkflow(context: AuditContext, input: WorkflowInput) {
  const company = await db.company.findFirst({
    where: { id: input.companyId, deletedAt: null, isActive: true },
  });
  if (!company) throw new BusinessRuleError("Company not found or disabled.");
  const duplicate = await db.workflow.findFirst({
    where: {
      companyId: input.companyId,
      name: { equals: input.name, mode: "insensitive" },
      deletedAt: null,
    },
  });
  if (duplicate) {
    throw new ValidationError(undefined, { name: "A workflow with this name already exists in this company." });
  }
  await validateStepRoles(input);

  return db.$transaction(async (tx) => {
    const workflow = await tx.workflow.create({
      data: {
        companyId: input.companyId,
        name: input.name,
        description: input.description,
        isDefault: input.isDefault,
        createdById: context.actorUserId ?? null,
        versions: {
          create: {
            versionNumber: 1,
            isActive: true,
            createdById: context.actorUserId ?? null,
            steps: {
              create: input.steps.map((step, index) => ({
                stepOrder: index + 1,
                stepName: step.stepName,
                stepType: step.stepType,
                approvalRoleId: step.approvalRoleId,
                approvalRule: step.approvalRule,
                allowDelegation: step.allowDelegation,
                commentsRequired: step.commentsRequired,
              })),
            },
          },
        },
      },
    });
    await recordAudit(
      { ...context, companyId: input.companyId },
      {
        module: MODULE,
        eventType: "workflow.created",
        action: `Created workflow "${workflow.name}" (v1, ${input.steps.length} steps)`,
        targetType: "workflow",
        targetId: workflow.id,
        targetLabel: workflow.name,
      },
      tx,
    );
    return workflow;
  });
}

/** Editing steps of an active workflow creates a new version (Doc 13 Ch2). */
export async function updateWorkflow(context: AuditContext, id: string, input: WorkflowInput) {
  const existing = await db.workflow.findFirst({
    where: { id, deletedAt: null },
    include: { versions: { where: { isActive: true } } },
  });
  if (!existing) throw new NotFoundError("Workflow not found.");
  if (existing.companyId !== input.companyId) {
    throw new BusinessRuleError("Workflows cannot be moved between companies.");
  }
  const duplicate = await db.workflow.findFirst({
    where: {
      companyId: input.companyId,
      name: { equals: input.name, mode: "insensitive" },
      deletedAt: null,
      id: { not: id },
    },
  });
  if (duplicate) {
    throw new ValidationError(undefined, { name: "A workflow with this name already exists in this company." });
  }
  await validateStepRoles(input);

  const latest = await db.workflowVersion.findFirst({
    where: { workflowId: id },
    orderBy: { versionNumber: "desc" },
  });
  const nextVersion = (latest?.versionNumber ?? 0) + 1;

  return db.$transaction(async (tx) => {
    await tx.workflow.update({
      where: { id },
      data: {
        name: input.name,
        description: input.description,
        isDefault: input.isDefault,
        updatedById: context.actorUserId ?? null,
      },
    });
    // Deactivate previous versions; running instances keep referencing them.
    await tx.workflowVersion.updateMany({ where: { workflowId: id }, data: { isActive: false } });
    const version = await tx.workflowVersion.create({
      data: {
        workflowId: id,
        versionNumber: nextVersion,
        isActive: true,
        createdById: context.actorUserId ?? null,
        steps: {
          create: input.steps.map((step, index) => ({
            stepOrder: index + 1,
            stepName: step.stepName,
            stepType: step.stepType,
            approvalRoleId: step.approvalRoleId,
            approvalRule: step.approvalRule,
            allowDelegation: step.allowDelegation,
            commentsRequired: step.commentsRequired,
          })),
        },
      },
    });
    await recordAudit(
      { ...context, companyId: input.companyId },
      {
        module: MODULE,
        eventType: "workflow.version_created",
        action: `Updated workflow "${input.name}" creating version ${nextVersion}`,
        targetType: "workflow",
        targetId: id,
        targetLabel: input.name,
      },
      tx,
    );
    return version;
  });
}

export async function setWorkflowActive(context: AuditContext, id: string, isActive: boolean) {
  const existing = await db.workflow.findFirst({ where: { id, deletedAt: null } });
  if (!existing) throw new NotFoundError("Workflow not found.");
  if (!isActive) {
    // Prevent disabling a workflow still assigned to a published form.
    const usedByForm = await db.form.findFirst({
      where: { workflowId: id, status: "PUBLISHED", deletedAt: null },
    });
    if (usedByForm) {
      throw new BusinessRuleError(
        `This workflow is assigned to the published form "${usedByForm.name}". Unpublish or reassign the form first.`,
      );
    }
  }
  return db.$transaction(async (tx) => {
    const workflow = await tx.workflow.update({ where: { id }, data: { isActive } });
    await recordAudit(
      { ...context, companyId: workflow.companyId },
      {
        module: MODULE,
        eventType: isActive ? "workflow.enabled" : "workflow.disabled",
        action: `${isActive ? "Enabled" : "Disabled"} workflow "${workflow.name}"`,
        targetType: "workflow",
        targetId: id,
        targetLabel: workflow.name,
      },
      tx,
    );
    return workflow;
  });
}

// ---------------------------------------------------------------------------
// Delegations (Doc 13 Ch7)
// ---------------------------------------------------------------------------

export async function createDelegation(context: AuditContext, input: DelegationInput) {
  const [fromPerson, toPerson] = await Promise.all([
    db.person.findFirst({ where: { id: input.fromPersonId, companyId: input.companyId, deletedAt: null, isActive: true } }),
    db.person.findFirst({ where: { id: input.toPersonId, companyId: input.companyId, deletedAt: null, isActive: true } }),
  ]);
  if (!fromPerson || !toPerson) {
    throw new BusinessRuleError("Both people must be active members of the selected company.");
  }
  return db.$transaction(async (tx) => {
    const delegation = await tx.delegation.create({
      data: { ...input, createdById: context.actorUserId ?? null },
    });
    await recordAudit(
      { ...context, companyId: input.companyId },
      {
        module: MODULE,
        eventType: "delegation.created",
        action: `Created delegation from ${fromPerson.firstName} ${fromPerson.lastName} to ${toPerson.firstName} ${toPerson.lastName}`,
        targetType: "delegation",
        targetId: delegation.id,
      },
      tx,
    );
    return delegation;
  });
}

export async function setDelegationActive(context: AuditContext, id: string, isActive: boolean) {
  const existing = await db.delegation.findFirst({ where: { id, deletedAt: null } });
  if (!existing) throw new NotFoundError("Delegation not found.");
  return db.$transaction(async (tx) => {
    const delegation = await tx.delegation.update({ where: { id }, data: { isActive } });
    await recordAudit(
      { ...context, companyId: delegation.companyId },
      {
        module: MODULE,
        eventType: isActive ? "delegation.activated" : "delegation.deactivated",
        action: `${isActive ? "Activated" : "Deactivated"} delegation`,
        targetType: "delegation",
        targetId: id,
      },
      tx,
    );
    return delegation;
  });
}
