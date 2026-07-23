"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/shared/auth/guard";
import { ok, toActionError, BusinessRuleError, type ActionResult } from "@/shared/errors";
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
  assetTransferSchema,
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
    revalidatePath(`/assets/${id}`);
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
    revalidatePath(`/assets/${id}`);
    return ok(undefined);
  } catch (error) {
    return toActionError(error);
  }
}

const IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "webp"];

export async function uploadAssetImageAction(assetId: string, formData: FormData): Promise<ActionResult<undefined>> {
  try {
    const { audit } = await requirePermission("assets.manage");
    const { db } = await import("@/shared/db");
    const asset = await db.asset.findFirst({ where: { id: assetId, deletedAt: null } });
    if (!asset) throw new BusinessRuleError("Asset not found.");
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) throw new BusinessRuleError("Choose an image (PNG, JPG or WEBP).");
    const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
    if (!IMAGE_EXTENSIONS.includes(extension)) throw new BusinessRuleError("Images must be PNG, JPG or WEBP.");
    if (file.size > 5 * 1024 * 1024) throw new BusinessRuleError("Image must be 5 MB or smaller.");
    const { storage } = await import("@/shared/storage/storage");
    const stored = await storage.save(Buffer.from(await file.arrayBuffer()), extension, "assets");
    if (asset.imagePath) await storage.delete(asset.imagePath).catch(() => undefined);
    await db.asset.update({ where: { id: assetId }, data: { imagePath: stored.storageKey } });
    revalidatePath("/assets", "layout");
    return ok(undefined);
  } catch (error) {
    return toActionError(error);
  }
}

export async function removeAssetImageAction(assetId: string): Promise<ActionResult<undefined>> {
  try {
    await requirePermission("assets.manage");
    const { db } = await import("@/shared/db");
    const asset = await db.asset.findFirst({ where: { id: assetId, deletedAt: null } });
    if (!asset) throw new BusinessRuleError("Asset not found.");
    if (asset.imagePath) {
      const { storage } = await import("@/shared/storage/storage");
      await storage.delete(asset.imagePath).catch(() => undefined);
    }
    await db.asset.update({ where: { id: assetId }, data: { imagePath: null } });
    revalidatePath("/assets", "layout");
    return ok(undefined);
  } catch (error) {
    return toActionError(error);
  }
}

export async function assignAssetAction(raw: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const { audit } = await requirePermission("assets.assignments.manage");
    const result = await service.assignAsset(audit, parse(assetAssignmentSchema, raw));
    revalidatePath("/assets", "layout");
    revalidatePath("/people", "layout");
    return ok({ id: result.assignment.id });
  } catch (error) {
    return toActionError(error);
  }
}

