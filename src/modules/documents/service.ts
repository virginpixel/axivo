import { db, type DbClient } from "@/shared/db";
import { storage, validateUpload, fileExtension, mimeForExtension, sanitizeFileName } from "@/shared/storage/storage";
import { getSetting, SETTING_KEYS } from "@/shared/settings/settings";
import { recordAudit, type AuditContext } from "@/shared/audit/audit";
import { NotFoundError, AuthorizationError, BusinessRuleError } from "@/shared/errors";
import { renderPdf, type PdfDefinition } from "@/shared/pdf/pdf";
import type { AuthenticatedUser } from "@/shared/auth/session";
import type { Document, DocumentKind, DocumentVersion } from "@prisma/client";

/**
 * Documents service (SDS Doc 12): centralized repository for generated and
 * uploaded documents with immutable version history and multi-record links.
 * Documents are never hard-deleted through user operations.
 */

export const SYSTEM_DOCUMENT_CATEGORIES = [
  "Asset Handover",
  "Clearance",
  "Credential Delivery",
  "Application Request",
  "Asset Disposal",
  "Contract",
  "Supporting Document",
  "System Generated",
  "User Uploaded",
] as const;

export interface DocumentLinkInput {
  entityType: string;
  entityId: string;
}

async function resolveCategoryId(
  companyId: string,
  categoryName: string,
  client: DbClient,
): Promise<string | null> {
  const category = await client.documentCategory.findFirst({
    where: { companyId, name: categoryName, deletedAt: null },
  });
  return category?.id ?? null;
}

export interface CreateUploadedDocumentInput {
  companyId: string;
  name: string;
  categoryName?: string;
  fileName: string;
  content: Buffer;
  links?: DocumentLinkInput[];
  notes?: string;
}

export async function createUploadedDocument(
  context: AuditContext,
  input: CreateUploadedDocumentInput,
): Promise<Document> {
  const [maxMb, allowedTypes] = await Promise.all([
    getSetting<number>(SETTING_KEYS.UPLOAD_MAX_MB),
    getSetting<string[]>(SETTING_KEYS.UPLOAD_ALLOWED_TYPES),
  ]);
  validateUpload(input.fileName, input.content.length, allowedTypes, maxMb);

  const extension = fileExtension(input.fileName);
  const stored = await storage.save(input.content, extension, "uploads");
  const kind = kindForExtension(extension);

  const document = await db.$transaction(async (tx) => {
    const categoryId = input.categoryName
      ? await resolveCategoryId(input.companyId, input.categoryName, tx)
      : null;
    const created = await tx.document.create({
      data: {
        companyId: input.companyId,
        categoryId,
        name: input.name,
        kind,
        isGenerated: false,
        notes: input.notes,
        createdById: context.actorUserId ?? null,
        versions: {
          create: {
            versionNumber: 1,
            filePath: stored.storageKey,
            fileName: sanitizeFileName(input.fileName),
            fileSize: stored.fileSize,
            mimeType: mimeForExtension(extension),
            checksum: stored.checksum,
            createdById: context.actorUserId ?? null,
          },
        },
        links: {
          create: (input.links ?? []).map((link) => ({
            entityType: link.entityType,
            entityId: link.entityId,
            createdById: context.actorUserId ?? null,
          })),
        },
      },
    });
    await recordAudit(
      { ...context, companyId: input.companyId },
      {
        module: "documents",
        eventType: "document.uploaded",
        action: `Uploaded document "${input.name}"`,
        targetType: "document",
        targetId: created.id,
        targetLabel: input.name,
      },
      tx,
    );
    return created;
  });
  return document;
}

export interface CreateGeneratedPdfInput {
  companyId: string;
  name: string;
  categoryName: string;
  definition: PdfDefinition;
  links?: DocumentLinkInput[];
  /** Regenerate: add a version to this existing document instead of creating a new one. */
  existingDocumentId?: string;
  changeSummary?: string;
}

/**
 * Generate a branded PDF and store it as an immutable document version
 * (Doc 12 Ch6). Regeneration through an approved business process creates a
 * new version; historical versions remain.
 */
/** Read the configured generated-document logos from storage, if any. */
async function loadGeneratedLogos(): Promise<{ left?: Buffer; center?: Buffer; right?: Buffer } | null> {
  try {
    const { getSetting, SETTING_KEYS } = await import("@/shared/settings/settings");
    const config = await getSetting<Record<string, { storageKey: string } | null>>(SETTING_KEYS.GENERATED_LOGOS);
    const positions = ["left", "center", "right"] as const;
    const result: { left?: Buffer; center?: Buffer; right?: Buffer } = {};
    let any = false;
    for (const position of positions) {
      const key = config[position]?.storageKey;
      if (!key) continue;
      try {
        result[position] = await storage.read(key);
        any = true;
      } catch {
        /* ignore missing file */
      }
    }
    return any ? result : null;
  } catch {
    return null;
  }
}

