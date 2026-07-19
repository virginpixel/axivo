import { describe, it, expect } from "vitest";
import { isFieldVisible } from "@/modules/forms/visibility";

describe("conditional field visibility (SDS Doc 22)", () => {
  it("shows fields without rules", () => {
    expect(isFieldVisible(null, {})).toBe(true);
    expect(isFieldVisible(undefined, {})).toBe(true);
  });

  it("evaluates EQUALS / NOT_EQUALS case-insensitively", () => {
    const rules = { logic: "AND" as const, conditions: [{ fieldKey: "type", operator: "EQUALS" as const, value: "Manager" }] };
    expect(isFieldVisible(rules, { type: "manager" })).toBe(true);
    expect(isFieldVisible(rules, { type: "staff" })).toBe(false);
    const notRules = { logic: "AND" as const, conditions: [{ fieldKey: "type", operator: "NOT_EQUALS" as const, value: "Manager" }] };
    expect(isFieldVisible(notRules, { type: "staff" })).toBe(true);
  });

  it("evaluates CONTAINS, GREATER_THAN and LESS_THAN", () => {
    expect(
      isFieldVisible(
        { logic: "AND", conditions: [{ fieldKey: "notes", operator: "CONTAINS", value: "urgent" }] },
        { notes: "This is URGENT please" },
      ),
    ).toBe(true);
    expect(
      isFieldVisible(
        { logic: "AND", conditions: [{ fieldKey: "count", operator: "GREATER_THAN", value: "5" }] },
        { count: 10 },
      ),
    ).toBe(true);
    expect(
      isFieldVisible(
        { logic: "AND", conditions: [{ fieldKey: "count", operator: "LESS_THAN", value: "5" }] },
        { count: 10 },
      ),
    ).toBe(false);
  });

  it("combines conditions with AND and OR", () => {
    const conditions = [
      { fieldKey: "a", operator: "EQUALS" as const, value: "1" },
      { fieldKey: "b", operator: "EQUALS" as const, value: "2" },
    ];
    expect(isFieldVisible({ logic: "AND", conditions }, { a: "1", b: "2" })).toBe(true);
    expect(isFieldVisible({ logic: "AND", conditions }, { a: "1", b: "x" })).toBe(false);
    expect(isFieldVisible({ logic: "OR", conditions }, { a: "1", b: "x" })).toBe(true);
    expect(isFieldVisible({ logic: "OR", conditions }, { a: "x", b: "x" })).toBe(false);
  });

  it("matches multi-select values on EQUALS membership", () => {
    const rules = { logic: "AND" as const, conditions: [{ fieldKey: "options", operator: "EQUALS" as const, value: "Email" }] };
    expect(isFieldVisible(rules, { options: ["Email", "VPN"] })).toBe(true);
    expect(isFieldVisible(rules, { options: ["VPN"] })).toBe(false);
  });
});
