import { z } from "zod";
import { uuidSchema, requiredText, optionalText, dateSchema, nonNegativeDecimal } from "@/shared/validation/common";

/** Assets module validation (SDS Doc 11 Ch11). */

export const assetCategorySchema = z
  .object({
    name: requiredText("Category name"),
    description: optionalText(),
    requireHandoverAcceptance: z.boolean().default(false),
    requireClearanceRecovery: z.boolean().default(true),
    /** Approval chain for items requesting this category; falls back to the form's. */
    workflowId: uuidSchema.optional().or(z.literal("").transform(() => undefined)),
  })
  .strict();

export const assetSchema = z
  .object({
    companyId: uuidSchema,
    categoryId: uuidSchema,
    name: requiredText("Asset name", 200),
    assetTag: optionalText(100),
    serialNumber: optionalText(200),
    manufacturer: optionalText(200),
    model: optionalText(200),
    locationId: uuidSchema.optional().or(z.literal("").transform(() => undefined)),
    supplier: optionalText(200),
    purchaseDate: dateSchema.optional(),
    purchasePrice: nonNegativeDecimal("Purchase price").optional(),
    currency: optionalText(10),
    warrantyExpiry: dateSchema.optional(),
    /** Custom field values keyed by CustomField id (from the model's fieldset). */
    customFields: z.record(z.string(), z.string()).optional(),
    notes: optionalText(),
  })
  .strict();

export const assetStatusSchema = z.enum([
  "AVAILABLE",
  "ASSIGNED",
  "UNDER_REPAIR",
  "OUT_OF_ORDER",
  "RESERVED",
  "DISCARDED",
]);

export const assetAssignmentSchema = z
  .object({
    assetId: uuidSchema,
    personId: uuidSchema,
    notes: optionalText(),
  })
  .strict();

export const maintenanceSchema = z
  .object({
    assetId: uuidSchema,
    maintenanceType: requiredText("Maintenance type", 100),
    description: requiredText("Description", 2000),
    serviceProvider: optionalText(200),
    startDate: dateSchema,
    completionDate: dateSchema.optional(),
    cost: nonNegativeDecimal("Cost").optional(),
    currency: optionalText(10),
    notes: optionalText(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.completionDate && value.completionDate < value.startDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["completionDate"],
        message: "Completion date cannot be before the start date.",
      });
    }
  });

/** One approved discard form can cover a whole batch, hence a list of assets. */
export const disposalSchema = z
  .object({
    assetIds: z.array(uuidSchema).min(1, "Select at least one asset to discard."),
    disposalDate: dateSchema,
    method: requiredText("Disposal method", 200),
    reason: requiredText("Disposal reason", 2000),
    disposalValue: nonNegativeDecimal("Disposal value").optional(),
    currency: optionalText(10),
    documentId: uuidSchema,
    notes: optionalText(),
  })
  .strict();

/** Transfers move any combination of company, location and holder at once. */
export const assetTransferSchema = z
  .object({
    assetId: uuidSchema,
    companyId: uuidSchema.optional(),
    locationId: uuidSchema.optional(),
    personId: uuidSchema.optional(),
    returnCurrentAssignment: z.boolean().default(false),
    notes: optionalText(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (!value.companyId && !value.locationId && !value.personId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["companyId"],
        message: "Choose a destination company, location or employee.",
      });
    }
  });

export const clearanceItemStatusSchema = z.enum(["RECEIVED", "MISSING", "DAMAGED"]);

export const clearanceVerifySchema = z
  .object({
    clearanceItemId: uuidSchema,
    status: clearanceItemStatusSchema,
    comments: optionalText(1000),
  })
  .strict()
  .superRefine((value, ctx) => {
    // Missing or damaged assets require comments (Doc 11 Ch7).
    if ((value.status === "MISSING" || value.status === "DAMAGED") && !value.comments) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["comments"],
        message: "Comments are required when an asset is missing or damaged.",
      });
    }
  });

export type AssetCategoryInput = z.infer<typeof assetCategorySchema>;
export type AssetInput = z.infer<typeof assetSchema>;
export type AssetAssignmentInput = z.infer<typeof assetAssignmentSchema>;
export type MaintenanceInput = z.infer<typeof maintenanceSchema>;
export type DisposalInput = z.infer<typeof disposalSchema>;
export type AssetTransferInput = z.infer<typeof assetTransferSchema>;
export type ClearanceVerifyInput = z.infer<typeof clearanceVerifySchema>;
