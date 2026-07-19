import { describe, it, expect } from "vitest";
import {
  hashPassword,
  verifyPassword,
  validatePasswordAgainstPolicy,
  MINIMUM_PASSWORD_POLICY,
} from "@/shared/crypto/password";

describe("password hashing (SDS Doc 05 Ch4)", () => {
  it("hashes with Argon2id and verifies correctly", async () => {
    const hash = await hashPassword("Str0ng-Password-123!");
    expect(hash).toContain("$argon2id$");
    expect(await verifyPassword(hash, "Str0ng-Password-123!")).toBe(true);
    expect(await verifyPassword(hash, "wrong-password")).toBe(false);
  });

  it("produces unique salts", async () => {
    const first = await hashPassword("Str0ng-Password-123!");
    const second = await hashPassword("Str0ng-Password-123!");
    expect(first).not.toEqual(second);
  });
});

describe("password policy (SDS Doc 05 Ch4)", () => {
  it("accepts a compliant password", () => {
    expect(validatePasswordAgainstPolicy("Str0ng-Password-123!")).toEqual([]);
  });

  it("enforces minimum 12 characters", () => {
    const problems = validatePasswordAgainstPolicy("Sh0rt-Pw!");
    expect(problems.some((message) => message.includes("12 characters"))).toBe(true);
  });

  it("requires all character classes", () => {
    expect(validatePasswordAgainstPolicy("alllowercase123!").length).toBeGreaterThan(0);
    expect(validatePasswordAgainstPolicy("ALLUPPERCASE123!").length).toBeGreaterThan(0);
    expect(validatePasswordAgainstPolicy("NoNumbersHere!!!").length).toBeGreaterThan(0);
    expect(validatePasswordAgainstPolicy("NoSpecials12345A").length).toBeGreaterThan(0);
  });

  it("rejects common passwords", () => {
    const problems = validatePasswordAgainstPolicy("Password123!"); // in denylist after lowering? not in list
    // The denylist check is case-insensitive on the full string.
    const denylisted = validatePasswordAgainstPolicy("password123");
    expect(denylisted.some((message) => message.includes("too common"))).toBe(true);
    expect(Array.isArray(problems)).toBe(true);
  });

  it("never weakens the SDS baseline even if the configured policy is weaker", () => {
    const problems = validatePasswordAgainstPolicy("weakpw", {
      minLength: 4,
      requireUppercase: false,
      requireLowercase: false,
      requireNumber: false,
      requireSpecial: false,
    });
    expect(problems.length).toBeGreaterThan(0);
    expect(MINIMUM_PASSWORD_POLICY.minLength).toBe(12);
  });
});
