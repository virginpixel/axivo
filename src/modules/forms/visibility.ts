import type { VisibilityRule } from "./validators";

/**
 * Conditional field visibility evaluation (SDS Doc 22).
 * Shared by the public form renderer (client) and server-side submission
 * validation so hidden-field rules are enforced identically on both sides.
 */

export type FieldValueMap = Record<string, string | string[] | number | boolean | null | undefined>;

function normalize(value: FieldValueMap[string]): string {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return value.join(",");
  return String(value);
}

function evaluateCondition(
  values: FieldValueMap,
  condition: VisibilityRule["conditions"][number],
): boolean {
  const actualRaw = values[condition.fieldKey];
  const actual = normalize(actualRaw);
  const expected = condition.value;
  switch (condition.operator) {
    case "EQUALS":
      if (Array.isArray(actualRaw)) return actualRaw.map(String).includes(expected);
      return actual.toLowerCase() === expected.toLowerCase();
    case "NOT_EQUALS":
      if (Array.isArray(actualRaw)) return !actualRaw.map(String).includes(expected);
      return actual.toLowerCase() !== expected.toLowerCase();
    case "CONTAINS":
      return actual.toLowerCase().includes(expected.toLowerCase());
    case "GREATER_THAN": {
      const a = Number(actual);
      const b = Number(expected);
      return Number.isFinite(a) && Number.isFinite(b) && a > b;
    }
    case "LESS_THAN": {
      const a = Number(actual);
      const b = Number(expected);
      return Number.isFinite(a) && Number.isFinite(b) && a < b;
    }
    default:
      return false;
  }
}

/** A field with no rules is always visible. */
export function isFieldVisible(rules: VisibilityRule | null | undefined, values: FieldValueMap): boolean {
  if (!rules || rules.conditions.length === 0) return true;
  const results = rules.conditions.map((condition) => evaluateCondition(values, condition));
  return rules.logic === "AND" ? results.every(Boolean) : results.some(Boolean);
}
