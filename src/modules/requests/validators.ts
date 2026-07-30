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
    /** Answers to the request fields defined on the chosen application or category. */
    fieldValues: z.record(z.unknown()).default({}),
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
    // A role change edits access the person already holds, so it names the
    // application whose role or fields are changing rather than free text.
    if (item.itemType === "ROLE_CHANGE" && !item.applicationId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["applicationId"],
        message: "Select the access to change.",
      });
    }
    if (item.itemType === "GENERAL" && !item.description) {
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
    /** Company of the requester; forms may be shared across companies. */
    requesterCompanyId: uuidSchema,
    requesterDepartmentId: uuidSchema,
    /** Free text: a requester may need a position that does not exist yet. */
    requesterPositionTitle: requiredText("Your position", 150),
    requestedForName: requiredText("Requested for name", 200),
    requestedForEmail: emailSchema,
    requestedForEmployeeId: requiredText("Requested for employee ID", 50),
    /** Company of the requested-for employee; forms may be shared across companies. */
    requestedForCompanyId: uuidSchema,
    requestedForDepartmentId: uuidSchema,
    requestedForPositionTitle: requiredText("Requested for position", 150),
    items: z.array(requestItemInputSchema).min(1, "Select at least one item.").max(20),
    fieldValues: z.record(z.unknown()).default({}),
    /** Honeypot field - must remain empty (Doc 05 Ch7 bot protection). */
    website: z.string().max(0, "Invalid submission.").optional().or(z.literal("")),
  })
  .strict();

export const correctionSubmissionSchema = z
  .object({
    /** Answers to the form's own questions. */
    fieldValues: z.record(z.unknown()).default({}),
    /**
     * Answers to the request fields of the thing being asked for (which
     * outlets, which cost centre). An approver who sends an item back is
     * usually objecting to exactly these, so they have to be correctable.
     */
    itemFieldValues: z.record(z.unknown()).default({}),
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
