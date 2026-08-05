import { z } from "zod";
import { emailSchema } from "@/shared/validation/common";

/** Enable Cloudflare Tunnel remote access. */
export const tunnelEnableSchema = z
  .object({
    domain: z
      .string()
      .trim()
      .regex(/^[a-zA-Z0-9.-]{1,253}$/, "Enter a valid hostname, e.g. axivo.yourcompany.com."),
    tunnelToken: z.string().trim().min(10, "Paste the tunnel connector token from Cloudflare."),
    apiToken: z
      .string()
      .trim()
      .min(10, "Paste a Cloudflare API token with DNS edit permission."),
    email: emailSchema,
  })
  .strict();

export type TunnelEnableInput = z.infer<typeof tunnelEnableSchema>;
