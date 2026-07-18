import { z } from "zod";
import { uuidSchema, requiredText, optionalText } from "@/shared/validation/common";

/** Forms & Form Builder validation (SDS Doc 22). */

export const FORM_FIELD_TYPES = [
  "TEXT",
  "PARAGRAPH",
  "NUMBER",
  "EMAIL",
  "PHONE",
  "DATE",
  "TIME",
  "DATETIME",
  "DROPDOWN",
  "MULTI_SELECT",
  "RADIO",
  "CHECKBOX",
  "YES_NO",
  "FILE_UPLOAD",
] as const;

export const CONDITION_OPERATORS = ["EQUALS", "NOT_EQUALS", "CONTAINS", "GREATER_THAN", "LESS_THAN"] as const;

export const visibilityRuleSchema = z
  .object({
    logic: z.enum(["AND", "OR"]),
    conditions: z
      .array(
        z
          .object({
            fieldKey: z.string().min(1).max(100),
            operator: z.enum(CONDITION_OPERATORS),
            value: z.string().max(500),
          })
          .strict(),
      )
      .min(1)
      .max(10),
  })
  .strict();

export const fieldValidationSchema = z
  .object({
    minLength: z.number().int().min(0).optional(),
    maxLength: z.number().int().min(1).optional(),
    minValue: z.number().optional(),
    maxValue: z.number().optional(),
    pattern: z.string().max(500).optional(),
    allowedFileTypes: z.array(z.string().max(10)).max(20).optional(),
    maxFileSizeMb: z.number().int().min(1).max(100).optional(),
  })
  .strict();

export const formFieldSchema = z
  .object({
    fieldKey: z
      .string()
      .trim()
      .min(1, "Field key is required.")
      .max(100)
      .regex(/^[a-z0-9_]+$/, "Field keys may contain only lowercase letters, numbers and underscores."),
    label: requiredText("Label", 200),
    fieldType: z.enum(FORM_FIELD_TYPES),
    placeholder: optionalText(200),
    helpText: optionalText(500),
    isRequired: z.boolean().default(false),
    defaultValue: optionalText(500),
    options: z.array(z.string().trim().min(1).max(200)).max(100).optional(),
    validation: fieldValidationSchema.optional(),
    visibilityRules: visibilityRuleSchema.optional(),
  })
  .strict()
  .superRefine((field, ctx) => {
    const needsOptions = ["DROPDOWN", "MULTI_SELECT", "RADIO", "CHECKBOX"].includes(field.fieldType);
    if (needsOptions && (!field.options || field.options.length === 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["options"],
        message: "This field type requires at least one option.",
      });
    }
  });

export const formSchema = z
  .object({
    companyId: uuidSchema,
    requestTypeId: uuidSchema,
    workflowId: uuidSchema,
    name: requiredText("Form name"),
    description: optionalText(),
    confirmationMessage: optionalText(2000),
    fields: z.array(formFieldSchema).max(200),
  })
  .strict()
  .superRefine((form, ctx) => {
    const keys = new Set<string>();
    form.fields.forEach((field, index) => {
      if (keys.has(field.fieldKey)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["fields", index, "fieldKey"],
          message: `Duplicate field key "${field.fieldKey}".`,
        });
      }
      keys.add(field.fieldKey);
    });
    // Visibility rules may only reference existing fields.
    form.fields.forEach((field, index) => {
      field.visibilityRules?.conditions.forEach((condition, conditionIndex) => {
        if (!keys.has(condition.fieldKey)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["fields", index, "visibilityRules", "conditions", conditionIndex, "fieldKey"],
            message: `Visibility rule references unknown field "${condition.fieldKey}".`,
          });
        }
      });
    });
  });

export const requestTypeSchema = z
  .object({
    companyId: uuidSchema,
    name: requiredText("Request type name"),
    kind: z.enum(["APPLICATION_ACCESS", "ASSET_REQUEST", "ASSET_HANDOVER", "ROLE_CHANGE", "CLEARANCE", "GENERAL"]),
    description: optionalText(),
  })
  .strict();

export type FormInput = z.infer<typeof formSchema>;
export type FormFieldInput = z.infer<typeof formFieldSchema>;
export type VisibilityRule = z.infer<typeof visibilityRuleSchema>;
export type FieldValidation = z.infer<typeof fieldValidationSchema>;
export type RequestTypeInput = z.infer<typeof requestTypeSchema>;
