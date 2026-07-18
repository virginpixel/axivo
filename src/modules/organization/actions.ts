"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/shared/auth/guard";
import { ok, toActionError, type ActionResult } from "@/shared/errors";
import { parseInput as parse } from "@/shared/validation/common";
import * as service from "./service";
import {
  companySchema,
  departmentSchema,
  locationSchema,
  positionSchema,
  approvalRoleSchema,
  approvalRoleAssignmentSchema,
  departmentHeadSchema,
} from "./validators";

/**
 * Organization server actions (SDS Doc 06 Ch8/12).
 * Every action: authenticate → authorize → validate → execute → audit.
 * Company management requires System Administrator; other entities require
 * organization.manage.
 */

// --- Companies ---

export async function createCompanyAction(raw: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const { audit } = await requirePermission("organization.company.manage");
    const company = await service.createCompany(audit, parse(companySchema, raw));
    revalidatePath("/organization");
    return ok({ id: company.id });
  } catch (error) {
    return toActionError(error);
  }
}

export async function updateCompanyAction(id: string, raw: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const { audit } = await requirePermission("organization.company.manage");
    const company = await service.updateCompany(audit, id, parse(companySchema, raw));
    revalidatePath("/organization");
    return ok({ id: company.id });
  } catch (error) {
    return toActionError(error);
  }
}

export async function setCompanyActiveAction(id: string, isActive: boolean): Promise<ActionResult<undefined>> {
  try {
    const { audit } = await requirePermission("organization.company.manage");
    await service.setCompanyActive(audit, id, isActive);
    revalidatePath("/organization");
    return ok(undefined);
  } catch (error) {
    return toActionError(error);
  }
}

// --- Departments ---

export async function createDepartmentAction(raw: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const { audit } = await requirePermission("organization.manage");
    const department = await service.createDepartment(audit, parse(departmentSchema, raw));
    revalidatePath("/organization");
    return ok({ id: department.id });
  } catch (error) {
    return toActionError(error);
  }
}

export async function updateDepartmentAction(id: string, raw: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const { audit } = await requirePermission("organization.manage");
    const department = await service.updateDepartment(audit, id, parse(departmentSchema, raw));
    revalidatePath("/organization");
    return ok({ id: department.id });
  } catch (error) {
    return toActionError(error);
  }
}

export async function setDepartmentActiveAction(id: string, isActive: boolean): Promise<ActionResult<undefined>> {
  try {
    const { audit } = await requirePermission("organization.manage");
    await service.setDepartmentActive(audit, id, isActive);
    revalidatePath("/organization");
    return ok(undefined);
  } catch (error) {
    return toActionError(error);
  }
}

// --- Locations ---

export async function createLocationAction(raw: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const { audit } = await requirePermission("organization.manage");
    const location = await service.createLocation(audit, parse(locationSchema, raw));
    revalidatePath("/organization");
    return ok({ id: location.id });
  } catch (error) {
    return toActionError(error);
  }
}

export async function updateLocationAction(id: string, raw: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const { audit } = await requirePermission("organization.manage");
    const location = await service.updateLocation(audit, id, parse(locationSchema, raw));
    revalidatePath("/organization");
    return ok({ id: location.id });
  } catch (error) {
    return toActionError(error);
  }
}

export async function setLocationActiveAction(id: string, isActive: boolean): Promise<ActionResult<undefined>> {
  try {
    const { audit } = await requirePermission("organization.manage");
    await service.setLocationActive(audit, id, isActive);
    revalidatePath("/organization");
    return ok(undefined);
  } catch (error) {
    return toActionError(error);
  }
}

// --- Positions ---

export async function createPositionAction(raw: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const { audit } = await requirePermission("organization.manage");
    const position = await service.createPosition(audit, parse(positionSchema, raw));
    revalidatePath("/organization");
    return ok({ id: position.id });
  } catch (error) {
    return toActionError(error);
  }
}

export async function updatePositionAction(id: string, raw: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const { audit } = await requirePermission("organization.manage");
    const position = await service.updatePosition(audit, id, parse(positionSchema, raw));
    revalidatePath("/organization");
    return ok({ id: position.id });
  } catch (error) {
    return toActionError(error);
  }
}

export async function setPositionActiveAction(id: string, isActive: boolean): Promise<ActionResult<undefined>> {
  try {
    const { audit } = await requirePermission("organization.manage");
    await service.setPositionActive(audit, id, isActive);
    revalidatePath("/organization");
    return ok(undefined);
  } catch (error) {
    return toActionError(error);
  }
}

// --- Approval Roles (System Administrator only, Doc 06 Ch6) ---

export async function createApprovalRoleAction(raw: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const { audit } = await requirePermission("organization.approvalRoles.manage");
    const role = await service.createApprovalRole(audit, parse(approvalRoleSchema, raw));
    revalidatePath("/organization");
    return ok({ id: role.id });
  } catch (error) {
    return toActionError(error);
  }
}

export async function updateApprovalRoleAction(id: string, raw: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const { audit } = await requirePermission("organization.approvalRoles.manage");
    const role = await service.updateApprovalRole(audit, id, parse(approvalRoleSchema, raw));
    revalidatePath("/organization");
    return ok({ id: role.id });
  } catch (error) {
    return toActionError(error);
  }
}

export async function setApprovalRoleActiveAction(id: string, isActive: boolean): Promise<ActionResult<undefined>> {
  try {
    const { audit } = await requirePermission("organization.approvalRoles.manage");
    await service.setApprovalRoleActive(audit, id, isActive);
    revalidatePath("/organization");
    return ok(undefined);
  } catch (error) {
    return toActionError(error);
  }
}

export async function assignApprovalRoleAction(raw: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const { audit } = await requirePermission("organization.approvalRoles.manage");
    const assignment = await service.assignApprovalRole(audit, parse(approvalRoleAssignmentSchema, raw));
    revalidatePath("/organization");
    return ok({ id: assignment.id });
  } catch (error) {
    return toActionError(error);
  }
}

export async function removeApprovalRoleAssignmentAction(id: string): Promise<ActionResult<undefined>> {
  try {
    const { audit } = await requirePermission("organization.approvalRoles.manage");
    await service.removeApprovalRoleAssignment(audit, id);
    revalidatePath("/organization");
    return ok(undefined);
  } catch (error) {
    return toActionError(error);
  }
}

// --- Department Heads ---

export async function assignDepartmentHeadAction(raw: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const { audit } = await requirePermission("organization.manage");
    const assignment = await service.assignDepartmentHead(audit, parse(departmentHeadSchema, raw));
    revalidatePath("/organization");
    return ok({ id: assignment.id });
  } catch (error) {
    return toActionError(error);
  }
}

export async function removeDepartmentHeadAction(id: string): Promise<ActionResult<undefined>> {
  try {
    const { audit } = await requirePermission("organization.manage");
    await service.removeDepartmentHead(audit, id);
    revalidatePath("/organization");
    return ok(undefined);
  } catch (error) {
    return toActionError(error);
  }
}
