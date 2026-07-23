import type { FormFieldType, Prisma } from "@prisma/client";
import { isFieldVisible, type FieldValueMap } from "./visibility";
import type { FieldValidation, VisibilityRule } from "./validators";

/**
 * The shape this validator needs. Kept structural rather than tied to the
 * FormField row so the same rules cover request fields defined on an
 * application or an asset category (SDS Doc 22, Doc 08).
 */
export interface ValidatableField {
  fieldKey: string;
  label: string;
  fieldType: FormFieldType;
  isRequired: boolean;
  options: Prisma.JsonValue | null;
  validation: Prisma.JsonValue | null;
  /** Optional: request fields have no conditional visibility of their own. */
  visibilityRules?: Prisma.JsonValue | null;
}

/**
 * Server-side validation of a public form submission against the published
 * form version (SDS Doc 22): required fields, email format, number ranges,
 * dates, option membership, file size/type. Hidden fields (per visibility
 * rules) are excluded from validation and from the stored data.
 */

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_PATTERN = /^[+0-9()\-. ]{4,30}$/;

export interface SubmittedFile {
  fileName: string;
  size: number;
}

export interface SubmissionValidationResult {
  /** Cleaned values for visible fields only. */
  values: Record<string, string | string[] | boolean | number | null>;
  fieldErrors: Record<string, string>;
}

export function validateSubmissionValues(
  fields: ValidatableField[],
  rawValues: FieldValueMap,
  files: Record<string, SubmittedFile | undefined>,
): SubmissionValidationResult {
  const fieldErrors: Record<string, string> = {};
  const values: SubmissionValidationResult["values"] = {};

  for (const field of fields) {
    const rules = (field.visibilityRules as VisibilityRule | null | undefined) ?? null;
    if (!isFieldVisible(rules, rawValues)) continue;

    const validation = (field.validation as FieldValidation | null) ?? {};
    const raw = rawValues[field.fieldKey];

    if (field.fieldType === "FILE_UPLOAD") {
      const file = files[field.fieldKey];
      if (field.isRequired && !file) {
        fieldErrors[field.fieldKey] = `${field.label} is required.`;
        continue;
      }
      if (file) {
        const extension = file.fileName.split(".").pop()?.toLowerCase() ?? "";
        if (validation.allowedFileTypes && validation.allowedFileTypes.length > 0) {
          const allowed = validation.allowedFileTypes.map((t) => t.toLowerCase());
          if (!allowed.includes(extension)) {
            fieldErrors[field.fieldKey] = `Allowed file types: ${allowed.join(", ")}.`;
            continue;
          }
        }
        const maxMb = validation.maxFileSizeMb ?? 20;
        if (file.size > maxMb * 1024 * 1024) {
          fieldErrors[field.fieldKey] = `File exceeds the maximum size of ${maxMb} MB.`;
          continue;
        }
        values[field.fieldKey] = file.fileName;
      } else {
        values[field.fieldKey] = null;
      }
      continue;
    }

    const isEmpty =
      raw === null ||
      raw === undefined ||
      (typeof raw === "string" && raw.trim() === "") ||
      (Array.isArray(raw) && raw.length === 0);

    if (field.isRequired && isEmpty) {
      fieldErrors[field.fieldKey] = `${field.label} is required.`;
      continue;
    }
    if (isEmpty) {
      values[field.fieldKey] = Array.isArray(raw) ? [] : null;
      continue;
    }

    switch (field.fieldType) {
      case "TEXT":
      case "PARAGRAPH": {
        const text = String(raw).trim();
        if (validation.minLength !== undefined && text.length < validation.minLength) {
          fieldErrors[field.fieldKey] = `${field.label} must be at least ${validation.minLength} characters.`;
          break;
        }
        const maxLength = validation.maxLength ?? (field.fieldType === "TEXT" ? 500 : 10000);
        if (text.length > maxLength) {
          fieldErrors[field.fieldKey] = `${field.label} must be at most ${maxLength} characters.`;
          break;
        }
        if (validation.pattern) {
          try {
            if (!new RegExp(validation.pattern).test(text)) {
              fieldErrors[field.fieldKey] = `${field.label} has an invalid format.`;
              break;
            }
          } catch {
            // Invalid configured pattern: skip pattern validation.
          }
        }
        values[field.fieldKey] = text;
        break;
      }
      case "NUMBER": {
        const num = Number(String(raw).trim());
        if (!Number.isFinite(num)) {
          fieldErrors[field.fieldKey] = `${field.label} must be a number.`;
          break;
        }
        if (validation.minValue !== undefined && num < validation.minValue) {
          fieldErrors[field.fieldKey] = `${field.label} must be at least ${validation.minValue}.`;
          break;
        }
        if (validation.maxValue !== undefined && num > validation.maxValue) {
          fieldErrors[field.fieldKey] = `${field.label} must be at most ${validation.maxValue}.`;
          break;
        }
        values[field.fieldKey] = num;
        break;
      }
      case "EMAIL": {
        const email = String(raw).trim().toLowerCase();
        if (!EMAIL_PATTERN.test(email) || email.length > 254) {
          fieldErrors[field.fieldKey] = `Please enter a valid email address for ${field.label}.`;
          break;
        }
        values[field.fieldKey] = email;
        break;
      }
      case "PHONE": {
        const phone = String(raw).trim();
        if (!PHONE_PATTERN.test(phone)) {
          fieldErrors[field.fieldKey] = `Please enter a valid phone number for ${field.label}.`;
          break;
        }
        values[field.fieldKey] = phone;
        break;
      }
      case "DATE": {
        const date = String(raw).trim();
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) {
          fieldErrors[field.fieldKey] = `Please enter a valid date for ${field.label}.`;
          break;
        }
        values[field.fieldKey] = date;
        break;
      }
      case "TIME": {
        const time = String(raw).trim();
        if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
          fieldErrors[field.fieldKey] = `Please enter a valid time for ${field.label}.`;
          break;
        }
        values[field.fieldKey] = time;
        break;
      }
      case "DATETIME": {
        const datetime = String(raw).trim();
        if (Number.isNaN(Date.parse(datetime))) {
          fieldErrors[field.fieldKey] = `Please enter a valid date and time for ${field.label}.`;
          break;
        }
        values[field.fieldKey] = datetime;
        break;
      }
      case "DROPDOWN":
      case "RADIO": {
        const selected = String(raw);
        const options = (field.options as string[] | null) ?? [];
        if (!options.includes(selected)) {
          fieldErrors[field.fieldKey] = `Please select a valid option for ${field.label}.`;
          break;
        }
        values[field.fieldKey] = selected;
        break;
      }
      case "MULTI_SELECT":
      case "CHECKBOX": {
        const selected = Array.isArray(raw) ? raw.map(String) : [String(raw)];
        const options = (field.options as string[] | null) ?? [];
        const invalid = selected.filter((value) => !options.includes(value));
        if (invalid.length > 0) {
          fieldErrors[field.fieldKey] = `Invalid option selected for ${field.label}.`;
          break;
        }
        values[field.fieldKey] = selected;
        break;
      }
      case "YES_NO": {
        const value = String(raw).toLowerCase();
        if (!["yes", "no", "true", "false"].includes(value)) {
          fieldErrors[field.fieldKey] = `Please answer ${field.label}.`;
          break;
        }
        values[field.fieldKey] = value === "yes" || value === "true";
        break;
      }
      default:
        values[field.fieldKey] = String(raw);
    }
  }

  return { values, fieldErrors };
}
