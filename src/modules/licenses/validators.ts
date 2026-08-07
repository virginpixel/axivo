import { z } from "zod";
import { uuidSchema, requiredText, optionalText, dateSchema, positiveInt, nonNegativeDecimal } from "@/shared/validation/common";

/** Licenses module validation (SDS Doc 10 Ch10). */

export const licenseSchema = z
  .object({
    companyId: uuidSchema,
    /// Optional: standalone licenses (Adobe, VPN, ...) need no application.
    applicationId: uuidSchema.optional().or(z.literal("").transform(() => undefined)),
    name: requiredText("License name"),
    licenseType: z.enum(["SUBSCRIPTION", "PERPETUAL"]),
    /** Shareable across companies (seats assignable to any company's people). */
    isShared: z.boolean().default(false),
    licenseKey: optionalText(500),
    contractId: uuidSchema.optional().or(z.literal("").transform(() => undefined)),
    notes: optionalText(),
  })
  .strict();

export const licensePurchaseSchema = z
  .object({
    licenseId: uuidSchema,
    purchaseType: z.enum(["NEW_PURCHASE", "RENEWAL", "ADDITIONAL_SEATS"]),
    quantity: positiveInt("Quantity"),
    purchaseDate: dateSchema,
    startDate: dateSchema.optional(),
    expiryDate: dateSchema.optional(),
    price: nonNegativeDecimal("Price").optional(),
    currency: optionalText(10),
    supplier: optionalText(200),
    purchaseReference: optionalText(100),
    notes: optionalText(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.startDate && value.expiryDate && value.expiryDate <= value.startDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["expiryDate"],
        message: "Expiry date must be after the start date.",
      });
    }
  });

export const licenseAssignmentSchema = z
  .object({
    licenseId: uuidSchema,
    personId: uuidSchema,
    notes: optionalText(),
  })
  .strict();

export type LicenseInput = z.infer<typeof licenseSchema>;
export type LicensePurchaseInput = z.infer<typeof licensePurchaseSchema>;
export type LicenseAssignmentInput = z.infer<typeof licenseAssignmentSchema>;
