import { z } from "zod";
import { uuidSchema, requiredText, optionalText } from "@/shared/validation/common";

/**
 * Request fields defined on an application or an asset category (SDS Doc 08/11).
 * These are the questions a requester answers once that target is chosen, so
 * they live with the target rather than being retyped into every form.
 */

/** Types that present a fixed list of choices. */
export const CHOICE_FIELD_TYPES = ["DROPDOWN", "MULTI_SELECT", "RADIO", "CHECKBOX"] as const;

/** Types that accept more than one value, e.g. several outlets or cost centres. */
export const MULTI_VALUE_FIELD_TYPES = ["MULTI_SELECT", "CHECKBOX"] as const;

export const requestFieldTypeSchema = z.enum([
  "TEXT",
  "PARAGRAPH",
  "NUMBER",
  "EMAIL",
  "PHONE",
  "DATE",
  "DROPDOWN",
  "MULTI_SELECT",
  "RADIO",
  "CHECKBOX",
  "YES_NO",
]);

export const requestFieldSchema = z
  .object({
    applicationId: uuidSchema.optional(),
    assetCategoryId: uuidSchema.optional(),
    label: requiredText("Field label", 200),
    fieldType: requestFieldTypeSchema,
    placeholder: optionalText(200),
    helpText: optionalText(500),
    isRequired: z.boolean().default(false),
    options: z.array(z.string().trim().min(1).max(200)).max(200).default([]),
    displayOrder: z.number().int().min(0).max(999).default(0),
  })
  .strict()
  .superRefine((value, ctx) => {
    const owners = [value.applicationId, value.assetCategoryId].filter(Boolean);
    if (owners.length !== 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["applicationId"],
        message: "A request field belongs to exactly one application or asset category.",
      });
    }
    const needsOptions = (CHOICE_FIELD_TYPES as readonly string[]).includes(value.fieldType);
    if (needsOptions && value.options.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["options"],
        message: "Add at least one option for a choice field.",
      });
    }
    const unique = new Set(value.options.map((option) => option.toLowerCase()));
    if (unique.size !== value.options.length) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["options"], message: "Options must be unique." });
    }
  });

export type RequestFieldInput = z.infer<typeof requestFieldSchema>;
export type RequestFieldType = z.infer<typeof requestFieldTypeSchema>;

/** Whether a field type stores a list of values rather than a single one. */
export function isMultiValueType(fieldType: string): boolean {
  return (MULTI_VALUE_FIELD_TYPES as readonly string[]).includes(fieldType);
}

/** Whether a field type needs an option list. */
export function isChoiceType(fieldType: string): boolean {
  return (CHOICE_FIELD_TYPES as readonly string[]).includes(fieldType);
}
