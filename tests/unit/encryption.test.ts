import { describe, it, expect, beforeAll } from "vitest";

beforeAll(() => {
  (process.env as Record<string, string>).NODE_ENV = "test";
  process.env.APP_URL = "http://localhost:3000";
  process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test";
  process.env.REDIS_URL = "redis://localhost:6379";
  process.env.SESSION_SECRET = "test-session-secret-0123456789abcdef0123456789abcdef";
  process.env.ENCRYPTION_KEY = "test-encryption-key-0123456789abcdef0123456789abcdef";
  process.env.TOKEN_SIGNING_KEY = "test-token-signing-0123456789abcdef0123456789abcdef";
  process.env.STORAGE_PATH = "./storage-test";
});

describe("AES-256-GCM encryption (SDS Doc 05 Ch10)", () => {
  it("round-trips secrets", async () => {
    const { encryptSecret, decryptSecret } = await import("@/shared/crypto/encryption");
    const secret = "Temp-Password-2026!";
    const ciphertext = encryptSecret(secret);
    expect(ciphertext).not.toContain(secret);
    expect(decryptSecret(ciphertext)).toBe(secret);
  });

  it("uses unique IVs so identical plaintexts produce different ciphertexts", async () => {
    const { encryptSecret } = await import("@/shared/crypto/encryption");
    expect(encryptSecret("same-value")).not.toEqual(encryptSecret("same-value"));
  });

  it("rejects tampered ciphertext (authenticated encryption)", async () => {
    const { encryptSecret, decryptSecret } = await import("@/shared/crypto/encryption");
    const parts = encryptSecret("value").split(".");
    const data = Buffer.from(parts[2]!, "base64");
    if (data.length > 0) data[0] = (data[0]! + 1) % 256;
    const tampered = [parts[0], parts[1], data.toString("base64")].join(".");
    expect(() => decryptSecret(tampered)).toThrow();
  });

  it("hashes and compares safely", async () => {
    const { sha256, safeEqual, randomToken } = await import("@/shared/crypto/encryption");
    expect(sha256("abc")).toHaveLength(64);
    expect(safeEqual("token", "token")).toBe(true);
    expect(safeEqual("token", "other")).toBe(false);
    expect(randomToken(32)).not.toEqual(randomToken(32));
  });
});
