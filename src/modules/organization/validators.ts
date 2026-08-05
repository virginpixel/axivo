import { z } from "zod";
import { uuidSchema, requiredText, optionalText } from "@/shared/validation/common";

/** Organization module validation (SDS Doc 06 Ch12). Strict schemas reject unexpected fields. */

export const companySchema = z
  .object({
    name: requiredText("Company name"),
    description: optionalText(),
    timezone: requiredText("Timezone", 60).default("UTC"),
    currency: requiredText("Currency", 10).default("USD"),
  })
  .strict();

export const departmentSchema = z
  .object({
    companyId: uuidSchema,
    name: requiredText("Department name"),
    description: optionalText(),
    /// Department Heads assigned inline (one or many people of the company).
    headPersonIds: z.array(uuidSchema).max(20).default([]),
  })
  .strict();

export const locationSchema = z
  .object({
    companyId: uuidSchema,
    name: requiredText("Location name"),
    code: optionalText(20),
    description: optionalText(),
  })
  .strict();

export const positionSchema = z
  .object({
    companyId: uuidSchema,
    name: requiredText("Position name"),
    code: optionalText(20),
    description: optionalText(),
  })
  .strict();

export const approvalRoleSchema = z
  .object({
    name: requiredText("Role name", 100),
    description: optionalText(),
  })
  .strict();

export const approvalRoleAssignmentSchema = z
  .object({
    companyId: uuidSchema,
    approvalRoleId: uuidSchema,
    personId: uuidSchema,
  })
  .strict();

/** Assign several people to a role at once (a company may need two IT staff). */
export const approvalRoleAssignmentBulkSchema = z
  .object({
    companyId: uuidSchema,
    approvalRoleId: uuidSchema,
    personIds: z.array(uuidSchema).min(1, "Select at least one person."),
  })
  .strict();

export const departmentHeadSchema = z
  .object({
    departmentId: uuidSchema,
    personId: uuidSchema,
  })
  .strict();

export type CompanyInput = z.infer<typeof companySchema>;
export type DepartmentInput = z.infer<typeof departmentSchema>;
export type LocationInput = z.infer<typeof locationSchema>;
export type PositionInput = z.infer<typeof positionSchema>;
export type ApprovalRoleInput = z.infer<typeof approvalRoleSchema>;
export type ApprovalRoleAssignmentInput = z.infer<typeof approvalRoleAssignmentSchema>;
export type ApprovalRoleAssignmentBulkInput = z.infer<typeof approvalRoleAssignmentBulkSchema>;
export type DepartmentHeadInput = z.infer<typeof departmentHeadSchema>;
