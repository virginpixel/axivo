import { z } from "zod";
import { uuidSchema, requiredText, optionalText } from "@/shared/validation/common";

/** Workflow module validation (SDS Doc 13 Ch10). */

export const workflowStepSchema = z
  .object({
    stepName: requiredText("Step name", 100),
    stepType: z.enum(["APPROVAL", "IT_APPROVAL", "IT_IMPLEMENTATION"]),
    approvalRoleId: uuidSchema,
    approvalRule: z.enum(["ANY", "ALL"]).default("ANY"),
    allowDelegation: z.boolean().default(true),
    commentsRequired: z.boolean().default(false),
  })
  .strict();

export const workflowSchema = z
  .object({
    companyId: uuidSchema,
    name: requiredText("Workflow name"),
    description: optionalText(),
    isDefault: z.boolean().default(false),
    steps: z
      .array(workflowStepSchema)
      .min(1, "A workflow requires at least one step.")
      .max(20, "A workflow may have at most 20 steps."),
  })
  .strict()
  .superRefine((value, ctx) => {
    // The final step must be IT Implementation; implementation begins only
    // after the final approval (Doc 09 Ch5/8, Doc 01 Ch12).
    const last = value.steps[value.steps.length - 1];
    if (last && last.stepType !== "IT_IMPLEMENTATION") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["steps"],
        message: "The final workflow step must be an IT Implementation step.",
      });
    }
    const implementationSteps = value.steps.filter((s) => s.stepType === "IT_IMPLEMENTATION");
    if (implementationSteps.length > 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["steps"],
        message: "A workflow may contain only one IT Implementation step.",
      });
    }
    if (value.steps.findIndex((s) => s.stepType === "IT_IMPLEMENTATION") !== value.steps.length - 1 && implementationSteps.length === 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["steps"],
        message: "The IT Implementation step must be the last step.",
      });
    }
  });

export const approvalActionSchema = z
  .object({
    action: z.enum(["APPROVED", "REJECTED", "CORRECTION_REQUESTED"]),
    comments: optionalText(4000),
    /** Item ids selected for correction (Doc 09 Ch6). */
    correctionItemIds: z.array(uuidSchema).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    // Comments are mandatory for rejection and correction requests (Doc 09 Ch6).
    if ((value.action === "REJECTED" || value.action === "CORRECTION_REQUESTED") && !value.comments) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["comments"],
        message: "Comments are required when rejecting or requesting a correction.",
      });
    }
  });

export const delegationSchema = z
  .object({
    companyId: uuidSchema,
    fromPersonId: uuidSchema,
    toPersonId: uuidSchema,
    startDate: z.coerce.date(),
    endDate: z.coerce.date(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.endDate <= value.startDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["endDate"],
        message: "The delegation end date must be after the start date.",
      });
    }
    if (value.fromPersonId === value.toPersonId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["toPersonId"],
        message: "A person cannot delegate to themselves.",
      });
    }
  });

export type WorkflowInput = z.infer<typeof workflowSchema>;
export type WorkflowStepInput = z.infer<typeof workflowStepSchema>;
export type ApprovalActionInput = z.infer<typeof approvalActionSchema>;
export type DelegationInput = z.infer<typeof delegationSchema>;
