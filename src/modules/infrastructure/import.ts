import crypto from "node:crypto";
import ExcelJS from "exceljs";
import { db } from "@/shared/db";
import { recordAudit } from "@/shared/audit/audit";
import { encryptSecret, decryptSecret } from "@/shared/crypto/encryption";
import { BusinessRuleError, ValidationError } from "@/shared/errors";
import { companyFilter, findDeviceByName, type Scope } from "./service";
import { isIpAddress, type DeviceKind } from "./validators";
import {
  pickSheet, parseCsv, companyKey, typeKey, suggestCompany, suggestType, parseStatus,
  FIELD_LABELS, IMPORT_FIELDS, type ImportField, type ParsedSheet,
} from "./import-parse";

/**
 * Infrastructure import (SDS Doc 24): preview, then commit.
 *
 * The browser sends the file twice - once for the preview, once to import -
 * so no parsed data, and in particular no password, is held on the server
 * between the two steps or sent to the browser in between. The preview only
 * tells the browser which rows share a login, through a fingerprint salted
 * with a secret that never leaves this request.
 */

const MAX_BYTES = 5 * 1024 * 1024;
const MAX_ROWS = 5000;

async function readSheets(file: File): Promise<{ name: string; rows: string[][] }[]> {
  if (file.size === 0) throw new ValidationError(undefined, { file: "Choose a file to import." });
  if (file.size > MAX_BYTES) throw new ValidationError(undefined, { file: "The file is larger than 5 MB." });
  const buffer = Buffer.from(await file.arrayBuffer());
  const lower = file.name.toLowerCase();
  if (lower.endsWith(".csv")) {
    return [{ name: file.name, rows: parseCsv(buffer.toString("utf8")) }];
  }
  if (!lower.endsWith(".xlsx") && !lower.endsWith(".xlsm")) {
    throw new ValidationError(undefined, { file: "Use an Excel (.xlsx) or CSV file." });
  }
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  } catch {
    throw new ValidationError(undefined, { file: "This file could not be read as an Excel workbook." });
  }
  return workbook.worksheets.map((sheet) => {
    const rows: string[][] = [];
    sheet.eachRow({ includeEmpty: true }, (row, rowNumber) => {
      const cells: string[] = [];
      row.eachCell({ includeEmpty: true }, (cell, col) => {
        cells[col - 1] = cellText(cell);
      });
      rows[rowNumber - 1] = cells;
    });
    return { name: sheet.name, rows: Array.from(rows, (r) => r ?? []) };
  });
}

function cellText(cell: ExcelJS.Cell): string {
  const value = cell.value;
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object") {
    if ("richText" in value) return value.richText.map((part) => part.text).join("");
    if ("result" in value) return value.result === undefined || value.result === null ? "" : String(value.result);
    if ("text" in value) return String(value.text);
    if ("error" in value) return "";
  }
  return String(value);
}

async function parseFile(file: File): Promise<ParsedSheet> {
  const sheet = pickSheet(await readSheets(file));
  if (!sheet) {
    throw new ValidationError(undefined, {
      file: "No sheet has a Name, Description or Hostname column, so there is nothing to import.",
    });
  }
  if (sheet.rows.length === 0) throw new ValidationError(undefined, { file: "The sheet has headings but no rows." });
  if (sheet.rows.length > MAX_ROWS) throw new ValidationError(undefined, { file: `Import at most ${MAX_ROWS} rows at a time.` });
  return sheet;
}

function has(sheet: ParsedSheet, field: ImportField) {
  return sheet.columns.fields[field] !== undefined;
}

// ---------------------------------------------------------------------------
// Preview
// ---------------------------------------------------------------------------

export interface PreviewRow {
  row: number;
  name: string;
  hostname: string | null;
  ipAddress: string | null;
  companyKey: string;
  typeKey: string;
  manufacturer: string | null;
  model: string | null;
  serialNumber: string | null;
  operatingSystem: string | null;
  version: string | null;
  location: string | null;
  username: string | null;
  /** Rows with equal fingerprints carry the same username and password. */
  loginFingerprint: string | null;
  /** Companies in which a device of this name already exists. */
  existsIn: string[];
  problems: string[];
}

