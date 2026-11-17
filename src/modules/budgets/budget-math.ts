/**
 * Budget arithmetic (SDS Doc 25). Pure and client-safe, so the line form
 * shows the same totals the server stores. Amounts are worked in cents to
 * keep twelve-way splits exact.
 */

export const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

const cents = (value: number) => Math.round(value * 100);

/**
 * An annual amount spread over twelve months: equal parts, with the cents
 * that do not divide evenly added to the last months, so the months always
 * add back up to the year.
 */
export function evenMonths(amount: number): number[] {
  const total = cents(amount);
  const base = Math.trunc(total / 12);
  const spare = total - base * 12;
  return Array.from({ length: 12 }, (_, month) => (base + (month >= 12 - spare ? 1 : 0)) / 100);
}

/** The months a line's amount falls in: what was entered, or an even spread. */
export function lineMonths(line: { amount: number; months: unknown }): number[] {
  if (Array.isArray(line.months) && line.months.length === 12) return line.months.map((m) => Number(m) || 0);
  return evenMonths(line.amount);
}

export function sum(values: number[]): number {
  return values.reduce((total, value) => total + cents(value), 0) / 100;
}

/** CAPEX: quantity x unit price, plus the associated cost. */
export function capexTotal(quantity: number | null, unitPrice: number | null, associatedCost: number | null): number {
  return (cents((quantity ?? 0) * (unitPrice ?? 0)) + cents(associatedCost ?? 0)) / 100;
}

/** A company's part of an amount. */
export function share(amount: number, percent: number): number {
  return Math.round(amount * percent) / 100;
}

/** Shares add up to 100 (to the hundredth). */
export function sharesComplete(percents: number[]): boolean {
  return Math.round(percents.reduce((total, p) => total + p * 100, 0)) === 10000;
}

/** Split 100% evenly over n companies, the remainder on the first. */
export function evenShares(n: number): number[] {
  if (n <= 0) return [];
  const each = Math.floor(10000 / n) / 100;
  const first = Math.round((100 - each * (n - 1)) * 100) / 100;
  return [first, ...Array.from({ length: n - 1 }, () => each)];
}

export function usd(value: number, fractions = 0): string {
  return value.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: fractions, maximumFractionDigits: fractions });
}

export const PRIORITY_LABELS = { FIRST: "First priority", MEDIUM: "Medium priority", WISH_LIST: "Wish list" } as const;
export const CAPEX_TYPE_LABELS = {
  REVENUE_GENERATING: "Revenue generating",
  COST_SAVING: "Cost saving",
  REGULAR_REPLACEMENT: "Regular replacement",
  NEW_OPERATION: "New operation enhancement",
  OTHER: "Other",
} as const;
export const STATUS_LABELS = { DRAFT: "Draft", SUBMITTED: "Submitted", APPROVED: "Approved" } as const;
export const QUARTERS = ["Q1", "Q2", "Q3", "Q4"] as const;
