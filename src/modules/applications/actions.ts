"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/shared/auth/guard";
import { ok, toActionError, type ActionResult } from "@/shared/errors";
import { parseInput as parse } from "@/shared/validation/common";
import * as service from "./service";
import {
  applicationSchema,
  applicationRoleSchema,
  credentialFieldSchema,
  assignmentSchema,
  updateAssignmentSchema,
  removeAssignmentSchema,
} from "./validators";

/** Applications server actions (SDS Doc 08). */

export async function createApplicationAction(raw: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const { audit } = await requirePermission("applications.manage");
    const application = await service.createApplication(audit, parse(applicationSchema, raw));
    revalidatePath("/applications");
    return ok({ id: application.id });
  } catch (error) {
    return toActionError(error);
  }
}

export async function updateApplicationAction(id: string, raw: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const { audit } = await requirePermission("applications.manage");
    const application = await service.updateApplication(audit, id, parse(applicationSchema, raw));
    revalidatePath("/applications");
    return ok({ id: application.id });
  } catch (error) {
    return toActionError(error);
  }
}

export async function setApplicationActiveAction(id: string, isActive: boolean): Promise<ActionResult<undefined>> {
  try {
    const { audit } = await requirePermission("applications.manage");
    await service.setApplicationActive(audit, id, isActive);
    revalidatePath("/applications");
    return ok(undefined);
  } catch (error) {
    return toActionError(error);
  }
}

export async function createApplicationRoleAction(raw: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const { audit } = await requirePermission("applications.manage");
    const role = await service.createApplicationRole(audit, parse(applicationRoleSchema, raw));
    revalidatePath("/applications");
    return ok({ id: role.id });
  } catch (error) {
    return toActionError(error);
  }
}

export async function updateApplicationRoleAction(id: string, raw: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const { audit } = await requirePermission("applications.manage");
    const role = await service.updateApplicationRole(audit, id, parse(applicationRoleSchema, raw));
    revalidatePath("/applications");
    return ok({ id: role.id });
  } catch (error) {
    return toActionError(error);
  }
}

export async function setApplicationRoleActiveAction(id: string, isActive: boolean): Promise<ActionResult<undefined>> {
  try {
    const { audit } = await requirePermission("applications.manage");
    await service.setApplicationRoleActive(audit, id, isActive);
    revalidatePath("/applications");
    return ok(undefined);
  } catch (error) {
    return toActionError(error);
  }
}

export async function saveCredentialFieldAction(raw: unknown, fieldId?: string): Promise<ActionResult<{ id: string }>> {
  try {
    const { audit } = await requirePermission("applications.manage");
    const field = await service.saveCredentialField(audit, parse(credentialFieldSchema, raw), fieldId);
    revalidatePath("/applications");
    return ok({ id: field.id });
  } catch (error) {
    return toActionError(error);
  }
}

export async function setCredentialFieldActiveAction(id: string, isActive: boolean): Promise<ActionResult<undefined>> {
  try {
    const { audit } = await requirePermission("applications.manage");
    await service.setCredentialFieldActive(audit, id, isActive);
    revalidatePath("/applications");
    return ok(undefined);
  } catch (error) {
    return toActionError(error);
  }
}

export async function deleteApplicationAction(id: string): Promise<ActionResult<{ id: string }>> {
  try {
    const { audit } = await requirePermission("applications.manage");
    const result = await service.deleteApplication(audit, id);
    revalidatePath("/applications");
    return ok(result);
  } catch (error) {
    return toActionError(error);
  }
}

export async function createAssignmentAction(raw: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const { audit } = await requirePermission("applications.assignments.manage");
    const assignment = await service.createAssignment(audit, parse(assignmentSchema, raw));
    revalidatePath("/applications");
    return ok({ id: assignment.id });
  } catch (error) {
    return toActionError(error);
  }
}

export async function updateAssignmentAction(id: string, raw: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const { audit } = await requirePermission("applications.assignments.manage");
    const assignment = await service.updateAssignment(audit, id, parse(updateAssignmentSchema, raw));
    revalidatePath("/applications");
    return ok({ id: assignment.id });
  } catch (error) {
    return toActionError(error);
  }
}

export async function setAssignmentStatusAction(
  id: string,
  status: "ACTIVE" | "SUSPENDED",
): Promise<ActionResult<undefined>> {
  try {
    const { audit } = await requirePermission("applications.assignments.manage");
    await service.setAssignmentStatus(audit, id, status);
    revalidatePath("/applications");
    return ok(undefined);
  } catch (error) {
    return toActionError(error);
  }
}

export async function removeAssignmentAction(raw: unknown): Promise<ActionResult<undefined>> {
  try {
    const { audit } = await requirePermission("applications.assignments.manage");
    const input = parse(removeAssignmentSchema, raw);
    await service.removeAssignment(audit, input.assignmentId, input.reason);
    revalidatePath("/applications");
    return ok(undefined);
  } catch (error) {
    return toActionError(error);
  }
}
