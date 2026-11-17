import { z } from "zod";
import { uuidSchema, requiredText, optionalText, nullableUuid } from "@/shared/validation/common";

/**
 * Infrastructure register and credential vault validation (SDS Doc 24).
 * Client-safe: no server imports, so dialogs can share the constants.
 */

export const DEVICE_KINDS = ["NETWORK", "SERVER"] as const;
export const DEVICE_STATUSES = ["ACTIVE", "STANDBY", "DECOMMISSIONED"] as const;
export type DeviceKind = (typeof DEVICE_KINDS)[number];
export type DeviceStatus = (typeof DEVICE_STATUSES)[number];

export const KIND_LABELS: Record<DeviceKind, string> = {
  NETWORK: "Network device",
  SERVER: "Server / host",
};

/** Where each register lives, so links and revalidation agree. */
export const KIND_PATHS: Record<DeviceKind, string> = {
  NETWORK: "/infrastructure/network",
  SERVER: "/infrastructure/servers",
};

/** Suggestions for the purpose of a login on a device; free text is allowed. */
export const CREDENTIAL_PURPOSES = ["SSH", "Web UI", "Console", "Enable", "OS admin", "iLO / iDRAC", "Login"] as const;

const IPV4 = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;
const IPV6 = /^[0-9a-f:]+(%\w+)?$/i;

/** IPv4 dotted quad, or a plausible IPv6 address (hex groups and colons). */
export function isIpAddress(value: string): boolean {
  if (IPV4.test(value)) return true;
  if (!value.includes(":") || !IPV6.test(value) || value.includes(":::")) return false;
  const address = value.split("%")[0]!;
  const halves = address.split("::");
  if (halves.length > 2) return false;
  const groups = (part: string) => (part === "" ? [] : part.split(":"));
  const parts = halves.flatMap(groups);
  if (!parts.every((group) => /^[0-9a-f]{1,4}$/i.test(group))) return false;
  // Without "::" all eight groups are written out; with it, fewer stand in.
  return halves.length === 2 ? parts.length <= 7 : parts.length === 8;
}

/** An optional IP address that clears the column when emptied. */
export const nullableIp = () =>
  z
    .string()
    .nullish()
    .transform((value) => {
      const trimmed = value?.trim();
      return trimmed ? trimmed : null;
    })
    .refine((value) => value === null || isIpAddress(value), { message: "Enter a valid IP address, e.g. 10.100.200.10." });

export const deviceSchema = z
  .object({
    companyId: uuidSchema,
    typeId: uuidSchema,
    name: requiredText("Name"),
    hostname: optionalText(255),
    ipAddress: nullableIp(),
    locationId: nullableUuid(),
    manufacturerId: nullableUuid(),
    model: optionalText(200),
    serialNumber: optionalText(200),
    operatingSystem: optionalText(200),
    version: optionalText(100),
    domain: optionalText(255),
    purpose: optionalText(500),
    status: z.enum(DEVICE_STATUSES).default("ACTIVE"),
    hostDeviceId: nullableUuid(),
    notes: optionalText(),
    /** Applications that run on a server. Ignored for network devices. */
    applicationIds: z.array(uuidSchema).max(200).default([]),
  })
  .strict();

export const deviceTypeSchema = z
  .object({
    name: requiredText("Name", 100),
    kind: z.enum(DEVICE_KINDS),
  })
  .strict();

export const credentialSetSchema = z
  .object({
    /** Null shares the set with every company. */
    companyId: nullableUuid(),
    name: requiredText("Name"),
    username: optionalText(255),
    /**
     * New password. On edit, empty or absent keeps the stored one: a password
     * is never sent to the browser, so the form cannot round-trip it.
     */
    password: z.string().max(1000, "Password is too long.").optional(),
    notes: optionalText(),
  })
  .strict();

export const credentialLinkSchema = z
  .object({
    deviceId: uuidSchema,
    credentialSetId: uuidSchema,
    purpose: optionalText(100),
  })
  .strict();

/** A cable between two devices. Both ends may be one device, which records a loop. */
export const linkSchema = z
  .object({
    deviceAId: uuidSchema,
    portA: optionalText(100),
    deviceBId: uuidSchema,
    portB: optionalText(100),
    notes: optionalText(),
  })
  .strict();

export type DeviceInput = z.infer<typeof deviceSchema>;
export type DeviceTypeInput = z.infer<typeof deviceTypeSchema>;
export type CredentialSetInput = z.infer<typeof credentialSetSchema>;
export type CredentialLinkInput = z.infer<typeof credentialLinkSchema>;
export type LinkInput = z.infer<typeof linkSchema>;
