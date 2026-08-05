import { z } from "zod";
import { requiredText, emailSchema } from "@/shared/validation/common";

/** First-run setup: create the organization and the first administrator. */
export const setupSchema = z
  .object({
    organizationName: requiredText("Organization name", 200),
    firstName: requiredText("First name", 100),
    lastName: requiredText("Last name", 100),
    username: requiredText("Username", 50).regex(
      /^[A-Za-z0-9._-]+$/,
      "Username may contain only letters, numbers, dots, hyphens and underscores.",
    ),
    employeeId: requiredText("Employee ID", 50),
    timezone: requiredText("Timezone", 60),
    email: emailSchema,
    // Complexity is checked against the password policy in the service.
    password: z.string().min(1, "Password is required.").max(200),
    confirmPassword: z.string().min(1, "Please confirm the password.").max(200),
  })
  .strict()
  .refine((data) => data.password === data.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match.",
  });

export type SetupInput = z.infer<typeof setupSchema>;
