import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { getAppTimeZone, timeZoneLabel } from "@/shared/app-config";

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

export function fullName(person: { firstName: string; lastName: string }): string {
  return `${person.firstName} ${person.lastName}`;
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
