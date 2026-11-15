import { describe, it, expect } from "vitest";
import { daysUntil, hasDatePassed, startOfDayUtc, enumLabel } from "@/shared/utils";
import { getLicenseCoverage, LICENSE_EXPIRY_WARNING_DAYS } from "@/modules/licenses/service";

/**
 * Expiry dates are entered as plain dates and stored at midnight, so comparing
 * one straight against the current instant retires it a day early - at one
 * minute past midnight on the very day it was supposed to cover. Cover runs
 * through the END of the date entered, and these pin that down.
 */
describe("dated-through expiry", () => {
  const expiry = new Date("2026-11-15T00:00:00.000Z");

  it("counts whole days regardless of the time of day", () => {
    expect(daysUntil(expiry, new Date("2026-11-15T00:00:00.000Z"))).toBe(0);
    expect(daysUntil(expiry, new Date("2026-11-15T23:59:59.000Z"))).toBe(0);
    expect(daysUntil(expiry, new Date("2026-11-14T23:00:00.000Z"))).toBe(1);
    expect(daysUntil(expiry, new Date("2026-11-16T00:00:01.000Z"))).toBe(-1);
  });

  it("has not passed at any point during the expiry date itself", () => {
    expect(hasDatePassed(expiry, new Date("2026-11-15T00:00:00.000Z"))).toBe(false);
    expect(hasDatePassed(expiry, new Date("2026-11-15T12:00:00.000Z"))).toBe(false);
    expect(hasDatePassed(expiry, new Date("2026-11-15T23:59:59.000Z"))).toBe(false);
  });

  it("has passed the following day", () => {
    expect(hasDatePassed(expiry, new Date("2026-11-16T00:00:00.000Z"))).toBe(true);
  });

  it("startOfDayUtc strips the time", () => {
    expect(startOfDayUtc(new Date("2026-11-15T17:43:21.456Z")).toISOString()).toBe(
      "2026-11-15T00:00:00.000Z",
    );
  });
});

describe("licence cover across renewals", () => {
  const today = new Date("2026-11-15T15:00:00.000Z");
  const oldTerm = { expiryDate: new Date("2026-11-15T00:00:00.000Z") };
  const renewal = { expiryDate: new Date("2027-11-15T00:00:00.000Z") };

  it("is still covered on the last day of a term", () => {
    expect(getLicenseCoverage([oldTerm], today).state).toBe("expiring");
  });

  it("lapses the day after the last term ends", () => {
    const tomorrow = new Date("2026-11-16T09:00:00.000Z");
    expect(getLicenseCoverage([oldTerm], tomorrow).state).toBe("expired");
  });

  it("takes cover from the furthest term, not the earliest", () => {
    // The whole point of a renewal: an expired term sitting beside a live one
    // must not make the licence read as lapsed.
    const coverage = getLicenseCoverage([oldTerm, renewal], today);
    expect(coverage.state).toBe("valid");
    expect(coverage.expiresAt?.toISOString().slice(0, 10)).toBe("2027-11-15");
  });

  it("warns inside the notice period and not before it", () => {
    const justInside = new Date(
      renewal.expiryDate.getTime() - (LICENSE_EXPIRY_WARNING_DAYS - 1) * 86_400_000,
    );
    const wellBefore = new Date(
      renewal.expiryDate.getTime() - (LICENSE_EXPIRY_WARNING_DAYS + 10) * 86_400_000,
    );
    expect(getLicenseCoverage([renewal], justInside).state).toBe("expiring");
    expect(getLicenseCoverage([renewal], wellBefore).state).toBe("valid");
  });

  it("calls a perpetual licence uncovered rather than expired", () => {
    expect(getLicenseCoverage([{ expiryDate: null }], today).state).toBe("none");
  });
});

describe("enum labels", () => {
  it("reads as prose, matching the wording of the dropdowns", () => {
    expect(enumLabel("NEW_PURCHASE")).toBe("New purchase");
    expect(enumLabel("ADDITIONAL_SEATS")).toBe("Additional seats");
    expect(enumLabel("RENEWAL")).toBe("Renewal");
    expect(enumLabel("SUBSCRIPTION")).toBe("Subscription");
    expect(enumLabel("ANNUAL")).toBe("Annual");
  });
});
