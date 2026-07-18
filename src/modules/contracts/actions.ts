"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/shared/auth/guard";
import { ok, toActionError, type ActionResult } from "@/shared/errors";
import { parseInput as parse } from "@/shared/validation/common";
import * as service from "./service";
import { contractSchema, contractRenewalSchema, contractLinkSchema } from "./validators";

/** Contracts server actions (SDS Doc 23). */

const contractStatusSchema = z.enum(["DRAFT", "ACTIVE", "EXPIRING", "EXPIRED", "RENEWED", "TERMINATED"]);

export async function createContractAction(raw: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const { audit } = await requirePermission("contracts.manage");
    const contract = await service.createContract(audit, parse(contractSchema, raw));
    revalidatePath("/contracts");
    return ok({ id: contract.id });
  } catch (error) {
    return toActionError(error);
  }
}

export async function updateContractAction(id: string, raw: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const { audit } = await requirePermission("contracts.manage");
    const contract = await service.updateContract(audit, id, parse(contractSchema, raw));
    revalidatePath("/contracts");
    return ok({ id: contract.id });
  } catch (error) {
    return toActionError(error);
  }
}

export async function setContractStatusAction(id: string, status: unknown): Promise<ActionResult<undefined>> {
  try {
    const { audit } = await requirePermission("contracts.manage");
    await service.setContractStatus(audit, id, parse(contractStatusSchema, status));
    revalidatePath("/contracts");
    return ok(undefined);
  } catch (error) {
    return toActionError(error);
  }
}

export async function renewContractAction(raw: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const { audit } = await requirePermission("contracts.manage");
    const renewal = await service.renewContract(audit, parse(contractRenewalSchema, raw));
    revalidatePath("/contracts");
    return ok({ id: renewal.id });
  } catch (error) {
    return toActionError(error);
  }
}

export async function linkContractAction(raw: unknown): Promise<ActionResult<undefined>> {
  try {
    const { audit } = await requirePermission("contracts.manage");
    await service.linkContract(audit, parse(contractLinkSchema, raw));
    revalidatePath("/contracts");
    return ok(undefined);
  } catch (error) {
    return toActionError(error);
  }
}

export async function unlinkContractAction(linkId: string): Promise<ActionResult<undefined>> {
  try {
    const { audit } = await requirePermission("contracts.manage");
    await service.unlinkContract(audit, linkId);
    revalidatePath("/contracts");
    return ok(undefined);
  } catch (error) {
    return toActionError(error);
  }
}
