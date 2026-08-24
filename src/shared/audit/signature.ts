import { createHash } from "node:crypto";

/**
 * Deterministic SHA-256 of the exact content a person signed (an acknowledgement,
 * an approval, a submission). Stored alongside the signature so any later change
 * to the underlying record is detectable by re-hashing and comparing — the
 * tamper-evidence the Electronic Transactions Act's reliability test expects.
 *
 * Callers must build `payload` with a stable field order (plain objects preserve
 * insertion order through JSON.stringify), so the same content always hashes the
 * same way.
 */
export function signatureHash(payload: unknown): string {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}
