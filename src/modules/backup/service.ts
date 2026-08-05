import "server-only";
import zlib from "node:zlib";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import path from "node:path";
import { Prisma } from "@prisma/client";
import { db } from "@/shared/db";
import { env } from "@/shared/env";
import { BusinessRuleError } from "@/shared/errors";

/**
 * Data backup & restore (SDS Doc 17 Ch7). A ".axivo" file is a portable,
 * gzip-compressed JSON snapshot of the user's data: every database table plus
 * the uploaded files under STORAGE_PATH. It deliberately does NOT include
 * infrastructure secrets (the .env, the encryption key), so it is safe to move
 * between servers - the intended use is reinstalling Axivo on another VM and
 * restoring the previous data.
 *
 * Because the encryption key is not part of the backup, values encrypted at
 * rest (currently the SMTP password) will not decrypt after restoring onto a
 * NEW installation and must be re-entered. All other data restores verbatim.
 */

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

const MAGIC = "AXIVO-BACKUP";
const FORMAT_VERSION = 1;

/**
 * Transient/session tables that must not travel across a restore. Sessions are
 * tied to this install's cookie secret, so importing them would be meaningless.
 */
const EXCLUDED_MODELS = new Set(["Session"]);

interface BackupManifest {
  magic: string;
  formatVersion: number;
  appVersion: string;
  createdAt: string;
  tableCounts: Record<string, number>;
  fileCount: number;
}

interface BackupArchive {
  manifest: BackupManifest;
  data: Record<string, Record<string, unknown>[]>;
  files: Record<string, string>;
}

/** Prisma delegate name (camelCase) for a DMMF model name (PascalCase). */
function delegateName(modelName: string): string {
  return modelName[0]!.toLowerCase() + modelName.slice(1);
}

/** Every model we back up, in schema declaration order. */
function backupModels(): string[] {
  return Prisma.dmmf.datamodel.models
    .map((model) => model.name)
    .filter((name) => !EXCLUDED_MODELS.has(name));
}

/** Names of the Json-typed fields per model (needed to restore JSON nulls). */
function jsonFieldsByModel(): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const model of Prisma.dmmf.datamodel.models) {
    const jsonFields = model.fields.filter((field) => field.type === "Json").map((f) => f.name);
    if (jsonFields.length) map.set(model.name, jsonFields);
  }
  return map;
}

// ---------------------------------------------------------------------------
// Backup
// ---------------------------------------------------------------------------

/** Build a .axivo archive (gzip-compressed) of all data and stored files. */
export async function createBackup(): Promise<Buffer> {
  const data: Record<string, Record<string, unknown>[]> = {};
  const tableCounts: Record<string, number> = {};

  for (const model of backupModels()) {
    const delegate = (db as unknown as Record<string, { findMany: () => Promise<unknown[]> }>)[
      delegateName(model)
    ]!;
    const rows = (await delegate.findMany()) as Record<string, unknown>[];
    if (rows.length > 0) {
      data[model] = rows;
      tableCounts[model] = rows.length;
    }
  }

  const files = await readAllStorageFiles();
  const manifest: BackupManifest = {
    magic: MAGIC,
    formatVersion: FORMAT_VERSION,
    appVersion: process.env.AXIVO_VERSION || "dev",
    createdAt: new Date().toISOString(),
    tableCounts,
    fileCount: Object.keys(files).length,
  };

  // Prisma Decimal serializes to a string and Date to an ISO string, both of
  // which Prisma accepts back on write, so no custom encoding is needed.
  const payload = JSON.stringify({ manifest, data, files });
  return gzip(Buffer.from(payload, "utf8"));
}

/** Read every file under STORAGE_PATH as { storageKey: base64 }. */
async function readAllStorageFiles(): Promise<Record<string, string>> {
  const root = path.resolve(env().STORAGE_PATH);
  const files: Record<string, string> = {};

  async function walk(dir: string): Promise<void> {
    let entries: import("node:fs").Dirent[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return; // storage directory may not exist yet on a fresh install
    }
    for (const entry of entries) {
      const absolute = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(absolute);
      } else if (entry.isFile()) {
        const key = path.relative(root, absolute).split(path.sep).join("/");
        files[key] = (await fs.readFile(absolute)).toString("base64");
      }
    }
  }

  await walk(root);
  return files;
}