export async function returnAssetAction(assignmentId: string, notes?: string): Promise<ActionResult<undefined>> {
  try {
    const { audit } = await requirePermission("assets.assignments.manage");
    await service.returnAsset(audit, assignmentId, notes);
    revalidatePath("/assets", "layout");
    revalidatePath("/people", "layout");
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

/**
 * Generate a handover form covering every asset currently assigned to a person.
 * The form is created but NOT sent - the UI previews it, then calls
 * sendHandoverAction to dispatch the acknowledgement email.
 */
export async function generatePersonHandoverAction(
  personId: string,
): Promise<ActionResult<{ id: string; documentId: string | null }>> {
  try {
    const { audit } = await requirePermission("assets.assignments.manage");
    const { db } = await import("@/shared/db");
    const activeAssignments = await db.assetAssignment.findMany({
      where: { personId, status: "ASSIGNED", deletedAt: null },
      select: { id: true },
    });
    if (activeAssignments.length === 0) {
      throw new BusinessRuleError("This employee has no currently assigned assets to hand over.");
    }
    const handover = await service.createHandoverForAssignments(
      audit,
      personId,
      activeAssignments.map((a) => a.id),
      false,
    );
    revalidatePath(`/people/${personId}`);
    return ok({ id: handover.id, documentId: handover.documentId });
  } catch (error) {
    return toActionError(error);
  }
}

/**
 * Generate a handover form for a chosen subset of the person's assigned assets.
 * Created but NOT sent: the UI previews it, then calls sendHandoverAction.
 */
export async function generateHandoverForAssetsAction(
  personId: string,
  assignmentIds: string[],
): Promise<ActionResult<{ id: string; documentId: string | null }>> {
  try {
    const { audit } = await requirePermission("assets.assignments.manage");
    if (assignmentIds.length === 0) {
      throw new BusinessRuleError("Select at least one asset to include on the handover form.");
    }
    const handover = await service.createHandoverForAssignments(audit, personId, assignmentIds, false);
    revalidatePath(`/people/${personId}`);
    return ok({ id: handover.id, documentId: handover.documentId });
  } catch (error) {
    return toActionError(error);
  }
}

/** Send the acknowledgement email for a previously generated handover. */
export async function sendHandoverAction(
  handoverId: string,
  overrideEmail?: string,
): Promise<ActionResult<undefined>> {
  try {
    const { audit } = await requirePermission("assets.assignments.manage");
    await service.sendHandover(audit, handoverId, overrideEmail || undefined);
    revalidatePath("/people", "layout");
    revalidatePath("/requests", "layout");
    return ok(undefined);
  } catch (error) {
    return toActionError(error);
  }
}

export async function startClearanceAction(personId: string, notes?: string): Promise<ActionResult<{ id: string }>> {
  try {
    const { audit } = await requirePermission("assets.assignments.manage");
    const clearance = await service.startClearance(audit, personId, notes);
    revalidatePath("/assets", "layout");
    revalidatePath(`/people/${personId}`);
    return ok({ id: clearance.id });
  } catch (error) {
    return toActionError(error);
  }
}

export async function verifyClearanceItemAction(raw: unknown): Promise<ActionResult<undefined>> {
  try {
    const { audit } = await requirePermission("assets.assignments.manage");
    await service.verifyClearanceItem(audit, parse(clearanceVerifySchema, raw));
    revalidatePath("/assets", "layout");
    revalidatePath("/people", "layout");
    return ok(undefined);
  } catch (error) {
    return toActionError(error);
  }
}

export async function completeClearanceAction(
  clearanceId: string,
  finalStatus: "RESIGNED" | "TERMINATED",
): Promise<ActionResult<undefined>> {
  try {
    const { audit } = await requirePermission("assets.assignments.manage");
    await service.completeClearance(audit, clearanceId, finalStatus);
    revalidatePath("/assets", "layout");
    revalidatePath("/people", "layout");
    return ok(undefined);
  } catch (error) {
    return toActionError(error);
  }
}

export async function cancelClearanceAction(clearanceId: string): Promise<ActionResult<undefined>> {
  try {
    const { audit } = await requirePermission("assets.assignments.manage");
    await service.cancelClearance(audit, clearanceId);
    revalidatePath("/assets", "layout");
    revalidatePath("/people", "layout");
    return ok(undefined);
  } catch (error) {
    return toActionError(error);
  }
}

export async function removeClearanceItemAction(clearanceItemId: string): Promise<ActionResult<undefined>> {
  try {
    const { audit } = await requirePermission("assets.assignments.manage");
    await service.removeClearanceItem(audit, clearanceItemId);
    revalidatePath("/assets", "layout");
    revalidatePath("/people", "layout");
    return ok(undefined);
  } catch (error) {
    return toActionError(error);
  }
}

export async function createMaintenanceAction(raw: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const { audit } = await requirePermission("assets.maintenance.manage");
    const maintenance = await service.createMaintenance(audit, parse(maintenanceSchema, raw));
    revalidatePath("/assets", "layout");
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
    revalidatePath("/assets", "layout");
    return ok(undefined);
  } catch (error) {
    return toActionError(error);
  }
}

export async function discardAssetsAction(raw: unknown): Promise<ActionResult<{ count: number }>> {
  try {
    const { audit } = await requirePermission("assets.disposal.manage");
    const result = await service.discardAssets(audit, parse(disposalSchema, raw));
    revalidatePath("/assets", "layout");
    revalidatePath("/documents");
    return ok(result);
  } catch (error) {
    return toActionError(error);
  }
}

export async function deleteAssetAction(id: string): Promise<ActionResult<{ id: string }>> {
  try {
    const { audit } = await requirePermission("assets.manage");
    const result = await service.deleteAsset(audit, parse(uuidSchema, id));
    revalidatePath("/assets", "layout");
    return ok(result);
  } catch (error) {
    return toActionError(error);
  }
}

export async function transferAssetAction(raw: unknown): Promise<ActionResult<{ id: string; changes: string[] }>> {
  try {
    const { audit } = await requirePermission("assets.manage");
    const result = await service.transferAsset(audit, parse(assetTransferSchema, raw));
    revalidatePath("/assets", "layout");
    revalidatePath("/people", "layout");
    return ok(result);
  } catch (error) {
    return toActionError(error);
  }
}
