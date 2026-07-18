import { hash, verify } from "@node-rs/argon2";

/**
 * Password hashing and policy (SDS Doc 05 Ch4).
 * - Argon2id with unique salt (handled by the library)
 * - Minimum 12 chars, upper, lower, number, special
 * - Common password rejection
 */

const ARGON2_OPTIONS = {
  memoryCost: 19456, // 19 MiB (OWASP recommended baseline)
  timeCost: 2,
  parallelism: 1,
};

// Small embedded denylist of the most common passwords; complements the
// complexity rules below. Checked case-insensitively as substrings of longer
// trivial patterns is intentionally NOT done to avoid false positives.
const COMMON_PASSWORDS = new Set([
  "password", "password1", "password123", "123456789012", "qwerty123456",
  "letmein12345", "welcome12345", "admin1234567", "changeme1234",
  "iloveyou1234", "sunshine1234", "monkey123456", "dragon123456",
]);

export async function hashPassword(plaintext: string): Promise<string> {
  return hash(plaintext, ARGON2_OPTIONS);
}

export async function verifyPassword(hashValue: string, plaintext: string): Promise<boolean> {
  try {
    return await verify(hashValue, plaintext);
  } catch {
    return false;
  }
}

export interface PasswordPolicy {
  minLength: number;
  requireUppercase: boolean;
  requireLowercase: boolean;
  requireNumber: boolean;
  requireSpecial: boolean;
}

/** SDS-mandated minimum standard; admins may increase but never reduce it. */
export const MINIMUM_PASSWORD_POLICY: PasswordPolicy = {
  minLength: 12,
  requireUppercase: true,
  requireLowercase: true,
  requireNumber: true,
  requireSpecial: true,
};

export function validatePasswordAgainstPolicy(
  password: string,
  policy: PasswordPolicy = MINIMUM_PASSWORD_POLICY,
): string[] {
  const effective: PasswordPolicy = {
    minLength: Math.max(policy.minLength, MINIMUM_PASSWORD_POLICY.minLength),
    requireUppercase: policy.requireUppercase || MINIMUM_PASSWORD_POLICY.requireUppercase,
    requireLowercase: policy.requireLowercase || MINIMUM_PASSWORD_POLICY.requireLowercase,
    requireNumber: policy.requireNumber || MINIMUM_PASSWORD_POLICY.requireNumber,
    requireSpecial: policy.requireSpecial || MINIMUM_PASSWORD_POLICY.requireSpecial,
  };

  const problems: string[] = [];
  if (password.length < effective.minLength) {
    problems.push(`Password must be at least ${effective.minLength} characters long.`);
  }
  if (effective.requireUppercase && !/[A-Z]/.test(password)) {
    problems.push("Password must contain an uppercase letter.");
  }
  if (effective.requireLowercase && !/[a-z]/.test(password)) {
    problems.push("Password must contain a lowercase letter.");
  }
  if (effective.requireNumber && !/[0-9]/.test(password)) {
    problems.push("Password must contain a number.");
  }
  if (effective.requireSpecial && !/[^A-Za-z0-9]/.test(password)) {
    problems.push("Password must contain a special character.");
  }
  if (COMMON_PASSWORDS.has(password.toLowerCase())) {
    problems.push("This password is too common. Please choose a stronger password.");
  }
  return problems;
}
