import { z } from "zod";
import { uuidSchema, requiredText, optionalText, nullableUuid } from "@/shared/validation/common";

/** OPEX and CAPEX budget validation (SDS Doc 25). Client-safe. */

export const BUDGET_KINDS = ["OPEX", "CAPEX"] as const;
export type BudgetKind = (typeof BUDGET_KINDS)[number];

const amount = (label: string) =>
  z.coerce
    .number({ invalid_type_error: `${label} must be a number.` })
    .min(0, `${label} cannot be negative.`)
    .max(999_999_999_999, `${label} is too large.`)
    .transform((n) => Math.round(n * 100) / 100);

const optionalAmount = (label: string) =>
  z.preprocess((v) => (v === "" || v === null || v === undefined ? null : v), amount(label).nullable());

export const budgetCreateSchema = z
  .object({
    kind: z.enum(BUDGET_KINDS),
    year: z.coerce.number().int().min(2000, "Enter a year from 2000.").max(2100, "Enter a year up to 2100."),
    /** Copy the lines (and their splits) of an earlier budget of the same kind. */
    copyFromId: nullableUuid(),
    notes: optionalText(),
  })
  .strict();

export const allocationSchema = z.object({
  companyId: uuidSchema,
  percent: z.coerce.number().gt(0, "A share must be more than 0%.").max(100, "A share cannot be more than 100%."),
});

export const lineSchema = z
  .object({
    reference: optionalText(50),
    department: optionalText(100),
    description: requiredText("Description", 300),
    vendorId: nullableUuid(),
    category: optionalText(100),
    /** OPEX: the year's amount. Ignored for CAPEX, which is worked out. */
    amount: optionalAmount("Amount"),
    /** OPEX: EVEN spreads the amount over the year; MONTHLY takes the twelve months. */
    phasing: z.enum(["EVEN", "MONTHLY"]).default("EVEN"),
    months: z.array(amount("A month")).length(12).nullish(),
    quantity: z.preprocess((v) => (v === "" || v === null || v === undefined ? null : v), z.coerce.number().int().min(0).max(1_000_000).nullable()),
    unitPrice: optionalAmount("Unit price"),
    associatedCost: optionalAmount("Associated cost"),
    priority: z.enum(["FIRST", "MEDIUM", "WISH_LIST"]).nullish().transform((v) => v ?? null),
    capexType: z.enum(["REVENUE_GENERATING", "COST_SAVING", "REGULAR_REPLACEMENT", "NEW_OPERATION", "OTHER"]).nullish().transform((v) => v ?? null),
    period: z.enum(["Q1", "Q2", "Q3", "Q4"]).nullish().transform((v) => v ?? null),
    locationCode: optionalText(100),
    justification: optionalText(2000),
    notes: optionalText(),
    allocations: z.array(allocationSchema).min(1, "Give at least one company a share.").max(50),
  })
  .strict();

export const reasonSchema = z.object({ reason: requiredText("Reason", 1000) }).strict();

export const budgetImportOptionsSchema = z
  .object({
    /** Who pays for the imported lines; edited per line afterwards. */
    allocations: z.array(allocationSchema).min(1),
    /** CAPEX workbooks hold several lists; which one to read. */
    sheet: optionalText(200),
  })
  .strict();

export type BudgetCreateInput = z.infer<typeof budgetCreateSchema>;
export type LineInput = z.infer<typeof lineSchema>;
export type AllocationInput = z.infer<typeof allocationSchema>;
