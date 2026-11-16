/**
 * Spreadsheet parsing for the infrastructure import (SDS Doc 24). Pure
 * functions with no database access, so the column matching and grouping
 * rules can be unit tested.
 */

export const IMPORT_FIELDS = [
  "name", "hostname", "ipAddress", "company", "type", "manufacturer", "model", "serialNumber",
  "operatingSystem", "version", "domain", "location", "purpose", "status", "notes", "username", "password",
] as const;
export type ImportField = (typeof IMPORT_FIELDS)[number];

export const FIELD_LABELS: Record<ImportField, string> = {
  name: "Name",
  hostname: "Hostname",
  ipAddress: "IP address",
  company: "Company",
  type: "Device type",
  manufacturer: "Manufacturer",
  model: "Model",
  serialNumber: "Serial number",
  operatingSystem: "Operating system",
  version: "Version / firmware",
  domain: "Domain",
  location: "Location",
  purpose: "Purpose",
  status: "Status",
  notes: "Notes",
  username: "Username",
  password: "Password",
};

/** Headings recognised for each field, compared lower-case with punctuation removed. */
const ALIASES: Record<ImportField, string[]> = {
  name: ["name", "description", "devicename", "device", "servername", "server"],
  hostname: ["hostname", "dnsname", "realhostnamedns", "fqdn", "host"],
  ipAddress: ["ipaddress", "ip", "mgmtip", "managementip", "ipv4", "ipv4address"],
  company: ["company", "property", "companyname", "entity"],
  type: ["type", "devicetype", "category"],
  manufacturer: ["manufacturer", "vendor", "make", "brand"],
  model: ["model", "modelnumber", "modelno"],
  serialNumber: ["serial", "serialnumber", "sn", "serialno"],
  operatingSystem: ["os", "operatingsystem"],
  version: ["firmware", "version", "osversion", "firmwareversion", "softwareversion"],
  domain: ["domain", "domainname"],
  location: ["location", "site", "room", "rack"],
  purpose: ["purpose", "role", "function", "usage"],
  status: ["status", "state"],
  notes: ["notes", "remark", "remarks", "comment", "comments"],
  username: ["username", "user", "login", "loginname", "userid"],
  password: ["password", "pass", "passwd", "pwd"],
};

export function normHeader(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export interface ColumnMap {
  /** Field -> zero-based column index. */
  fields: Partial<Record<ImportField, number>>;
  /** The heading each field was found under, as written in the file. */
  headers: Partial<Record<ImportField, string>>;
  /** Headings that matched nothing, for the preview to list. */
  ignored: string[];
}

/**
 * Match a header row to fields. A sheet with both a Name/Description column
 * and a Hostname column keeps them apart; a sheet with only Hostname uses it
 * as the name too.
 */
export function mapColumns(headers: string[]): ColumnMap {
  const fields: Partial<Record<ImportField, number>> = {};
  const used = new Set<number>();
  const normalised = headers.map((header) => normHeader(header ?? ""));
  for (const field of IMPORT_FIELDS) {
    for (const alias of ALIASES[field]) {
      const index = normalised.findIndex((value, i) => value === alias && !used.has(i));
      if (index >= 0) {
        fields[field] = index;
        used.add(index);
        break;
      }
    }
  }
  if (fields.name === undefined && fields.hostname !== undefined) {
    fields.name = fields.hostname;
  }
  const ignored = headers.filter((header, i) => header && header.trim() && !used.has(i)).map((h) => h.trim());
  const found: Partial<Record<ImportField, string>> = {};
  for (const [field, index] of Object.entries(fields) as [ImportField, number][]) {
    found[field] = (headers[index] ?? "").trim();
  }
  return { fields, headers: found, ignored };
}

export interface ParsedRow {
  /** 1-based row number in the sheet, for messages. */
  row: number;
  values: Partial<Record<ImportField, string>>;
}

export interface ParsedSheet {
  sheetName: string;
  headerRow: number;
  columns: ColumnMap;
  rows: ParsedRow[];
}

/**
 * Pick the sheet and header row that recognise the most columns. Workbooks
 * often open with a summary sheet, and some have a title above the headings,
 * so the first five rows of every sheet are tried.
 */
export function pickSheet(sheets: { name: string; rows: string[][] }[]): ParsedSheet | null {
  let best: { score: number; sheet: ParsedSheet } | null = null;
  for (const sheet of sheets) {
    for (let headerIndex = 0; headerIndex < Math.min(5, sheet.rows.length); headerIndex += 1) {
      const columns = mapColumns(sheet.rows[headerIndex] ?? []);
      if (columns.fields.name === undefined) continue;
      const score = Object.keys(columns.fields).length;
      if (best && best.score >= score) continue;
      const rows: ParsedRow[] = [];
      sheet.rows.slice(headerIndex + 1).forEach((cells, offset) => {
        const values: Partial<Record<ImportField, string>> = {};
        for (const [field, index] of Object.entries(columns.fields) as [ImportField, number][]) {
          const raw = (cells[index] ?? "").trim();
          if (raw) values[field] = raw;
        }
        if (Object.keys(values).length > 0) rows.push({ row: headerIndex + offset + 2, values });
      });
      best = { score, sheet: { sheetName: sheet.name, headerRow: headerIndex + 1, columns, rows } };
    }
  }
  return best?.sheet ?? null;
}

/** Minimal RFC 4180 CSV reader: quoted fields, doubled quotes, CRLF or LF. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const input = text.replace(/^﻿/, "");
  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i]!;
    if (quoted) {
      if (ch === '"' && input[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (ch === '"') {
        quoted = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && input[i + 1] === "\n") i += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += ch;
    }
  }
  if (field || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

export const NO_COMPANY = "(blank)";
export const ALL_ROWS = "(all rows)";

/**
 * The value a row is grouped by for the company mapping: its company column,
 * or, with no such column, the letters its name starts with (CXR-FS -> CXR,
 * SHRMV0639 -> SHRMV), which is how these lists encode the owner.
 */
export function companyKey(row: ParsedRow, hasCompanyColumn: boolean): string {
  if (hasCompanyColumn) return row.values.company?.trim() || NO_COMPANY;
  const prefix = row.values.name?.match(/^[A-Za-z]+/)?.[0];
  return prefix ? prefix.toUpperCase() : NO_COMPANY;
}

/** Grouping for the type mapping: the type column, else the OS, else everything. */
export function typeKey(row: ParsedRow, hasTypeColumn: boolean, hasOsColumn: boolean): string {
  if (hasTypeColumn) return row.values.type?.trim() || ALL_ROWS;
  if (hasOsColumn) return row.values.operatingSystem?.trim() || ALL_ROWS;
  return ALL_ROWS;
}

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).map((word) => word[0]!.toLowerCase()).join("");
}

