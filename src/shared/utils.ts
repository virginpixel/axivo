import { type ClassValue, clsx } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";
import { getAppTimeZone, timeZoneLabel } from "@/shared/app-config";

/*
 * tailwind-merge has to be told about font sizes we invented, or it reads
 * "text-micro" as a text color and lets a later "text-muted-foreground" delete
 * it. The symptom is subtle - the class silently vanishes from the rendered
 * markup - so the custom scale is declared here alongside the config.
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [{ text: ["micro"] }],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Trim string values and collapse empty strings to undefined. */
export function cleanText(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Dates and times render in the organisation timezone configured in Settings
 * (never UTC), so what is shown matches what people expect locally.
 */
export function formatDate(value: Date | string | null | undefined, timeZone = getAppTimeZone()): string {
  if (!value) return "None";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "None";
  try {
    // en-CA yields the ISO-like YYYY-MM-DD ordering.
    return new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

export function formatDateTime(value: Date | string | null | undefined, timeZone = getAppTimeZone()): string {
  if (!value) return "None";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "None";
  try {
    const day = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date);
    const time = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(date);
    return `${day} ${time}`;
  } catch {
    return date.toISOString().replace("T", " ").slice(0, 16);
  }
}

/** Timestamp with an explicit zone label, for PDFs and exports. */
export function formatDateTimeWithZone(value: Date | string | null | undefined, timeZone = getAppTimeZone()): string {
  const base = formatDateTime(value, timeZone);
  return base === "None" ? base : `${base} (${timeZoneLabel(timeZone)})`;
}

/**
 * Midnight at the start of a date. Expiry and start dates are entered as plain
 * dates and stored at midnight, so whole-day comparisons belong on this
 * boundary rather than on the current instant.
 */
export function startOfDayUtc(value: Date = new Date()): Date {
  const start = new Date(value);
  start.setUTCHours(0, 0, 0, 0);
  return start;
}

/**
 * Whole days from today to a date: 0 on the day itself, negative once it has
 * passed. Comparing instants instead would make "days left" depend on the time
 * of day the job happened to run.
 */
export function daysUntil(target: Date, now: Date = new Date()): number {
  return Math.round((startOfDayUtc(target).getTime() - startOfDayUtc(now).getTime()) / 86_400_000);
}

/**
 * Has a dated-through value passed? Cover runs to the END of the date entered,
 * so a licence or contract dated the 15th is still live all through the 15th
 * and lapses on the 16th. Comparing the stored midnight against "now" directly
 * retired it a day early, at one minute past midnight on the day it covered.
 *
 * Measured in UTC against stored midnights. Ahead of UTC that leaves a few
 * hours of grace on the final evening, which errs on the side of not cutting
 * cover off early - the direction that cannot cause a false alarm.
 */
export function hasDatePassed(value: Date, now: Date = new Date()): boolean {
  return daysUntil(value, now) < 0;
}

/**
 * An enum constant as a label: NEW_PURCHASE becomes "New purchase". Lower-cased
 * with only the first letter raised, so it reads as prose next to the rest of
 * the interface instead of shouting, and matches the wording of the dropdowns
 * these values are chosen from.
 */
export function enumLabel(value: string): string {
  const words = value.replace(/_/g, " ").toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function fullName(person: { firstName: string; lastName: string }): string {
  return `${person.firstName} ${person.lastName}`;
}

/**
 * The secondary line under a name in a person picker: the employee number, or
 * for a third-party contact their own employer. Picking a tenant's contact for
 * a staff laptop - or an employee for a tenant's phone - is an easy mistake to
 * make when every row in the list looks like staff.
 */
export function personHint(person: {
  employeeId: string;
  isThirdParty: boolean;
  externalCompanyName: string | null;
}): string {
  return person.isThirdParty
    ? `${person.externalCompanyName ?? "External"} · third party`
    : person.employeeId;
}

/** Generate a URL-safe slug from a name. */
export function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}
