import { z } from "zod";
import { uuidSchema, requiredText, optionalText } from "@/shared/validation/common";

/** Applications module validation (SDS Doc 08 Ch10). */

export const applicationSchema = z
  .object({
    companyId: uuidSchema,
    name: requiredText("Application name"),
    description: optionalText(),
    allowMultipleAssignments: z.boolean().default(false),
    requiresLicense: z.boolean().default(false),
    isShared: z.boolean().default(false),
    /** Approval chain for items requesting this app; falls back to the form's. */
    workflowId: uuidSchema.optional().or(z.literal("").transform(() => undefined)),
  })
  .strict();

export const applicationRoleSchema = z
  .object({
    applicationId: uuidSchema,
    name: requiredText("Role name", 100),
    description: optionalText(),
  })
  .strict();

export const credentialFieldTypeSchema = z.enum([
  "TEXT",
  "URL",
  "NUMBER",
  "EMAIL",
  "COMPANY_CODE",
  "TENANT_ID",
  "API_ENDPOINT",
  "NOTES",
]);

export const credentialFieldSchema = z
  .object({
    applicationId: uuidSchema,
    fieldName: requiredText("Field name", 100),
    fieldType: credentialFieldTypeSchema,
    isRequired: z.boolean().default(false),
    displayOrder: z.coerce.number().int().min(0).default(0),
    helpText: optionalText(500),
  })
  .strict();

export const assignmentSchema = z
  .object({
    personId: uuidSchema,
    applicationId: uuidSchema,
    applicationRoleId: uuidSchema.optional().or(z.literal("").transform(() => undefined)),
    username: optionalText(200),
    notes: optionalText(),
  })
  .strict();

export const assignmentStatusSchema = z.enum(["PENDING", "ACTIVE", "SUSPENDED", "REMOVED"]);

export const updateAssignmentSchema = z
  .object({
    username: optionalText(200),
    applicationRoleId: uuidSchema.optional().or(z.literal("").transform(() => undefined)),
    notes: optionalText(),
  })
  .strict();

export const removeAssignmentSchema = z
  .object({
    assignmentId: uuidSchema,
    reason: requiredText("Removal reason", 500),
  })
  .strict();

export type ApplicationInput = z.infer<typeof applicationSchema>;
export type ApplicationRoleInput = z.infer<typeof applicationRoleSchema>;
export type CredentialFieldInput = z.infer<typeof credentialFieldSchema>;
export type AssignmentInput = z.infer<typeof assignmentSchema>;
export type UpdateAssignmentInput = z.infer<typeof updateAssignmentSchema>;
