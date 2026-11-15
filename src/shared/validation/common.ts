import { z } from "zod";
import { ValidationError } from "@/shared/errors";

/**
 * Shared validation primitives (SDS Doc 05 Ch6). Server-side validation is
 * mandatory for every operation; unexpected fields are rejected by using
 * .strict() object schemas in module validators.
 */

export const uuidSchema = z.string().uuid("Invalid identifier.");

export const emailSchema = z
  .string()
  .trim()
  .min(1, "Email is required.")
  .max(254, "Email is too long.")
  .email("Please enter a valid email address.")
  .transform((value) => value.toLowerCase());

/** An optional email address that clears the column when the field is emptied. */
export const nullableEmail = () =>
  z
    .union([z.literal(""), z.null(), z.undefined(), emailSchema])
    .transform((value) => (value === "" || value == null ? null : value));

/** Comma, semicolon or line break - however somebody pastes a list of addresses. */
const SEPARATORS = /[,;\r\n]+/;

/**
 * A list of email addresses typed into one box, separated by commas, semicolons
 * or newlines. Free text rather than a person picker on purpose: the people who
 * need to hear that something expires are not always Axivo users, and a shared
 * mailbox is not a person at all.
 *
 * Duplicates are dropped and the order typed is kept, so the list reads back
 * the way it was written.
 */
export const emailListSchema = (max = 20) =>
  z
    .union([z.string(), z.array(z.string()), z.null(), z.undefined()])
    .transform((value) => {
      const raw = value == null ? [] : Array.isArray(value) ? value : value.split(SEPARATORS);
      const seen = new Set<string>();
      const list: string[] = [];
      for (const entry of raw) {
        const address = entry.trim().toLowerCase();
        if (!address || seen.has(address)) continue;
        seen.add(address);
        list.push(address);
      }
      return list;
    })
    .superRefine((list, ctx) => {
      if (list.length > max) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Please enter at most ${max} email addresses.`,
        });
        return;
      }
      const invalid = list.filter((address) => !z.string().email().safeParse(address).success);
      if (invalid.length > 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            invalid.length === 1
              ? `"${invalid[0]}" is not a valid email address.`
              : `These are not valid email addresses: ${invalid.join(", ")}.`,
        });
      }
    });

export const requiredText = (label: string, max = 200) =>
  z
    .string({ required_error: `${label} is required.` })
    .trim()
    .min(1, `${label} is required.`)
    .max(max, `${label} must be at most ${max} characters.`);

/**
 * An optional text field, which resolves to null rather than undefined when it
 * is empty or absent.
 *
 * That distinction is the whole point. Every form in this system submits its
 * complete set of fields on save, so an optional field arriving empty means the
 * user cleared it - it never means "leave whatever was there". Prisma skips
 * undefined keys, so resolving to undefined silently kept the previous value
 * and told the user it had saved. Null writes the column.
 */
export const optionalText = (max = 2000) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((value) => (value == null || value === "" ? null : value));

export const dateSchema = z.coerce.date({ invalid_type_error: "Please enter a valid date." });

/**
 * An optional reference to another record - a location, an owner, a parent -
 * that clears the column when the field is left empty. Use this for a nullable
 * FK on a form that is saved whole; a filter or a partial action still wants
 * `uuidSchema.optional()`, where absent has to keep meaning "not specified".
 */
export const nullableUuid = () =>
  z
    .string()
    .nullish()
    .transform((value) => {
      const trimmed = value?.trim();
      return trimmed ? trimmed : null;
    })
    .refine((value) => value === null || z.string().uuid().safeParse(value).success, {
      message: "Invalid identifier.",
    });

/**
 * An optional date that clears the column when emptied. The empty string is
 * matched before the date branch: coercing "" yields an Invalid Date, which
 * would surface as "Please enter a valid date" on a field the user deliberately
 * blanked.
 */
export const nullableDate = () =>
  z
    .union([z.literal(""), z.null(), z.undefined(), dateSchema])
    .transform((value) => (value === "" || value == null ? null : value));

export const positiveInt = (label: string) =>
  z.coerce
    .number({ invalid_type_error: `${label} must be a number.` })
    .int(`${label} must be a whole number.`)
    .positive(`${label} must be greater than zero.`);

export const nonNegativeDecimal = (label: string) =>
  z.coerce
    .number({ invalid_type_error: `${label} must be a number.` })
    .nonnegative(`${label} cannot be negative.`);

/** An optional amount that clears the column when emptied. See {@link nullableDate}. */
export const nullableDecimal = (label: string) =>
  z
    .union([z.literal(""), z.null(), z.undefined(), nonNegativeDecimal(label)])
    .transform((value) => (value === "" || value == null ? null : value));

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export type Pagination = z.infer<typeof paginationSchema>;

export function pageArgs(pagination: Pagination): { skip: number; take: number } {
  return { skip: (pagination.page - 1) * pagination.pageSize, take: pagination.pageSize };
}

export interface Paged<T> {
  rows: T[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}

export function paged<T>(rows: T[], total: number, pagination: Pagination): Paged<T> {
  return {
    rows,
    total,
    page: pagination.page,
    pageSize: pagination.pageSize,
    pageCount: Math.max(1, Math.ceil(total / pagination.pageSize)),
  };
}

/**
 * Parse raw client input against a schema, throwing a ValidationError with
 * field-level messages on failure. Used at the top of every server action.
 */
export function parseInput<Schema extends z.ZodTypeAny>(
  schema: Schema,
  raw: unknown,
): z.infer<Schema> {
  const result = schema.safeParse(raw);
  if (!result.success) {
    throw new ValidationError(undefined, fieldErrorsFromZod(result.error));
  }
  return result.data;
}

/** Convert a ZodError into field-level messages for inline display. */
export function fieldErrorsFromZod(error: z.ZodError): Record<string, string> {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_form";
    if (!fieldErrors[key]) fieldErrors[key] = issue.message;
  }
  return fieldErrors;
}
