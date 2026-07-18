"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/shared/auth/guard";
import { ok, toActionError, type ActionResult } from "@/shared/errors";
import { parseInput as parse } from "@/shared/validation/common";
import * as service from "./service";
import {
  personSchema,
  systemUserSchema,
  changeRoleSchema,
  resetPasswordSchema,
  transferCompanySchema,
  employmentStatusSchema,
} from "./validators";

/** People server actions (SDS Doc 07). */

export async function createPersonAction(raw: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const { audit } = await requirePermission("people.manage");
    const person = await service.createPerson(audit, parse(personSchema, raw));
    revalidatePath("/people");
    return ok({ id: person.id });
  } catch (error) {
    return toActionError(error);
  }
}

export async function updatePersonAction(id: string, raw: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const { audit } = await requirePermission("people.manage");
    const person = await service.updatePerson(audit, id, parse(personSchema, raw));
    revalidatePath("/people");
    return ok({ id: person.id });
  } catch (error) {
    return toActionError(error);
  }
}

export async function setEmploymentStatusAction(id: string, status: unknown): Promise<ActionResult<undefined>> {
  try {
    const { audit } = await requirePermission("people.manage");
    await service.setEmploymentStatus(audit, id, parse(employmentStatusSchema, status));
    revalidatePath("/people");
    return ok(undefined);
  } catch (error) {
    return toActionError(error);
  }
}

export async function transferCompanyAction(raw: unknown): Promise<ActionResult<undefined>> {
  try {
    const { audit } = await requirePermission("people.transfer");
    await service.transferCompany(audit, parse(transferCompanySchema, raw));
    revalidatePath("/people");
    return ok(undefined);
  } catch (error) {
    return toActionError(error);
  }
}

export async function createSystemUserAction(raw: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const { audit } = await requirePermission("people.accounts.manage");
    const user = await service.createSystemUser(audit, parse(systemUserSchema, raw));
    revalidatePath("/people");
    return ok({ id: user.id });
  } catch (error) {
    return toActionError(error);
  }
}

export async function resetSystemUserPasswordAction(raw: unknown): Promise<ActionResult<undefined>> {
  try {
    const { audit } = await requirePermission("people.accounts.manage");
    const input = parse(resetPasswordSchema, raw);
    await service.resetSystemUserPassword(audit, input.systemUserId, input.newPassword);
    return ok(undefined);
  } catch (error) {
    return toActionError(error);
  }
}

export async function changeSystemUserRoleAction(raw: unknown): Promise<ActionResult<undefined>> {
  try {
    const { audit } = await requirePermission("people.accounts.manage");
    const input = parse(changeRoleSchema, raw);
    await service.changeSystemUserRole(audit, input.systemUserId, input.systemRoleId);
    revalidatePath("/people");
    return ok(undefined);
  } catch (error) {
    return toActionError(error);
  }
}

export async function setSystemUserEnabledAction(
  systemUserId: string,
  isEnabled: boolean,
): Promise<ActionResult<undefined>> {
  try {
    const { audit } = await requirePermission("people.accounts.manage");
    await service.setSystemUserEnabled(audit, systemUserId, isEnabled);
    revalidatePath("/people");
    return ok(undefined);
  } catch (error) {
    return toActionError(error);
  }
}
