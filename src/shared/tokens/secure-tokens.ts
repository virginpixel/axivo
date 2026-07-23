import crypto from "node:crypto";
import { db, type DbClient } from "@/shared/db";
import { randomToken, sha256, safeEqual } from "@/shared/crypto/encryption";
import { env } from "@/shared/env";
import { getSetting, SETTING_KEYS } from "@/shared/settings/settings";
import { BusinessRuleError } from "@/shared/errors";
import type { TokenPurpose, SecureToken, Prisma } from "@prisma/client";

/**
 * Secure email action tokens (SDS Doc 05 Ch8).
 * Each token is cryptographically random, HMAC-signed, single-purpose,
 * time-limited and (where applicable) single-use. Only the SHA-256 hash of the
 * random part is stored; the signed value travels in the email link.
 *
 * Wire format: <random>.<hmac(random)>
 */

function sign(value: string): string {
  return crypto
    .createHmac("sha256", env().TOKEN_SIGNING_KEY)
    .update(value)
    .digest("base64url");
}

export interface IssueTokenInput {
  purpose: TokenPurpose;
  email: string;
  personId?: string | null;
  targetType: string;
  targetId: string;
  metadata?: Prisma.InputJsonValue;
  /** Override the configured default expiry. */
  expiresInHours?: number;
}

export interface IssuedToken {
  /** Value to embed in the email link. Never persisted or logged. */
  token: string;
  record: SecureToken;
}

export async function issueToken(input: IssueTokenInput, client: DbClient = db): Promise<IssuedToken> {
  const defaultHours = await getSetting<number>(SETTING_KEYS.TOKEN_EXPIRY_HOURS);
  const hours = input.expiresInHours ?? defaultHours;
  const random = randomToken(32);
  const token = `${random}.${sign(random)}`;

  const record = await client.secureToken.create({
    data: {
      purpose: input.purpose,
      tokenHash: sha256(random),
      email: input.email.toLowerCase(),
      personId: input.personId ?? null,
      targetType: input.targetType,
      targetId: input.targetId,
      metadata: input.metadata,
      expiresAt: new Date(Date.now() + hours * 3_600_000),
    },
  });
  return { token, record };
}

export type TokenValidationFailure =
  | "malformed"
  | "invalid_signature"
  | "not_found"
  | "expired"
  | "consumed"
  | "revoked"
  | "wrong_purpose";

export type TokenValidationResult =
  | { valid: true; record: SecureToken }
  | { valid: false; reason: TokenValidationFailure };

/**
 * Validate a token without consuming it (Doc 05 Ch8 validation order:
 * signature → expiry → intended action; record-state checks belong to the
 * caller which knows the business context).
 */
export async function validateToken(
  token: string,
  expectedPurpose: TokenPurpose,
): Promise<TokenValidationResult> {
  const parts = token.split(".");
  if (parts.length !== 2) return { valid: false, reason: "malformed" };
  const [random, signature] = parts as [string, string];
  if (!safeEqual(sign(random), signature)) {
    return { valid: false, reason: "invalid_signature" };
  }
  const record = await db.secureToken.findUnique({ where: { tokenHash: sha256(random) } });
  if (!record) return { valid: false, reason: "not_found" };
  if (record.purpose !== expectedPurpose) return { valid: false, reason: "wrong_purpose" };
  if (record.revokedAt) return { valid: false, reason: "revoked" };
  if (record.expiresAt < new Date()) return { valid: false, reason: "expired" };
  if (record.consumedAt) return { valid: false, reason: "consumed" };
  return { valid: true, record };
}

/**
 * Look up a token's record regardless of whether it is still usable.
 *
 * Server Actions re-render the page they were called from, so a page that
 * consumed its own token would otherwise re-validate, fail, and replace a
 * just-completed flow with a "link expired" error. Pages use this to recognise
 * their own completed token and show the finished state instead.
 */
export async function peekToken(token: string, expectedPurpose: TokenPurpose) {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [random, signature] = parts as [string, string];
  if (!safeEqual(sign(random), signature)) return null;
  const record = await db.secureToken.findUnique({ where: { tokenHash: sha256(random) } });
  if (!record || record.purpose !== expectedPurpose) return null;
  return record;
}

/**
 * Mark a token consumed inside the caller's transaction (single use).
 *
 * Completing a step revokes every outstanding token for it, including the one
 * the acting approver is holding, so by the time we get here the token is
 * often already revoked. That is the normal successful path, not a replay:
 * only a token that was already *consumed* means someone is reusing a link.
 */
export async function consumeToken(tokenId: string, client: DbClient = db): Promise<void> {
  const updated = await client.secureToken.updateMany({
    where: { id: tokenId, consumedAt: null },
    data: { consumedAt: new Date() },
  });
  if (updated.count === 0) {
    throw new BusinessRuleError("This link has already been used.");
  }
}

/** Revoke all outstanding tokens for a record (Doc 05 Ch13). */
export async function revokeTokensForTarget(
  targetType: string,
  targetId: string,
  client: DbClient = db,
): Promise<number> {
  const result = await client.secureToken.updateMany({
    where: { targetType, targetId, consumedAt: null, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  return result.count;
}

/**
 * Build the absolute action URL embedded in emails. Uses the Public base URL
 * from Settings when configured, falling back to the APP_URL env var.
 */
export async function tokenActionUrl(path: string, token: string): Promise<string> {
  const { publicBaseUrl } = await import("@/shared/settings/runtime");
  const base = await publicBaseUrl();
  return `${base}${path}?token=${encodeURIComponent(token)}`;
}
