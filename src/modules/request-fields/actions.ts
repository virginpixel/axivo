"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/shared/auth/guard";
import { ok, toActionError, type ActionResult } from "@/shared/errors";
import { parseInput as parse } from "@/shared/validation/common";
import * as service from "./service";
import { requestFieldSchema, type RequestFieldInput } from "./validators";

/** Request field server actions (SDS Doc 08/11). */

/**
 * Applications and asset categories are managed by different roles, so the
 * permission required depends on which one owns the field.
 */
function permissionFor(input: Pick<RequestFieldInput, "applicationId">) {
  return input.applicationId ? "applications.manage" : "assets.manage";
}

function revalidateOwner(input: { applicationId?: string | null; assetCategoryId?: string | null }) {
  if (input.applicationId) revalidatePath(`/applications/${input.applicationId}`);
  if (input.assetCategoryId) revalidatePath(`/settings/categories/${input.assetCategoryId}`);
  // Public forms render these fields, so their cache has to drop too.
  revalidatePath("/r", "layout");
}

export async function createRequestFieldAction(raw: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const input = parse(requestFieldSchema, raw);
    const { audit } = await requirePermission(permissionFor(input));
    const field = await service.createRequestField(audit, input);
    revalidateOwner(input);
    return ok({ id: field.id });
  } catch (error) {
    return toActionError(error);
  }
}

export async function updateRequestFieldAction(id: string, raw: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const input = parse(requestFieldSchema, raw);
    const { audit } = await requirePermission(permissionFor(input));
    const field = await service.updateRequestField(audit, id, input);
    revalidateOwner(input);
    return ok({ id: field.id });
  } catch (error) {
    return toActionError(error);
  }
}

export async function setRequestFieldActiveAction(
  id: string,
  isActive: boolean,
  owner: { applicationId?: string; assetCategoryId?: string },
): Promise<ActionResult<undefined>> {
  try {
    const { audit } = await requirePermission(owner.applicationId ? "applications.manage" : "assets.manage");
    await service.setRequestFieldActive(audit, id, isActive);
    revalidateOwner(owner);
    return ok(undefined);
  } catch (error) {
    return toActionError(error);
  }
}

export async function deleteRequestFieldAction(
  id: string,
  owner: { applicationId?: string; assetCategoryId?: string },
): Promise<ActionResult<undefined>> {
  try {
    const { audit } = await requirePermission(owner.applicationId ? "applications.manage" : "assets.manage");
    await service.deleteRequestField(audit, id);
    revalidateOwner(owner);
    return ok(undefined);
  } catch (error) {
    return toActionError(error);
  }
}
