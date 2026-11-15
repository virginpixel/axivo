import { z } from "zod";
import { uuidSchema, requiredText, optionalText, emailSchema, nullableEmail, nullableUuid } from "@/shared/validation/common";

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
    /**
     * A contractor or tenant rather than an employee. They hold equipment and
     * sign for it like anybody else, so they are people - but their employer is
     * no company of ours, and we never see their hiring or leaving. companyId
     * stays the property they work at, which is what company scoping runs on.
     */
    isThirdParty: z.boolean().default(false),
    externalCompanyName: optionalText(200),
    departmentId: nullableUuid(),
    positionId: nullableUuid(),
    locationId: nullableUuid(),
    /**
     * Optional at this layer only so a third party can be saved without one:
     * they have no employee number to enter, and the service issues a reference
     * instead. Required for an employee, enforced below.
     */
    employeeId: optionalText(50),
    firstName: requiredText("First name", 100),
    lastName: requiredText("Last name", 100),
    email: emailSchema,
    personalEmail: nullableEmail(),
    phone: optionalText(50),
    extension: optionalText(20),
    employmentStatus: employmentStatusSchema.default("ACTIVE"),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.isThirdParty) {
      // Without the employer there is nothing to tell two tenant contacts of the
      // same name apart, and a handover would name no business.
      if (!value.externalCompanyName) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["externalCompanyName"],
          message: "Company is required for a third-party contact.",
        });
      }
      return;
    }
    if (!value.employeeId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["employeeId"],
        message: "Employee ID is required.",
      });
    }
  });

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
