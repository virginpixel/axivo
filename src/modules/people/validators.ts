import { z } from "zod";
import { uuidSchema, requiredText, optionalText, emailSchema } from "@/shared/validation/common";

/** People module validation (SDS Doc 07 Ch12). */

export const employmentStatusSchema = z.enum([
  "ACTIVE",
  "ON_LEAVE",
  "SUSPENDED",
  "RESIGNED",
  "TERMINATED",
]);

export const personSchema = z
  .object({
    companyId: uuidSchema,
    departmentId: uuidSchema.optional().or(z.literal("").transform(() => undefined)),
    positionId: uuidSchema.optional().or(z.literal("").transform(() => undefined)),
    locationId: uuidSchema.optional().or(z.literal("").transform(() => undefined)),
    employeeId: requiredText("Employee ID", 50),
    firstName: requiredText("First name", 100),
    lastName: requiredText("Last name", 100),
    email: emailSchema,
    personalEmail: emailSchema.optional().or(z.literal("").transform(() => undefined)),
    phone: optionalText(50),
    extension: optionalText(20),
    employmentStatus: employmentStatusSchema.default("ACTIVE"),
  })
  .strict();

export const systemUserSchema = z
  .object({
    personId: uuidSchema,
    username: requiredText("Username", 50).regex(
      /^[a-zA-Z0-9._-]+$/,
      "Username may contain only letters, numbers, dots, hyphens and underscores.",
    ),
    systemRoleId: uuidSchema,
    password: z.string().min(1, "Password is required."),
  })
  .strict();

export const changeRoleSchema = z
  .object({
    systemUserId: uuidSchema,
    systemRoleId: uuidSchema,
  })
  .strict();

export const resetPasswordSchema = z
  .object({
    systemUserId: uuidSchema,
    newPassword: z.string().min(1, "Password is required."),
  })
  .strict();

export const transferCompanySchema = z
  .object({
    personId: uuidSchema,
    newCompanyId: uuidSchema,
    newDepartmentId: uuidSchema.optional().or(z.literal("").transform(() => undefined)),
    newPositionId: uuidSchema.optional().or(z.literal("").transform(() => undefined)),
    newLocationId: uuidSchema.optional().or(z.literal("").transform(() => undefined)),
  })
  .strict();

export type PersonInput = z.infer<typeof personSchema>;
export type SystemUserInput = z.infer<typeof systemUserSchema>;
export type TransferCompanyInput = z.infer<typeof transferCompanySchema>;
