import { z } from "zod";
import { uuidSchema, requiredText, optionalText } from "@/shared/validation/common";

/** Organization module validation (SDS Doc 06 Ch12). Strict schemas reject unexpected fields. */

export const companySchema = z
  .object({
    name: requiredText("Company name"),
    code: requiredText("Company code", 20).regex(
      /^[A-Za-z0-9_-]+$/,
      "Company code may contain only letters, numbers, hyphens and underscores.",
    ),
    description: optionalText(),
    timezone: requiredText("Timezone", 60).default("UTC"),
    currency: requiredText("Currency", 10).default("USD"),
  })
  .strict();

export const departmentSchema = z
  .object({
    companyId: uuidSchema,
    name: requiredText("Department name"),
    code: optionalText(20),
    description: optionalText(),
    defaultLocationId: uuidSchema.optional().or(z.literal("").transform(() => undefined)),
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
export type DepartmentHeadInput = z.infer<typeof departmentHeadSchema>;
