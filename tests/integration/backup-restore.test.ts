import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";

/**
 * Backup & restore round-trip (SDS Doc 17 Ch7). Proves a .axivo archive faithfully
 * captures database rows + stored files, and that restoring it replaces the
 * current state (rows created after the backup are gone; the snapshot returns).
 * Uses its own isolated database so it never touches the other integration test.
 */

const TEST_DB_URL = "postgresql://axivo:axivo@localhost:5432/axivo_backup_integration?schema=public";
const STORAGE_DIR = path.resolve("./storage-backup-test");

(process.env as Record<string, string>).NODE_ENV = "test";
process.env.APP_URL = "http://localhost:3000";
process.env.DATABASE_URL = TEST_DB_URL;
process.env.REDIS_URL = "redis://localhost:6379";
process.env.SESSION_SECRET = "backup-session-secret-0123456789abcdef0123456789ab";
process.env.ENCRYPTION_KEY = "backup-encryption-key-0123456789abcdef0123456789ab";
process.env.TOKEN_SIGNING_KEY = "backup-token-key-0123456789abcdef0123456789abcdef01";
process.env.STORAGE_PATH = STORAGE_DIR;

let db: typeof import("@/shared/db").db;
let createBackup: typeof import("@/modules/backup/service").createBackup;
let restoreBackup: typeof import("@/modules/backup/service").restoreBackup;

beforeAll(async () => {
  execSync(
    `docker exec axivo-dev-pg psql -U axivo -d postgres -c "DROP DATABASE IF EXISTS axivo_backup_integration WITH (FORCE);" -c "CREATE DATABASE axivo_backup_integration;"`,
    { stdio: "pipe" },
  );
  execSync(`npx prisma migrate deploy`, {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: TEST_DB_URL },
    stdio: "pipe",
  });
  ({ db } = await import("@/shared/db"));
  ({ createBackup, restoreBackup } = await import("@/modules/backup/service"));
  await fs.rm(STORAGE_DIR, { recursive: true, force: true });
  await fs.mkdir(STORAGE_DIR, { recursive: true });
}, 180_000);

afterAll(async () => {
  await db?.$disconnect();
  await fs.rm(STORAGE_DIR, { recursive: true, force: true });
});

describe("backup & restore", () => {
  it("captures data + files and restores them, discarding post-backup changes", async () => {
    // --- Seed a snapshot: a company (with a null Json branding column) + a file.
    const company = await db.company.create({
      data: { name: "Snapshot Co", timezone: "UTC", currency: "USD" },
    });
    await fs.mkdir(path.join(STORAGE_DIR, "misc/2026/08"), { recursive: true });
    const fileKey = "misc/2026/08/sample.txt";
    await fs.writeFile(path.join(STORAGE_DIR, fileKey), "hello backup");

    const archive = await createBackup();
    expect(archive.length).toBeGreaterThan(0);

    // --- Diverge from the snapshot: add a company, delete the file.
    await db.company.create({ data: { name: "Added After Backup", timezone: "UTC", currency: "USD" } });
    await fs.rm(path.join(STORAGE_DIR, fileKey));
    expect(await db.company.count()).toBe(2);

    // --- Restore returns exactly the snapshot.
    const summary = await restoreBackup(archive);
    expect(summary.rows).toBeGreaterThan(0);

    const companies = await db.company.findMany();
    expect(companies).toHaveLength(1);
    expect(companies[0]!.name).toBe("Snapshot Co");
    expect(companies[0]!.id).toBe(company.id);

    const restoredFile = await fs.readFile(path.join(STORAGE_DIR, fileKey), "utf8");
    expect(restoredFile).toBe("hello backup");
  }, 120_000);

  it("rejects a file that is not an Axivo backup", async () => {
    await expect(restoreBackup(Buffer.from("not a backup"))).rejects.toThrow(/Axivo backup/);
  });
});
