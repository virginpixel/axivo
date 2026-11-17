"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/shared/auth/guard";
import { ok, toActionError, ValidationError, type ActionResult } from "@/shared/errors";
import { parseInput as parse, uuidSchema } from "@/shared/validation/common";
import * as service from "./service";
import type { BudgetImportPreview } from "./service";
import { budgetCreateSchema, budgetImportOptionsSchema, lineSchema, reasonSchema } from "./validators";

/** OPEX and CAPEX budget server actions (SDS Doc 25). */

function revalidate() {
  revalidatePath("/budgets", "layout");
}

export async function createBudgetAction(raw: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const { audit } = await requirePermission("budgets.manage");
    const budget = await service.createBudget(audit, parse(budgetCreateSchema, raw));
    revalidate();
    return ok({ id: budget.id });
  } catch (error) {
    return toActionError(error);
  }
}

export async function deleteBudgetAction(id: string): Promise<ActionResult<undefined>> {
  try {
    const { audit } = await requirePermission("budgets.manage");
    await service.deleteBudget(audit, parse(uuidSchema, id));
    revalidate();
    return ok(undefined);
  } catch (error) {
    return toActionError(error);
  }
}

export async function moveBudgetAction(id: string, move: "submit" | "approve" | "return" | "reopen", raw?: unknown): Promise<ActionResult<undefined>> {
  try {
    // Submitting is the editor's step; deciding on it is the approver's.
    const { audit } = await requirePermission(move === "submit" ? "budgets.manage" : "budgets.approve");
    const reason = move === "return" || move === "reopen" ? parse(reasonSchema, raw).reason : null;
    await service.moveBudget(audit, parse(uuidSchema, id), move, reason);
    revalidate();
    return ok(undefined);
  } catch (error) {
    return toActionError(error);
  }
}

export async function saveLineAction(budgetId: string, lineId: string | null, raw: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const { audit } = await requirePermission("budgets.manage");
    const line = await service.saveLine(audit, parse(uuidSchema, budgetId), parse(lineSchema, raw), lineId ? parse(uuidSchema, lineId) : undefined);
    revalidate();
    return ok({ id: line.id });
  } catch (error) {
    return toActionError(error);
  }
}

export async function deleteLineAction(id: string): Promise<ActionResult<undefined>> {
  try {
    const { audit } = await requirePermission("budgets.manage");
    await service.deleteLine(audit, parse(uuidSchema, id));
    revalidate();
    return ok(undefined);
  } catch (error) {
    return toActionError(error);
  }
}

function fileFrom(formData: FormData): File {
  const file = formData.get("file");
  if (!(file instanceof File)) throw new ValidationError(undefined, { file: "Choose a file to import." });
  return file;
}

export async function previewBudgetImportAction(formData: FormData): Promise<ActionResult<BudgetImportPreview>> {
  try {
    await requirePermission("budgets.manage");
    const budgetId = parse(uuidSchema, formData.get("budgetId"));
    const sheet = (formData.get("sheet") as string | null) || null;
    return ok(await service.previewBudgetImport(budgetId, fileFrom(formData), sheet));
  } catch (error) {
    return toActionError(error);
  }
}

export async function commitBudgetImportAction(formData: FormData): Promise<ActionResult<{ added: number }>> {
  try {
    const { audit } = await requirePermission("budgets.manage");
    const budgetId = parse(uuidSchema, formData.get("budgetId"));
    const options = parse(budgetImportOptionsSchema, JSON.parse(String(formData.get("options") ?? "{}")));
    const result = await service.commitBudgetImport(audit, budgetId, fileFrom(formData), options.sheet, options.allocations);
    revalidate();
    return ok(result);
  } catch (error) {
    return toActionError(error);
  }
}
