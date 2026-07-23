"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/shared/auth/guard";
import { ok, toActionError, ValidationError, type ActionResult } from "@/shared/errors";
import { uuidSchema, parseInput as parse } from "@/shared/validation/common";
import * as service from "./service";

/** Documents server actions (SDS Doc 12). */

const uploadMetaSchema = z
  .object({
    companyId: uuidSchema,
    name: z.string().trim().min(1, "Document name is required.").max(200),
    categoryName: z.string().trim().max(100).optional(),
    linkEntityType: z.string().trim().max(50).optional(),
    linkEntityId: uuidSchema.optional(),
    // A single form (a signed discard form, for instance) often covers several
    // assets, so an upload may be linked to a whole batch at once.
    linkAssetIds: z.array(uuidSchema).default([]),
    notes: z.string().trim().max(2000).optional(),
  })
  .strict();

export async function uploadDocumentAction(formData: FormData): Promise<ActionResult<{ id: string }>> {
  try {
    const { audit } = await requirePermission("documents.manage");
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) {
      throw new ValidationError(undefined, { file: "Please choose a file to upload." });
    }
    const meta = parse(uploadMetaSchema, {
      companyId: formData.get("companyId"),
      name: formData.get("name") || (file instanceof File ? file.name : ""),
      categoryName: formData.get("categoryName") || undefined,
      linkEntityType: formData.get("linkEntityType") || undefined,
      linkEntityId: formData.get("linkEntityId") || undefined,
      linkAssetIds: formData.getAll("linkAssetIds").filter((value) => typeof value === "string" && value),
      notes: formData.get("notes") || undefined,
    });
    const content = Buffer.from(await file.arrayBuffer());
    const document = await service.createUploadedDocument(audit, {
      companyId: meta.companyId,
      name: meta.name,
      categoryName: meta.categoryName,
      fileName: file.name,
      content,
      notes: meta.notes,
      links: [
        ...(meta.linkEntityType && meta.linkEntityId
          ? [{ entityType: meta.linkEntityType, entityId: meta.linkEntityId }]
          : []),
        ...meta.linkAssetIds.map((assetId) => ({ entityType: "asset", entityId: assetId })),
      ],
    });
    revalidatePath("/documents");
    revalidatePath("/assets", "layout");
    return ok({ id: document.id });
  } catch (error) {
    return toActionError(error);
  }
}

export async function uploadNewVersionAction(
  documentId: string,
  formData: FormData,
): Promise<ActionResult<undefined>> {
  try {
    const { audit } = await requirePermission("documents.manage");
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) {
      throw new ValidationError(undefined, { file: "Please choose a file to upload." });
    }
    const changeSummary = String(formData.get("changeSummary") ?? "").trim() || undefined;
    const content = Buffer.from(await file.arrayBuffer());
    await service.uploadNewVersion(audit, documentId, file.name, content, changeSummary);
    revalidatePath("/documents");
    return ok(undefined);
  } catch (error) {
    return toActionError(error);
  }
}

const linkSchema = z
  .object({
    documentId: uuidSchema,
    entityType: z.string().trim().min(1).max(50),
    entityId: uuidSchema,
  })
  .strict();

export async function addDocumentLinkAction(raw: unknown): Promise<ActionResult<undefined>> {
  try {
    const { audit } = await requirePermission("documents.manage");
    const input = parse(linkSchema, raw);
    await service.addDocumentLink(audit, input.documentId, {
      entityType: input.entityType,
      entityId: input.entityId,
    });
    revalidatePath("/documents");
    return ok(undefined);
  } catch (error) {
    return toActionError(error);
  }
}

export async function removeDocumentLinkAction(
  documentId: string,
  linkId: string,
): Promise<ActionResult<undefined>> {
  try {
    const { audit } = await requirePermission("documents.manage");
    await service.removeDocumentLink(audit, documentId, linkId);
    revalidatePath("/documents");
    return ok(undefined);
  } catch (error) {
    return toActionError(error);
  }
}
