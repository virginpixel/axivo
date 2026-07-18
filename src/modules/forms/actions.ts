"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/shared/auth/guard";
import { ok, toActionError, type ActionResult } from "@/shared/errors";
import { parseInput as parse } from "@/shared/validation/common";
import * as service from "./service";
import { formSchema, requestTypeSchema } from "./validators";

/** Forms server actions (SDS Doc 22). */

export async function createRequestTypeAction(raw: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const { audit } = await requirePermission("forms.manage");
    const requestType = await service.createRequestType(audit, parse(requestTypeSchema, raw));
    revalidatePath("/forms");
    return ok({ id: requestType.id });
  } catch (error) {
    return toActionError(error);
  }
}

export async function setRequestTypeActiveAction(id: string, isActive: boolean): Promise<ActionResult<undefined>> {
  try {
    const { audit } = await requirePermission("forms.manage");
    await service.setRequestTypeActive(audit, id, isActive);
    revalidatePath("/forms");
    return ok(undefined);
  } catch (error) {
    return toActionError(error);
  }
}

export async function createFormAction(raw: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const { audit } = await requirePermission("forms.manage");
    const form = await service.createForm(audit, parse(formSchema, raw));
    revalidatePath("/forms");
    return ok({ id: form.id });
  } catch (error) {
    return toActionError(error);
  }
}

export async function updateFormAction(id: string, raw: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const { audit } = await requirePermission("forms.manage");
    const result = await service.updateForm(audit, id, parse(formSchema, raw));
    revalidatePath("/forms");
    return ok({ id: result.formId });
  } catch (error) {
    return toActionError(error);
  }
}

export async function publishFormAction(id: string): Promise<ActionResult<undefined>> {
  try {
    const { audit } = await requirePermission("forms.manage");
    await service.publishForm(audit, id);
    revalidatePath("/forms");
    return ok(undefined);
  } catch (error) {
    return toActionError(error);
  }
}

export async function archiveFormAction(id: string): Promise<ActionResult<undefined>> {
  try {
    const { audit } = await requirePermission("forms.manage");
    await service.archiveForm(audit, id);
    revalidatePath("/forms");
    return ok(undefined);
  } catch (error) {
    return toActionError(error);
  }
}

export async function duplicateFormAction(id: string): Promise<ActionResult<{ id: string }>> {
  try {
    const { audit } = await requirePermission("forms.manage");
    const copy = await service.duplicateForm(audit, id);
    revalidatePath("/forms");
    return ok({ id: copy.id });
  } catch (error) {
    return toActionError(error);
  }
}
