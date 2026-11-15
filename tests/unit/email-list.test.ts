import { describe, it, expect } from "vitest";
import { emailListSchema } from "@/shared/validation/common";

/**
 * Alert recipients are typed into one box rather than picked from People: the
 * people who chase a renewal are often a shared mailbox, not an Axivo user.
 * That means the parsing has to be forgiving about how a list is written and
 * strict about what ends up stored.
 */
describe("alert recipient lists", () => {
  const parse = (value: unknown) => emailListSchema().safeParse(value);

  it("accepts commas, semicolons and line breaks", () => {
    const result = parse("it@example.com, procurement@example.com; ops@example.com");
    expect(result.success && result.data).toEqual([
      "it@example.com",
      "procurement@example.com",
      "ops@example.com",
    ]);
  });

  it("trims, lower-cases and keeps the order typed", () => {
    const result = parse("  Zoe@Example.com ,alan@example.com");
    expect(result.success && result.data).toEqual(["zoe@example.com", "alan@example.com"]);
  });

  it("drops duplicates, however they were capitalised", () => {
    const result = parse("it@example.com, IT@example.com");
    expect(result.success && result.data).toEqual(["it@example.com"]);
  });

  it("treats blank, null and undefined as no recipients", () => {
    for (const value of ["", "   ", ",,;", null, undefined]) {
      const result = parse(value);
      expect(result.success && result.data).toEqual([]);
    }
  });

  it("accepts an array as well as a typed string", () => {
    const result = parse(["it@example.com", "ops@example.com"]);
    expect(result.success && result.data).toEqual(["it@example.com", "ops@example.com"]);
  });

  it("names the address that is wrong rather than failing vaguely", () => {
    const result = parse("it@example.com, not-an-address");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain("not-an-address");
    }
  });

  it("refuses more addresses than the limit", () => {
    const many = Array.from({ length: 5 }, (_, i) => `a${i}@example.com`).join(",");
    expect(emailListSchema(3).safeParse(many).success).toBe(false);
    expect(emailListSchema(5).safeParse(many).success).toBe(true);
  });
});
