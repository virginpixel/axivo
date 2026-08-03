import type { Prisma, PrismaClient } from "@prisma/client";

/**
 * Defaults every company gets so it is immediately usable: the standard
 * request types (which forms are built on) and the document categories used
 * across the app. Applied both when a company is created through the portal
 * and by the first-run setup, so a fresh install is never missing them.
 *
 * Kept idempotent (skip-if-present) so it is safe to call on an existing
 * company without creating duplicates.
 */

type Tx = PrismaClient | Prisma.TransactionClient;

export const STANDARD_REQUEST_TYPES: {
  name: string;
  kind: "APPLICATION_ACCESS" | "ASSET_REQUEST" | "ASSET_CHECKOUT" | "ROLE_CHANGE";
  description: string;
}[] = [
  {
    name: "Application Access",
    kind: "APPLICATION_ACCESS",
    description: "Request access to business applications.",
  },
  {
    name: "Asset Request",
    kind: "ASSET_REQUEST",
    description: "Request company assets such as laptops and phones.",
  },
  {
    name: "Asset Checkout",
    kind: "ASSET_CHECKOUT",
    description: "Take equipment you already hold off site for a period of leave.",
  },
  {
    name: "Access Role Change",
    kind: "ROLE_CHANGE",
    description: "Change the role or request fields on access somebody already has.",
  },
];

export const DEFAULT_DOCUMENT_CATEGORIES: string[] = [
  "Asset Handover",
  "Asset Checkout",
  "Access Forms",
  "Role Change Evidence",
  "Clearance",
  "Credential Delivery",
  "Application Request",
  "Asset Disposal",
  "Contract",
  "Supporting Document",
  "System Generated",
  "User Uploaded",
];

/** Create the standard request types and document categories for a company. */
export async function provisionCompanyDefaults(tx: Tx, companyId: string): Promise<void> {
  for (const type of STANDARD_REQUEST_TYPES) {
    const existing = await tx.requestType.findFirst({
      where: { companyId, kind: type.kind, deletedAt: null },
    });
    if (!existing) {
      await tx.requestType.create({
        data: {
          companyId,
          name: type.name,
          kind: type.kind,
          description: type.description,
        },
      });
    }
  }

  for (const name of DEFAULT_DOCUMENT_CATEGORIES) {
    await tx.documentCategory.upsert({
      where: { companyId_name: { companyId, name } },
      create: { companyId, name, isSystem: true },
      update: {},
    });
  }
}