/** The configured brand colour, so generated documents match the portal. */
async function loadBrandPrimaryColor(): Promise<string | null> {
  // The brand color is a fixed product constant (Settings no longer exposes it).
  const { BRAND_PRIMARY } = await import("@/shared/branding");
  return BRAND_PRIMARY;
}

export async function createGeneratedPdf(
  context: AuditContext,
  input: CreateGeneratedPdfInput,
  client: DbClient = db,
): Promise<Document> {
  // Stamp the configured generated-document logos (left/center/right) and the
  // configured brand colour onto the PDF, so a printed form matches the portal
  // rather than carrying a hard-coded blue.
  const [logos, primaryColor] = await Promise.all([loadGeneratedLogos(), loadBrandPrimaryColor()]);
  const definition = {
    ...input.definition,
    branding: {
      ...input.definition.branding,
      ...(logos ? { logos } : {}),
      ...(primaryColor ? { primaryColor } : {}),
    },
  };
  const pdf = await renderPdf(definition);
  const stored = await storage.save(pdf, "pdf", "generated");

  const run = async (tx: DbClient): Promise<Document> => {
    if (input.existingDocumentId) {
      const existing = await tx.document.findUnique({
        where: { id: input.existingDocumentId },
        include: { versions: { orderBy: { versionNumber: "desc" }, take: 1 } },
      });
      if (!existing) throw new NotFoundError("Document not found.");
      const nextVersion = (existing.versions[0]?.versionNumber ?? 0) + 1;
      await tx.documentVersion.create({
        data: {
          documentId: existing.id,
          versionNumber: nextVersion,
          filePath: stored.storageKey,
          fileName: `${sanitizeFileName(input.name)}.pdf`,
          fileSize: stored.fileSize,
          mimeType: "application/pdf",
          checksum: stored.checksum,
          changeSummary: input.changeSummary ?? "Regenerated",
          createdById: context.actorUserId ?? null,
        },
      });
      const updated = await tx.document.update({
        where: { id: existing.id },
        data: { currentVersion: nextVersion },
      });
      await recordAudit(
        { ...context, companyId: input.companyId },
        {
          module: "documents",
          eventType: "document.regenerated",
          action: `Regenerated document "${existing.name}" (v${nextVersion})`,
          targetType: "document",
          targetId: existing.id,
          targetLabel: existing.name,
        },
        tx,
      );
      return updated;
    }

    const categoryId = await resolveCategoryId(input.companyId, input.categoryName, tx);
    const created = await tx.document.create({
      data: {
        companyId: input.companyId,
        categoryId,
        name: input.name,
        kind: "GENERATED_PDF",
        isGenerated: true,
        createdById: context.actorUserId ?? null,
        versions: {
          create: {
            versionNumber: 1,
            filePath: stored.storageKey,
            fileName: `${sanitizeFileName(input.name)}.pdf`,
            fileSize: stored.fileSize,
            mimeType: "application/pdf",
            checksum: stored.checksum,
            createdById: context.actorUserId ?? null,
          },
        },
        links: {
          create: (input.links ?? []).map((link) => ({
            entityType: link.entityType,
            entityId: link.entityId,
            createdById: context.actorUserId ?? null,
          })),
        },
      },
    });
    await recordAudit(
      { ...context, companyId: input.companyId },
      {
        module: "documents",
        eventType: "document.generated",
        action: `Generated document "${input.name}"`,
        targetType: "document",
        targetId: created.id,
        targetLabel: input.name,
      },
      tx,
    );
    return created;
  };

  if (client === db) {
    return db.$transaction(async (tx) => run(tx));
  }
  return run(client);
}

export async function addDocumentLink(
  context: AuditContext,
  documentId: string,
  link: DocumentLinkInput,
  client: DbClient = db,
): Promise<void> {
  const document = await client.document.findUnique({ where: { id: documentId } });
  if (!document) throw new NotFoundError("Document not found.");
  const existing = await client.documentLink.findFirst({
    where: { documentId, entityType: link.entityType, entityId: link.entityId, removedAt: null },
  });
  if (existing) return;
  await client.documentLink.create({
    data: {
      documentId,
      entityType: link.entityType,
      entityId: link.entityId,
      createdById: context.actorUserId ?? null,
    },
  });
  await recordAudit(
    { ...context, companyId: document.companyId },
    {
      module: "documents",
      eventType: "document.link_created",
      action: `Linked document to ${link.entityType}`,
      targetType: "document",
      targetId: documentId,
      details: { entityType: link.entityType, entityId: link.entityId },
    },
    client,
  );
}

