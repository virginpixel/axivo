"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/shared/auth/guard";
import { ok, toActionError, type ActionResult } from "@/shared/errors";
import { parseInput as parse } from "@/shared/validation/common";
import { z } from "zod";
import { uuidSchema } from "@/shared/validation/common";
import * as service from "./service";
import {
  assetCategorySchema,
  assetSchema,
  assetStatusSchema,
  assetAssignmentSchema,
  maintenanceSchema,
  disposalSchema,
  clearanceVerifySchema,
} from "./validators";

/** Assets server actions (SDS Doc 11). */

export async function createAssetCategoryAction(raw: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const { audit } = await requirePermission("assets.manage");
    const category = await service.createAssetCategory(audit, parse(assetCategorySchema, raw));
    revalidatePath("/assets");
    return ok({ id: category.id });
  } catch (error) {
    return toActionError(error);
  }
}

export async function updateAssetCategoryAction(id: string, raw: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const { audit } = await requirePermission("assets.manage");
    const category = await service.updateAssetCategory(audit, id, parse(assetCategorySchema, raw));
    revalidatePath("/assets");
    return ok({ id: category.id });
  } catch (error) {
    return toActionError(error);
  }
}

export async function setAssetCategoryActiveAction(id: string, isActive: boolean): Promise<ActionResult<undefined>> {
  try {
    const { audit } = await requirePermission("assets.manage");
    await service.setAssetCategoryActive(audit, id, isActive);
    revalidatePath("/assets");
    return ok(undefined);
  } catch (error) {
    return toActionError(error);
  }
}

export async function createAssetAction(raw: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const { audit } = await requirePermission("assets.manage");
    const asset = await service.createAsset(audit, parse(assetSchema, raw));
    revalidatePath("/assets");
    return ok({ id: asset.id });
  } catch (error) {
    return toActionError(error);
  }
}

export async function updateAssetAction(id: string, raw: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const { audit } = await requirePermission("assets.manage");
    const asset = await service.updateAsset(audit, id, parse(assetSchema, raw));
    revalidatePath("/assets");
    return ok({ id: asset.id });
  } catch (error) {
    return toActionError(error);
  }
}

export async function setAssetStatusAction(id: string, status: unknown): Promise<ActionResult<undefined>> {
  try {
    const { audit } = await requirePermission("assets.manage");
    await service.setAssetStatus(audit, id, parse(assetStatusSchema, status));
    revalidatePath("/assets");
    return ok(undefined);
  } catch (error) {
    return toActionError(error);
  }
}

export async function assignAssetAction(raw: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const { audit } = await requirePermission("assets.assignments.manage");
    const result = await service.assignAsset(audit, parse(assetAssignmentSchema, raw));
    revalidatePath("/assets");
    return ok({ id: result.assignment.id });
  } catch (error) {
    return toActionError(error);
  }
}

export async function returnAssetAction(assignmentId: string, notes?: string): Promise<ActionResult<undefined>> {
  try {
    const { audit } = await requirePermission("assets.assignments.manage");
    await service.returnAsset(audit, assignmentId, notes);
    revalidatePath("/assets");
    return ok(undefined);
  } catch (error) {
    return toActionError(error);
  }
}

const handoverSchema = z
  .object({ personId: uuidSchema, assignmentIds: z.array(uuidSchema).min(1) })
  .strict();

export async function createHandoverAction(raw: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const { audit } = await requirePermission("assets.assignments.manage");
    const input = parse(handoverSchema, raw);
    const handover = await service.createHandoverForAssignments(audit, input.personId, input.assignmentIds);
    revalidatePath("/assets");
    return ok({ id: handover.id });
  } catch (error) {
    return toActionError(error);
  }
}

export async function startClearanceAction(personId: string, notes?: string): Promise<ActionResult<{ id: string }>> {
  try {
    const { audit } = await requirePermission("assets.assignments.manage");
    const clearance = await service.startClearance(audit, personId, notes);
    revalidatePath("/assets");
    return ok({ id: clearance.id });
  } catch (error) {
    return toActionError(error);
  }
}

export async function verifyClearanceItemAction(raw: unknown): Promise<ActionResult<undefined>> {
  try {
    const { audit } = await requirePermission("assets.assignments.manage");
    await service.verifyClearanceItem(audit, parse(clearanceVerifySchema, raw));
    revalidatePath("/assets");
    return ok(undefined);
  } catch (error) {
    return toActionError(error);
  }
}

export async function completeClearanceAction(clearanceId: string): Promise<ActionResult<undefined>> {
  try {
    const { audit } = await requirePermission("assets.assignments.manage");
    await service.completeClearance(audit, clearanceId);
    revalidatePath("/assets");
    return ok(undefined);
  } catch (error) {
    return toActionError(error);
  }
}

export async function createMaintenanceAction(raw: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const { audit } = await requirePermission("assets.maintenance.manage");
    const maintenance = await service.createMaintenance(audit, parse(maintenanceSchema, raw));
    revalidatePath("/assets");
    return ok({ id: maintenance.id });
  } catch (error) {
    return toActionError(error);
  }
}

export async function setMaintenanceStatusAction(
  id: string,
  status: "IN_PROGRESS" | "COMPLETED" | "CANCELLED",
): Promise<ActionResult<undefined>> {
  try {
    const { audit } = await requirePermission("assets.maintenance.manage");
    await service.setMaintenanceStatus(audit, id, status);
    revalidatePath("/assets");
    return ok(undefined);
  } catch (error) {
    return toActionError(error);
  }
}

export async function disposeAssetAction(raw: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const { audit } = await requirePermission("assets.disposal.manage");
    const disposal = await service.disposeAsset(audit, parse(disposalSchema, raw));
    revalidatePath("/assets");
    return ok({ id: disposal.id });
  } catch (error) {
    return toActionError(error);
  }
}
