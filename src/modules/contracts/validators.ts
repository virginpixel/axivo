import { z } from "zod";
import { uuidSchema, requiredText, optionalText, dateSchema, nonNegativeDecimal } from "@/shared/validation/common";

/** Contracts module validation (SDS Doc 23). */

export const CONTRACT_CATEGORIES = [
  "Software",
  "Hardware Support",
  "Cloud Services",
  "Internet",
  "Telecom",
  "Maintenance",
  "Warranty",
  "Other",
] as const;

export const contractSchema = z
  .object({
    companyId: uuidSchema,
    contractNumber: requiredText("Contract number", 100),
    name: requiredText("Contract name"),
    vendor: requiredText("Vendor", 200),
    category: z.enum(CONTRACT_CATEGORIES),
    startDate: dateSchema.optional(),
    endDate: dateSchema.optional(),
    renewalDate: dateSchema.optional(),
    renewalType: z.enum(["MANUAL", "MONTHLY", "QUARTERLY", "ANNUAL", "CUSTOM"]).default("MANUAL"),
    cost: nonNegativeDecimal("Cost").optional(),
    currency: optionalText(10),
    ownerPersonId: uuidSchema.optional().or(z.literal("").transform(() => undefined)),
    reminderDays: z.array(z.number().int().positive()).max(10).optional(),
    notes: optionalText(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.startDate && value.endDate && value.endDate <= value.startDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["endDate"],
        message: "End date must be after the start date.",
      });
    }
  });

export const contractRenewalSchema = z
  .object({
    contractId: uuidSchema,
    renewalDate: dateSchema,
    newStartDate: dateSchema.optional(),
    newEndDate: dateSchema.optional(),
    cost: nonNegativeDecimal("Cost").optional(),
    currency: optionalText(10),
    notes: optionalText(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.newStartDate && value.newEndDate && value.newEndDate <= value.newStartDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["newEndDate"],
        message: "New end date must be after the new start date.",
      });
    }
  });

export const contractLinkSchema = z
  .object({
    contractId: uuidSchema,
    entityType: z.enum(["application", "license", "asset"]),
    entityId: uuidSchema,
  })
  .strict();

export type ContractInput = z.infer<typeof contractSchema>;
export type ContractRenewalInput = z.infer<typeof contractRenewalSchema>;
export type ContractLinkInput = z.infer<typeof contractLinkSchema>;
