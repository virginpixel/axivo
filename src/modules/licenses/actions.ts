"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/shared/auth/guard";
import { ok, toActionError, type ActionResult } from "@/shared/errors";
import { parseInput as parse } from "@/shared/validation/common";
import { z } from "zod";
import * as service from "./service";
import { licenseSchema, licensePurchaseSchema, licenseAssignmentSchema } from "./validators";

/** Licenses server actions (SDS Doc 10). */

const licenseStatusSchema = z.enum(["DRAFT", "ACTIVE", "SUSPENDED", "EXPIRED", "RETIRED"]);

export async function createLicenseAction(raw: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const { audit } = await requirePermission("licenses.manage");
    const license = await service.createLicense(audit, parse(licenseSchema, raw));
    revalidatePath("/licenses");
    return ok({ id: license.id });
  } catch (error) {
    return toActionError(error);
  }
}

export async function updateLicenseAction(id: string, raw: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const { audit } = await requirePermission("licenses.manage");
    const license = await service.updateLicense(audit, id, parse(licenseSchema, raw));
    revalidatePath("/licenses");
    return ok({ id: license.id });
  } catch (error) {
    return toActionError(error);
  }
}

export async function setLicenseStatusAction(id: string, status: unknown): Promise<ActionResult<undefined>> {
  try {
    const { audit } = await requirePermission("licenses.manage");
    await service.setLicenseStatus(audit, id, parse(licenseStatusSchema, status));
    revalidatePath("/licenses");
    return ok(undefined);
  } catch (error) {
    return toActionError(error);
  }
}

export async function deleteLicenseAction(id: string): Promise<ActionResult<undefined>> {
  try {
    const { audit } = await requirePermission("licenses.manage");
    await service.deleteLicense(audit, id);
    revalidatePath("/licenses");
    return ok(undefined);
  } catch (error) {
    return toActionError(error);
  }
}

export async function recordPurchaseAction(raw: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const { audit } = await requirePermission("licenses.manage");
    const purchase = await service.recordPurchase(audit, parse(licensePurchaseSchema, raw));
    revalidatePath("/licenses");
    return ok({ id: purchase.id });
  } catch (error) {
    return toActionError(error);
  }
}

export async function assignLicenseAction(raw: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const { audit } = await requirePermission("licenses.assignments.manage");
    const assignment = await service.assignLicense(audit, parse(licenseAssignmentSchema, raw));
    revalidatePath("/licenses");
    return ok({ id: assignment.id });
  } catch (error) {
    return toActionError(error);
  }
}

export async function setLicenseAssignmentStatusAction(
  id: string,
  status: "ACTIVE" | "SUSPENDED",
): Promise<ActionResult<undefined>> {
  try {
    const { audit } = await requirePermission("licenses.assignments.manage");
    await service.setLicenseAssignmentStatus(audit, id, status);
    revalidatePath("/licenses");
    return ok(undefined);
  } catch (error) {
    return toActionError(error);
  }
}

export async function removeLicenseAssignmentAction(id: string, notes?: string): Promise<ActionResult<undefined>> {
  try {
    const { audit } = await requirePermission("licenses.assignments.manage");
    await service.removeLicenseAssignment(audit, id, notes);
    revalidatePath("/licenses");
    return ok(undefined);
  } catch (error) {
    return toActionError(error);
  }
}