export async function removeDocumentLink(
  context: AuditContext,
  documentId: string,
  linkId: string,
): Promise<void> {
  const link = await db.documentLink.findUnique({
    where: { id: linkId },
    include: { document: true },
  });
  if (!link || link.documentId !== documentId) throw new NotFoundError("Document link not found.");
  if (link.removedAt) return;
  await db.documentLink.update({
    where: { id: linkId },
    data: { removedAt: new Date(), removedById: context.actorUserId ?? null },
  });
  await recordAudit(
    { ...context, companyId: link.document.companyId },
    {
      module: "documents",
      eventType: "document.link_removed",
      action: `Removed document link to ${link.entityType}`,
      targetType: "document",
      targetId: documentId,
      details: { entityType: link.entityType, entityId: link.entityId },
    },
  );
}

function kindForExtension(extension: string): DocumentKind {
  if (["jpg", "jpeg", "png", "gif"].includes(extension)) return "IMAGE";
  if (["xlsx", "csv"].includes(extension)) return "SPREADSHEET";
  if (["docx"].includes(extension)) return "WORD_DOCUMENT";
  if (extension === "pdf") return "UPLOADED_FILE";
  return "OTHER";
}

/**
 * Authorized download (Doc 12 Ch8): company isolation enforced; every access
 * is audited.
 */
export async function getDocumentFileForUser(
  user: AuthenticatedUser,
  context: AuditContext,
  documentId: string,
  versionNumber?: number,
): Promise<{ content: Buffer; version: DocumentVersion; document: Document }> {
  const document = await db.document.findUnique({
    where: { id: documentId },
    include: { versions: true },
  });
  if (!document) throw new NotFoundError("Document not found.");
  if (!user.permissions.has("documents.view")) {
    throw new AuthorizationError();
  }
  // Company isolation: System Administrators may access all companies.
  if (
    document.companyId !== user.companyId &&
    user.systemRoleKey !== "SYSTEM_ADMINISTRATOR"
  ) {
    await recordAudit(context, {
      module: "documents",
      eventType: "document.access_denied",
      action: "Cross-company document access denied",
      outcome: "DENIED",
      targetType: "document",
      targetId: documentId,
    });
    throw new AuthorizationError();
  }
  const target = versionNumber ?? document.currentVersion;
  const version = document.versions.find((v) => v.versionNumber === target);
  if (!version) throw new NotFoundError("Document version not found.");
  const content = await storage.read(version.filePath);
  await recordAudit(
    { ...context, companyId: document.companyId },
    {
      module: "documents",
      eventType: "document.downloaded",
      action: `Downloaded "${document.name}" v${version.versionNumber}`,
      targetType: "document",
      targetId: documentId,
      targetLabel: document.name,
    },
  );
  return { content, version, document };
}

/** Upload a new version of an existing document (permission checked by caller). */
export async function uploadNewVersion(
  context: AuditContext,
  documentId: string,
  fileName: string,
  content: Buffer,
  changeSummary?: string,
): Promise<DocumentVersion> {
  const document = await db.document.findUnique({
    where: { id: documentId },
    include: { versions: { orderBy: { versionNumber: "desc" }, take: 1 }, category: true },
  });
  if (!document) throw new NotFoundError("Document not found.");
  if (document.isGenerated) {
    throw new BusinessRuleError("Generated documents can only be regenerated through their business process.");
  }
  if (document.category && !document.category.allowVersioning) {
    throw new BusinessRuleError("This document category does not allow new versions.");
  }
  const [maxMb, allowedTypes] = await Promise.all([
    getSetting<number>(SETTING_KEYS.UPLOAD_MAX_MB),
    getSetting<string[]>(SETTING_KEYS.UPLOAD_ALLOWED_TYPES),
  ]);
  validateUpload(fileName, content.length, allowedTypes, maxMb);
  const extension = fileExtension(fileName);
  const stored = await storage.save(content, extension, "uploads");
  const nextVersion = (document.versions[0]?.versionNumber ?? 0) + 1;

  return db.$transaction(async (tx) => {
    const version = await tx.documentVersion.create({
      data: {
        documentId,
        versionNumber: nextVersion,
        filePath: stored.storageKey,
        fileName: sanitizeFileName(fileName),
        fileSize: stored.fileSize,
        mimeType: mimeForExtension(extension),
        checksum: stored.checksum,
        changeSummary,
        createdById: context.actorUserId ?? null,
      },
    });
    await tx.document.update({
      where: { id: documentId },
      data: { currentVersion: nextVersion },
    });
    await recordAudit(
      { ...context, companyId: document.companyId },
      {
        module: "documents",
        eventType: "document.version_uploaded",
        action: `Uploaded version ${nextVersion} of "${document.name}"`,
        targetType: "document",
        targetId: documentId,
        targetLabel: document.name,
      },
      tx,
    );
    return version;
  });
}