export interface ImportPreview {
  fileName: string;
  sheetName: string;
  headerRow: number;
  columns: { field: ImportField; label: string; header: string }[];
  ignoredHeaders: string[];
  companyKeys: { key: string; count: number; suggestedCompanyId: string | null }[];
  typeKeys: { key: string; count: number; suggestedTypeId: string | null }[];
  rows: PreviewRow[];
}

export async function previewImport(scope: Scope, kind: DeviceKind, file: File): Promise<ImportPreview> {
  const sheet = await parseFile(file);
  const [companies, types] = await Promise.all([
    db.company.findMany({
      where: { deletedAt: null, isActive: true, ...(scope.isGlobalAdmin ? {} : { id: scope.companyId }) },
      select: { id: true, name: true },
    }),
    db.infraDeviceType.findMany({ where: { deletedAt: null, isActive: true }, select: { id: true, name: true, kind: true } }),
  ]);
  const hasCompany = has(sheet, "company");
  const hasType = has(sheet, "type");
  const hasOs = has(sheet, "operatingSystem");
  const salt = crypto.randomBytes(32);

  const names = sheet.rows.map((row) => row.values.name).filter((name): name is string => !!name);
  const existing = await db.infraDevice.findMany({
    where: { deletedAt: null, ...companyFilter(scope), name: { in: names, mode: "insensitive" } },
    select: { name: true, companyId: true },
  });
  const existsByName = new Map<string, string[]>();
  for (const device of existing) {
    const key = device.name.toLowerCase();
    existsByName.set(key, [...(existsByName.get(key) ?? []), device.companyId]);
  }

  const companyCounts = new Map<string, number>();
  const typeCounts = new Map<string, number>();
  const rows: PreviewRow[] = sheet.rows.map((parsed) => {
    const v = parsed.values;
    const cKey = companyKey(parsed, hasCompany);
    const tKey = typeKey(parsed, hasType, hasOs);
    companyCounts.set(cKey, (companyCounts.get(cKey) ?? 0) + 1);
    typeCounts.set(tKey, (typeCounts.get(tKey) ?? 0) + 1);
    const problems: string[] = [];
    if (!v.name) problems.push("No name - this row will be skipped");
    if (v.ipAddress && !isIpAddress(v.ipAddress)) problems.push(`"${v.ipAddress}" is not an IP address - it will be left blank`);
    const hasLogin = !!(v.username || v.password);
    return {
      row: parsed.row,
      name: v.name ?? "",
      hostname: v.hostname && v.hostname !== v.name ? v.hostname : null,
      ipAddress: v.ipAddress ?? null,
      companyKey: cKey,
      typeKey: tKey,
      manufacturer: v.manufacturer ?? null,
      model: v.model ?? null,
      serialNumber: v.serialNumber ?? null,
      operatingSystem: v.operatingSystem ?? null,
      version: v.version ?? null,
      location: v.location ?? null,
      username: v.username ?? null,
      loginFingerprint: hasLogin
        ? crypto.createHmac("sha256", salt).update(`${v.username ?? ""}\u0000${v.password ?? ""}`).digest("hex").slice(0, 16)
        : null,
      existsIn: v.name ? (existsByName.get(v.name.toLowerCase()) ?? []) : [],
      problems,
    };
  });

  return {
    fileName: file.name,
    sheetName: sheet.sheetName,
    headerRow: sheet.headerRow,
    columns: IMPORT_FIELDS.filter((field) => sheet.columns.fields[field] !== undefined)
      .map((field) => [field] as const)
      .filter(([field]) => !(field === "hostname" && sheet.columns.fields.hostname === sheet.columns.fields.name))
      .map(([field]) => ({ field, label: FIELD_LABELS[field], header: sheet.columns.headers[field] ?? "" })),
    ignoredHeaders: sheet.columns.ignored,
    companyKeys: [...companyCounts].map(([key, count]) => ({ key, count, suggestedCompanyId: suggestCompany(key, companies) })),
    typeKeys: [...typeCounts].map(([key, count]) => ({ key, count, suggestedTypeId: suggestType(key, kind, types) })),
    rows,
  };
}

// ---------------------------------------------------------------------------
// Commit
// ---------------------------------------------------------------------------

export interface ImportOptions {
  kind: DeviceKind;
  /** Company key -> company id; blank skips those rows. */
  companyMap: Record<string, string>;
  /** Type key -> device type id; blank skips those rows. */
  typeMap: Record<string, string>;
  /** What to do with a device that already exists in the mapped company. */
  existing: "update" | "skip";
  importLogins: boolean;
  /** Sheet row numbers the user unticked. */
  excludedRows: number[];
}

