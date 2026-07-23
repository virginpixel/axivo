/** Custom field format metadata and validation (shared client + server). */

export type CustomFieldFormat =
  | "TEXT"
  | "NUMBER"
  | "MAC_ADDRESS"
  | "IP_ADDRESS"
  | "IMEI"
  | "PHONE"
  | "EMAIL"
  | "URL"
  | "DATE";

export const CUSTOM_FIELD_FORMAT_LABELS: Record<CustomFieldFormat, string> = {
  TEXT: "Text",
  NUMBER: "Number",
  MAC_ADDRESS: "MAC address",
  IP_ADDRESS: "IP address",
  IMEI: "IMEI",
  PHONE: "Phone",
  EMAIL: "Email",
  URL: "URL",
  DATE: "Date",
};

const PATTERNS: Partial<Record<CustomFieldFormat, RegExp>> = {
  MAC_ADDRESS: /^([0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}$/,
  IP_ADDRESS:
    /^(\d{1,3}\.){3}\d{1,3}$|^([0-9A-Fa-f]{1,4}:){2,7}[0-9A-Fa-f]{0,4}$/,
  IMEI: /^\d{15}$/,
  EMAIL: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  URL: /^https?:\/\/.+/i,
  NUMBER: /^-?\d+(\.\d+)?$/,
  DATE: /^\d{4}-\d{2}-\d{2}$/,
};

export const CUSTOM_FIELD_PLACEHOLDERS: Partial<Record<CustomFieldFormat, string>> = {
  MAC_ADDRESS: "AA:BB:CC:DD:EE:FF",
  IP_ADDRESS: "192.168.1.10",
  IMEI: "356938035643809",
  PHONE: "+1 555 0100",
  EMAIL: "name@example.com",
  URL: "https://…",
  DATE: "YYYY-MM-DD",
};

/** Returns an error message when `value` does not match `format`, else null. */
export function validateCustomFieldValue(format: CustomFieldFormat, value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null; // emptiness is enforced separately via `required`
  const pattern = PATTERNS[format];
  if (pattern && !pattern.test(trimmed)) {
    return `Enter a valid ${CUSTOM_FIELD_FORMAT_LABELS[format].toLowerCase()}.`;
  }
  return null;
}