/** Best guess of the company a key means: exact name, name prefix, or initials. */
export function suggestCompany(key: string, companies: { id: string; name: string }[]): string | null {
  const k = normHeader(key);
  if (!k) return null;
  const match =
    companies.find((c) => normHeader(c.name) === k) ??
    (k.length >= 3 ? companies.find((c) => normHeader(c.name).startsWith(k)) : undefined) ??
    companies.find((c) => initials(c.name) === k);
  return match?.id ?? null;
}

const TYPE_HINTS: { pattern: RegExp; type: string }[] = [
  { pattern: /synology|\bdsm\b|qnap|\bnas\b|storage/i, type: "NAS / Storage" },
  { pattern: /esxi|proxmox|hyper-?v|xcp|vmware/i, type: "Hypervisor" },
  { pattern: /firepower|fortigate|palo ?alto|asa\b|firewall|sophos/i, type: "Firewall" },
  { pattern: /wireless|wlc|c9800|airos/i, type: "Wireless Controller" },
  { pattern: /router|isr\d/i, type: "Router" },
  { pattern: /switch/i, type: "Switch" },
];

/** Best guess of the device type for a key; falls back to the kind's usual type. */
export function suggestType(
  key: string,
  kind: "NETWORK" | "SERVER",
  types: { id: string; name: string; kind: string }[],
): string | null {
  const ofKind = types.filter((t) => t.kind === kind);
  const byName = (name: string) => ofKind.find((t) => normHeader(t.name) === normHeader(name));
  const exact = byName(key);
  if (exact) return exact.id;
  for (const hint of TYPE_HINTS) {
    if (hint.pattern.test(key)) {
      const type = byName(hint.type);
      if (type) return type.id;
    }
  }
  const fallback = byName(kind === "NETWORK" ? "Switch" : "Virtual Machine") ?? ofKind[0];
  return fallback?.id ?? null;
}

/** Map a free-text status onto the register's statuses; unknown text is ignored. */
export function parseStatus(value: string | undefined): "ACTIVE" | "STANDBY" | "DECOMMISSIONED" | null {
  if (!value) return null;
  const v = value.toLowerCase();
  if (/decom|retired|removed|disposed/.test(v)) return "DECOMMISSIONED";
  if (/standby|stand-by|spare|cold|powered off|turned off/.test(v)) return "STANDBY";
  if (/^(active|in use|live|running|online|production)$/.test(v.trim())) return "ACTIVE";
  return null;
}
