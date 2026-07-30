import { db, type DbClient } from "@/shared/db";
import type { AuditOutcome, Prisma } from "@prisma/client";

/**
 * Immutable audit logging (SDS Doc 16). Every significant operation records an
 * append-only event; the application never updates or deletes audit rows.
 * A logging failure must never interrupt the business transaction it observes
 * unless the caller passes a transaction client (in which case atomicity with
 * the business change is intentional, per Doc 04 Ch11).
 */

export interface AuditContext {
  actorUserId?: string | null;
  actorPersonId?: string | null;
  /** Login username, used for audit records. */
  actorLabel: string;
  /**
   * The actor's human name (e.g. "Ahmed Hasin"), for surfaces read by people
   * rather than machines: "assigned by", "implemented by" and similar. Falls
   * back to actorLabel when a friendlier name is not available (system, public).
   */
  actorName?: string | null;
  companyId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  correlationId?: string | null;
}

export interface FieldChange {
  field: string;
  previousValue?: string | null;
  newValue?: string | null;
}

export interface AuditEntry {
  module: string;
  eventType: string;
  action: string;
  outcome?: AuditOutcome;
  targetType?: string;
  targetId?: string;
  targetLabel?: string;
  details?: Prisma.InputJsonValue;
  fieldChanges?: FieldChange[];
}

export const SYSTEM_ACTOR: AuditContext = { actorLabel: "system" };

/** Values that must never appear in audit logs (Doc 01 Ch6). */
const REDACTED_FIELDS = new Set([
  "password", "passwordHash", "password_hash", "secret", "token", "secretCiphertext",
  "smtpPassword", "tokenHash",
]);

function sanitizeChanges(changes: FieldChange[] | undefined): FieldChange[] {
  if (!changes) return [];
  return changes.map((change) =>
    REDACTED_FIELDS.has(change.field)
      ? { field: change.field, previousValue: "[redacted]", newValue: "[redacted]" }
      : change,
  );
}

export async function recordAudit(
  context: AuditContext,
  entry: AuditEntry,
  client: DbClient = db,
): Promise<void> {
  const write = async () => {
    const event = await client.auditEvent.create({
      data: {
        module: entry.module,
        eventType: entry.eventType,
        action: entry.action,
        outcome: entry.outcome ?? "SUCCESS",
        companyId: context.companyId ?? null,
        actorUserId: context.actorUserId ?? null,
        actorPersonId: context.actorPersonId ?? null,
        actorLabel: context.actorLabel,
        targetType: entry.targetType ?? null,
        targetId: entry.targetId ?? null,
        targetLabel: entry.targetLabel ?? null,
        ipAddress: context.ipAddress ?? null,
        userAgent: context.userAgent ?? null,
        correlationId: context.correlationId ?? null,
        details: entry.details,
      },
    });
    const changes = sanitizeChanges(entry.fieldChanges);
    if (changes.length > 0) {
      await client.auditEventDetail.createMany({
        data: changes.map((change) => ({
          auditEventId: event.id,
          field: change.field,
          previousValue: change.previousValue ?? null,
          newValue: change.newValue ?? null,
        })),
      });
    }
  };

  if (client === db) {
    // Standalone write: never let audit failure break the caller, but surface
    // it loudly (Doc 16 Ch3: logging failures generate alerts).
    try {
      await write();
    } catch (error) {
      console.error("[axivo] AUDIT LOGGING FAILURE - requires administrator attention:", error);
    }
  } else {
    // Inside a caller-managed transaction: atomic with the business change.
    await write();
  }
}

/** Compute field-level diffs between two flat records for change tracking. */
export function diffRecords(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  fields?: string[],
): FieldChange[] {
  const keys = fields ?? Array.from(new Set([...Object.keys(before), ...Object.keys(after)]));
  const changes: FieldChange[] = [];
  for (const key of keys) {
    const prev = before[key];
    const next = after[key];
    const prevStr = prev === null || prev === undefined ? null : String(prev);
    const nextStr = next === null || next === undefined ? null : String(next);
    if (prevStr !== nextStr) {
      changes.push({ field: key, previousValue: prevStr, newValue: nextStr });
    }
  }
  return changes;
}