export interface ImportResult {
  created: number;
  updated: number;
  skipped: { row: number; name: string; reason: string }[];
  credentialSetsCreated: number;
  credentialSetsReused: number;
  credentialLinks: number;
  manufacturersCreated: string[];
}

export async function commitImport(scope: Scope, file: File, options: ImportOptions): Promise<ImportResult> {
  const sheet = await parseFile(file);
  const hasCompany = has(sheet, "company");
  const hasType = has(sheet, "type");
  const hasOs = has(sheet, "operatingSystem");
  const excluded = new Set(options.excludedRows);

  const companyIds = [...new Set(Object.values(options.companyMap).filter(Boolean))];
  const companies = await db.company.findMany({
    where: { id: { in: companyIds }, deletedAt: null, isActive: true, ...(scope.isGlobalAdmin ? {} : { id: scope.companyId }) },
    select: { id: true, name: true },
  });
  if (companies.length !== companyIds.length) throw new BusinessRuleError("One of the chosen companies is not available.");
  const companyName = new Map(companies.map((c) => [c.id, c.name]));

  const typeIds = [...new Set(Object.values(options.typeMap).filter(Boolean))];
  const types = await db.infraDeviceType.findMany({ where: { id: { in: typeIds }, deletedAt: null, isActive: true } });
  if (types.length !== typeIds.length) throw new BusinessRuleError("One of the chosen device types is not available.");
  const typeById = new Map(types.map((t) => [t.id, t]));
  if (types.some((t) => t.kind !== options.kind)) {
    throw new BusinessRuleError(
      options.kind === "NETWORK" ? "Choose network device types for this import." : "Choose server types for this import.",
    );
  }

  const [manufacturers, locations] = await Promise.all([
    db.manufacturer.findMany({ where: { deletedAt: null }, select: { id: true, name: true } }),
    db.location.findMany({ where: { companyId: { in: companyIds }, deletedAt: null }, select: { id: true, name: true, companyId: true } }),
  ]);
  const manufacturerByName = new Map(manufacturers.map((m) => [m.name.toLowerCase(), m.id]));
  const locationByKey = new Map(locations.map((l) => [`${l.companyId}|${l.name.toLowerCase()}`, l.id]));

  const result: ImportResult = {
    created: 0, updated: 0, skipped: [], credentialSetsCreated: 0, credentialSetsReused: 0, credentialLinks: 0, manufacturersCreated: [],
  };
  const actor = scope.audit.actorUserId ?? null;

  await db.$transaction(
    async (tx) => {
      const seen = new Set<string>();
      /** companyId|username|password -> credential set id */
      const loginSets = new Map<string, string>();
      const existingSets = options.importLogins
        ? await tx.credentialSet.findMany({
            where: { companyId: { in: companyIds }, deletedAt: null },
            select: { id: true, companyId: true, name: true, username: true, secretCiphertext: true },
          })
        : [];
      const takenSetNames = new Set(existingSets.map((s) => `${s.companyId}|${s.name.toLowerCase()}`));

      for (const parsed of sheet.rows) {
        const v = parsed.values;
        const name = v.name?.trim();
        const skip = (reason: string) => result.skipped.push({ row: parsed.row, name: name ?? "", reason });
        if (excluded.has(parsed.row)) { skip("Unticked in the preview"); continue; }
        if (!name) { skip("No name"); continue; }
        const companyId = options.companyMap[companyKey(parsed, hasCompany)];
        if (!companyId) { skip("No company chosen for it"); continue; }
        const typeId = options.typeMap[typeKey(parsed, hasType, hasOs)];
        const type = typeId ? typeById.get(typeId) : undefined;
        if (!type) { skip("No device type chosen for it"); continue; }
        const dedupeKey = `${companyId}|${name.toLowerCase()}`;
        if (seen.has(dedupeKey)) { skip("Same name appears earlier in the file"); continue; }
        seen.add(dedupeKey);

        let manufacturerId: string | null = null;
        if (v.manufacturer) {
          manufacturerId = manufacturerByName.get(v.manufacturer.toLowerCase()) ?? null;
          if (!manufacturerId) {
            const created = await tx.manufacturer.create({ data: { name: v.manufacturer } });
            manufacturerId = created.id;
            manufacturerByName.set(v.manufacturer.toLowerCase(), created.id);
            result.manufacturersCreated.push(created.name);
          }
        }
        const data = {
          typeId: type.id,
          kind: type.kind,
          hostname: v.hostname && v.hostname !== name ? v.hostname : undefined,
          ipAddress: v.ipAddress && isIpAddress(v.ipAddress) ? v.ipAddress : undefined,
          locationId: v.location ? locationByKey.get(`${companyId}|${v.location.toLowerCase()}`) : undefined,
          manufacturerId: manufacturerId ?? undefined,
          model: v.model,
          serialNumber: v.serialNumber,
          operatingSystem: v.operatingSystem,
          version: v.version,
          domain: v.domain,
          purpose: v.purpose,
          status: parseStatus(v.status) ?? undefined,
          notes: v.notes,
        };

        const found = await findDeviceByName(tx, companyId, name);
        let deviceId: string;
        if (found) {
          if (options.existing === "skip") { skip("Already in the register"); continue; }
          // Only cells that have a value overwrite: a blank cell in the file
          // never wipes something already recorded.
          await tx.infraDevice.update({ where: { id: found.id }, data: { ...data, updatedById: actor } });
          deviceId = found.id;
          result.updated += 1;
        } else {
          const created = await tx.infraDevice.create({
            data: { ...data, companyId, name, status: data.status ?? "ACTIVE", createdById: actor },
          });
          deviceId = created.id;
          result.created += 1;
        }

        if (options.importLogins && (v.username || v.password)) {
          const loginKey = `${companyId}|${v.username ?? ""}\u0000${v.password ?? ""}`;
          let setId = loginSets.get(loginKey);
          if (!setId) {
            const match = existingSets.find(
              (s) => s.companyId === companyId && (s.username ?? "") === (v.username ?? "")
                && (s.secretCiphertext ? decryptSecret(s.secretCiphertext) : "") === (v.password ?? ""),
            );
            if (match) {
              setId = match.id;
              result.credentialSetsReused += 1;
            } else {
              const base = `${v.username || "Login"} (imported)`;
              let setName = base;
              for (let n = 2; takenSetNames.has(`${companyId}|${setName.toLowerCase()}`); n += 1) setName = `${base} ${n}`;
              takenSetNames.add(`${companyId}|${setName.toLowerCase()}`);
              const created = await tx.credentialSet.create({
                data: {
                  companyId,
                  name: setName,
                  username: v.username ?? null,
                  secretCiphertext: v.password ? encryptSecret(v.password) : null,
                  passwordChangedAt: v.password ? new Date() : null,
                  notes: `Imported from ${file.name}`,
                  createdById: actor,
                },
              });
              setId = created.id;
              result.credentialSetsCreated += 1;
              await recordAudit(
                { ...scope.audit, companyId },
                {
                  module: "infrastructure",
                  eventType: "credential.created",
                  action: `Created credential set "${setName}" from ${file.name}`,
                  targetType: "credential_set",
                  targetId: created.id,
                  targetLabel: setName,
                },
                tx,
              );
            }
            loginSets.set(loginKey, setId);
          }
          const link = await tx.infraDeviceCredential.upsert({
            where: { deviceId_credentialSetId: { deviceId, credentialSetId: setId } },
            create: { deviceId, credentialSetId: setId, purpose: "Login", createdById: actor },
            update: {},
          });
          if (link) result.credentialLinks += 1;
        }
      }

      await recordAudit(
        scope.audit,
        {
          module: "infrastructure",
          eventType: "device.imported",
          action: `Imported ${options.kind === "NETWORK" ? "network devices" : "servers"} from ${file.name}: ${result.created} added, ${result.updated} updated, ${result.skipped.length} skipped${options.importLogins ? `, ${result.credentialSetsCreated} credential sets created` : ""}`,
          targetType: "import",
          targetLabel: file.name,
          details: {
            sheet: sheet.sheetName,
            created: result.created,
            updated: result.updated,
            skipped: result.skipped.length,
            credentialSetsCreated: result.credentialSetsCreated,
            credentialSetsReused: result.credentialSetsReused,
            credentialLinks: result.credentialLinks,
            manufacturersCreated: result.manufacturersCreated,
            companies: companyIds.map((id) => companyName.get(id) ?? id),
          },
        },
        tx,
      );
    },
    { timeout: 120_000, maxWait: 10_000 },
  );
  return result;
}
