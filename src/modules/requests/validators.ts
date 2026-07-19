import { z } from "zod";
import { uuidSchema, requiredText, optionalText, emailSchema } from "@/shared/validation/common";

/** Requests module validation (SDS Doc 09 Ch11). */

export const requestItemInputSchema = z
  .object({
    itemType: z.enum(["APPLICATION", "ASSET", "ROLE_CHANGE", "GENERAL"]),
    applicationId: uuidSchema.optional(),
    applicationRoleId: uuidSchema.optional(),
    assetCategoryId: uuidSchema.optional(),
    description: optionalText(1000),
  })
  .strict()
  .superRefine((item, ctx) => {
    if (item.itemType === "APPLICATION" && !item.applicationId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["applicationId"],
        message: "Select an application.",
      });
    }
    if (item.itemType === "ASSET" && !item.assetCategoryId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["assetCategoryId"],
        message: "Select an asset category.",
      });
    }
    if ((item.itemType === "ROLE_CHANGE" || item.itemType === "GENERAL") && !item.description) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["description"],
        message: "Please describe the request.",
      });
    }
  });

export const publicSubmissionSchema = z
  .object({
    slug: z.string().trim().min(1).max(120),
    requesterName: requiredText("Your name", 200),
    requesterEmail: emailSchema,
    requesterEmployeeId: requiredText("Your employee ID", 50),
    requesterDepartmentId: uuidSchema,
    requesterPositionId: uuidSchema,
    requestedForName: requiredText("Requested for name", 200),
    requestedForEmail: emailSchema,
    requestedForEmployeeId: requiredText("Requested for employee ID", 50),
    requestedForDepartmentId: uuidSchema,
    requestedForPositionId: uuidSchema,
    items: z.array(requestItemInputSchema).min(1, "Select at least one item.").max(20),
    fieldValues: z.record(z.unknown()).default({}),
    /** Honeypot field - must remain empty (Doc 05 Ch7 bot protection). */
    website: z.string().max(0, "Invalid submission.").optional().or(z.literal("")),
  })
  .strict();

export const correctionSubmissionSchema = z
  .object({
    fieldValues: z.record(z.unknown()).default({}),
    itemDescription: optionalText(1000),
    comments: optionalText(2000),
  })
  .strict();

export const implementationSchema = z
  .object({
    requestItemId: uuidSchema,
    /** Application implementation */
    username: optionalText(200),
    temporaryPassword: z.string().max(200).optional(),
    credentialFields: z
      .array(z.object({ fieldName: z.string().min(1).max(100), fieldValue: z.string().max(1000) }).strict())
      .max(30)
      .default([]),
    licenseId: uuidSchema.optional().or(z.literal("").transform(() => undefined)),
    /** Asset implementation */
    assetIds: z.array(uuidSchema).max(20).default([]),
    notes: optionalText(2000),
  })
  .strict();

export type PublicSubmissionInput = z.infer<typeof publicSubmissionSchema>;
export type CorrectionSubmissionInput = z.infer<typeof correctionSubmissionSchema>;
export type ImplementationInput = z.infer<typeof implementationSchema>;
