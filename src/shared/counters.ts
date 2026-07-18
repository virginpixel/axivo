import { db, type DbClient } from "@/shared/db";

/**
 * Atomic sequential business counters (request numbers, etc.). Uses an upsert
 * + atomic increment so concurrent submissions never receive the same number
 * (SDS Doc 04 Ch11 idempotency/concurrency).
 */
export async function nextCounterValue(key: string, client: DbClient = db): Promise<number> {
  await client.counter.upsert({
    where: { key },
    create: { key, value: 0 },
    update: {},
  });
  const updated = await client.counter.update({
    where: { key },
    data: { value: { increment: 1 } },
  });
  return updated.value;
}

/** Format: REQ-2026-000123 (year-scoped sequential request numbers). */
export async function nextRequestNumber(client: DbClient = db): Promise<string> {
  const year = new Date().getUTCFullYear();
  const value = await nextCounterValue(`request:${year}`, client);
  return `REQ-${year}-${String(value).padStart(6, "0")}`;
}