// ---------------------------------------------------------------------------
// Restore
// ---------------------------------------------------------------------------

export interface RestoreSummary {
  tables: number;
  rows: number;
  files: number;
  fromVersion: string;
  createdAt: string;
}

/**
 * Replace all data with the contents of a .axivo archive. Runs as one atomic
 * transaction with foreign-key checks deferred, so tables can be wiped and
 * re-inserted in any order. Sessions are cleared, forcing everyone (including
 * the caller) to sign in again afterwards.
 */
export async function restoreBackup(archive: Buffer): Promise<RestoreSummary> {
  let parsed: BackupArchive;
  try {
    const json = (await gunzip(archive)).toString("utf8");
    parsed = JSON.parse(json) as BackupArchive;
  } catch {
    throw new BusinessRuleError("This file is not a readable Axivo backup.");
  }
  if (parsed?.manifest?.magic !== MAGIC) {
    throw new BusinessRuleError("This is not a valid Axivo backup file.");
  }

  const models = backupModels();
  const jsonFields = jsonFieldsByModel();
  let rowCount = 0;

  await db.$transaction(
    async (tx) => {
      // Disable FK/trigger enforcement for this transaction so wipe + reload
      // order does not matter. Requires a superuser DB role (the default for
      // the bundled Postgres). SET LOCAL auto-resets at transaction end.
      await tx.$executeRawUnsafe("SET LOCAL session_replication_role = 'replica'");

      // Wipe everything (including sessions), then reload from the archive.
      await tx.session.deleteMany({});
      for (const model of models) {
        await (tx as unknown as Record<string, { deleteMany: (a: object) => Promise<unknown> }>)[
          delegateName(model)
        ]!.deleteMany({});
      }

      for (const model of models) {
        const rows = parsed.data[model];
        if (!rows?.length) continue;
        const jsonCols = jsonFields.get(model);
        const prepared = jsonCols ? rows.map((row) => fixJsonNulls(row, jsonCols)) : rows;
        const delegate = (
          tx as unknown as Record<string, { createMany: (a: object) => Promise<unknown> }>
        )[delegateName(model)]!;
        for (const chunk of chunked(prepared, 500)) {
          await delegate.createMany({ data: chunk });
          rowCount += chunk.length;
        }
      }
    },
    { timeout: 180_000, maxWait: 20_000 },
  );

  await restoreStorageFiles(parsed.files);

  return {
    tables: Object.keys(parsed.data).length,
    rows: rowCount,
    files: Object.keys(parsed.files ?? {}).length,
    fromVersion: parsed.manifest.appVersion,
    createdAt: parsed.manifest.createdAt,
  };
}

/**
 * Prisma rejects a bare `null` for Json columns (it wants Prisma.DbNull), so
 * translate any null Json value to a database NULL.
 */
function fixJsonNulls(row: Record<string, unknown>, jsonCols: string[]): Record<string, unknown> {
  let clone: Record<string, unknown> | null = null;
  for (const col of jsonCols) {
    if (row[col] === null) {
      clone ??= { ...row };
      clone[col] = Prisma.DbNull;
    }
  }
  return clone ?? row;
}

/** Write the archive's files back under STORAGE_PATH, replacing any present. */
async function restoreStorageFiles(files: Record<string, string> = {}): Promise<void> {
  const root = path.resolve(env().STORAGE_PATH);
  for (const [key, base64] of Object.entries(files)) {
    // Guard against path traversal in a crafted archive.
    const absolute = path.resolve(root, key);
    if (absolute !== root && !absolute.startsWith(root + path.sep)) continue;
    await fs.mkdir(path.dirname(absolute), { recursive: true });
    await fs.writeFile(absolute, Buffer.from(base64, "base64"));
  }
}

function* chunked<T>(items: T[], size: number): Generator<T[]> {
  for (let i = 0; i < items.length; i += size) {
    yield items.slice(i, i + size);
  }
}
