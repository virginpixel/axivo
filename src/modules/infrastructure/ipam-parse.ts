import { normHeader } from "./import-parse";
import { ipToNumber, isIpv4, normalizeMac, parseCidr, type Cidr } from "./ip-math";

/**
 * Reading VLAN plans and address lists from spreadsheets (SDS Doc 24). Pure:
 * the discovery workbooks ("VLAN plan" and "Live devices" sheets) read as
 * they are, and so does a plain sheet with the usual headings.
 */

export const PLAN_FIELDS = ["company", "vlan", "name", "subnet", "mask", "gateway", "dhcpRelay", "status", "purpose", "notes"] as const;
export type PlanField = (typeof PLAN_FIELDS)[number];

export const ADDRESS_FIELDS = ["company", "ip", "hostname", "mac", "vendor", "switch", "port", "knownAs", "status", "description"] as const;
export type AddressField = (typeof ADDRESS_FIELDS)[number];

const PLAN_ALIASES: Record<PlanField, string[]> = {
  company: ["site", "company", "property"],
  vlan: ["vlan", "vlanid", "vlanno", "vlannumber", "id"],
  name: ["name", "vlanname", "description"],
  subnet: ["subnet", "network", "iprange", "range", "cidr", "subnetcidr", "ipsubnet"],
  mask: ["mask", "subnetmask", "netmask", "prefix"],
  gateway: ["gateway", "gatewayswitch", "defaultgateway", "gw"],
  dhcpRelay: ["dhcprelay", "helperaddress", "iphelper", "dhcp"],
  status: ["status", "suggested", "inuse"],
  purpose: ["purpose", "use", "usedfor"],
  notes: ["notes", "remark", "remarks", "comment", "comments"],
};

const ADDRESS_ALIASES: Record<AddressField, string[]> = {
  company: ["site", "company", "property"],
  ip: ["ip", "ipaddress", "address", "ipv4"],
  hostname: ["dnsname", "hostname", "host", "name", "devicename"],
  mac: ["mac", "macaddress"],
  vendor: ["macvendor", "vendor", "manufacturer"],
  switch: ["switch", "seenon", "switchname"],
  port: ["port", "switchport", "interface"],
  knownAs: ["knownas"],
  status: ["status"],
  description: ["description", "notes", "remark", "remarks"],
};

export interface Sheet<F extends string> {
  name: string;
  columns: Partial<Record<F, number>>;
  rows: { row: number; cells: string[] }[];
}

function mapColumns<F extends string>(headers: string[], aliases: Record<F, string[]>): Partial<Record<F, number>> {
  const columns: Partial<Record<F, number>> = {};
  headers.forEach((header, index) => {
    const key = normHeader(header ?? "");
    if (!key) return;
    for (const field of Object.keys(aliases) as F[]) {
      if (columns[field] === undefined && aliases[field].includes(key)) {
        columns[field] = index;
        return;
      }
    }
  });
  return columns;
}

/** The sheet whose headings (in its first five rows) fit best; ties go to the earlier sheet. */
function pick<F extends string>(
  sheets: { name: string; rows: string[][] }[],
  aliases: Record<F, string[]>,
  usable: (columns: Partial<Record<F, number>>) => boolean,
  preferred: RegExp,
): Sheet<F> | null {
  let best: { sheet: Sheet<F>; score: number } | null = null;
  for (const sheet of sheets) {
    for (let index = 0; index < Math.min(5, sheet.rows.length); index += 1) {
      const columns = mapColumns((sheet.rows[index] ?? []).map((c) => String(c ?? "").trim()), aliases);
      if (!usable(columns)) continue;
      const score = Object.keys(columns).length + (preferred.test(sheet.name) ? 100 : 0);
      if (!best || score > best.score) {
        best = {
          score,
          sheet: {
            name: sheet.name,
            columns,
            rows: sheet.rows
              .slice(index + 1)
              .map((cells, offset) => ({ row: index + offset + 2, cells: cells.map((c) => String(c ?? "").trim()) }))
              .filter((r) => r.cells.some(Boolean)),
          },
        };
      }
      break;
    }
  }
  return best?.sheet ?? null;
}

/** A VLAN plan: needs a VLAN column and a name or subnet. The discovery "VLAN plan" sheet wins. */
export function pickPlanSheet(sheets: { name: string; rows: string[][] }[]) {
  // A list of addresses also has VLAN and subnet columns; one IP per row means it is not a plan.
  const withoutAddressLists = sheets.filter((sheet) =>
    sheet.rows.slice(0, 5).every((row) => mapColumns(row.map((c) => String(c ?? "").trim()), ADDRESS_ALIASES).ip === undefined),
  );
  return pick(withoutAddressLists, PLAN_ALIASES, (c) => c.vlan !== undefined && (c.name !== undefined || c.subnet !== undefined), /^vlan plan$/i);
}

/** An address list: needs an IP column. The discovery "Live devices" sheet wins. */
export function pickAddressSheet(sheets: { name: string; rows: string[][] }[]) {
  return pick(sheets, ADDRESS_ALIASES, (c) => c.ip !== undefined, /^live devices$/i);
}

export function value<F extends string>(sheet: Sheet<F>, cells: string[], field: F): string {
  const index = sheet.columns[field];
  return index === undefined ? "" : (cells[index] ?? "").trim();
}

/** "172.20.20.30 (BOH_DC_Core_SW1)" → "172.20.20.30"; the first address in a cell. */
export function firstIp(raw: string): string | null {
  const match = /\d{1,3}(?:\.\d{1,3}){3}/.exec(raw);
  return match && isIpv4(match[0]) ? match[0] : null;
}

export function planStatus(raw: string): "ACTIVE" | "RESERVED" | "UNUSED" {
  const v = raw.toLowerCase();
  if (/not in use|unused|retire|remove|^no$/.test(v)) return "UNUSED";
  if (/reserv|planned|spare/.test(v)) return "RESERVED";
  return "ACTIVE";
}

export interface PlanRow {
  row: number;
  companyText: string;
  number: number;
  name: string;
  cidr: Cidr | null;
  gateway: string | null;
  dhcpRelay: string | null;
  status: "ACTIVE" | "RESERVED" | "UNUSED";
  purpose: string | null;
  notes: string | null;
}

export type ParsedPlanRow = { ok: true; row: PlanRow } | { ok: false; row: number; error: string };

export function parsePlanRow(sheet: Sheet<PlanField>, entry: { row: number; cells: string[] }): ParsedPlanRow {
  const get = (field: PlanField) => value(sheet, entry.cells, field);
  const vlanText = get("vlan");
  const number = Number(vlanText);
  if (!/^\d+$/.test(vlanText) || number < 1 || number > 4094) {
    return { ok: false, row: entry.row, error: `"${vlanText}" is not a VLAN number (1-4094).` };
  }
  let cidr: Cidr | null = null;
  const subnetText = get("subnet");
  if (subnetText) {
    const mask = get("mask");
    const written = subnetText.includes("/") || !mask ? subnetText : `${subnetText} ${mask.replace(/^\//, "")}`;
    const parsed = parseCidr(written);
    if (!parsed.ok) return { ok: false, row: entry.row, error: `VLAN ${number}: ${parsed.error}` };
    cidr = parsed.cidr;
  }
  const relay = get("dhcpRelay");
  return {
    ok: true,
    row: {
      row: entry.row,
      companyText: get("company"),
      number,
      name: get("name") || `VLAN${String(number).padStart(4, "0")}`,
      cidr,
      gateway: firstIp(get("gateway")),
      dhcpRelay: relay ? relay.match(/\d{1,3}(?:\.\d{1,3}){3}/g)?.join(", ") ?? null : null,
      status: planStatus(get("status")),
      purpose: get("purpose") || null,
      notes: get("notes") || null,
    },
  };
}

export interface AddressRow {
  row: number;
  companyText: string;
  address: string;
  addressNum: number;
  hostname: string | null;
  mac: string | null;
  vendor: string | null;
  switchName: string | null;
  switchPort: string | null;
  description: string | null;
  reserved: boolean;
}

export function parseAddressRow(sheet: Sheet<AddressField>, entry: { row: number; cells: string[] }): AddressRow | null {
  const get = (field: AddressField) => value(sheet, entry.cells, field);
  const address = get("ip");
  const addressNum = ipToNumber(address);
  if (addressNum === null) return null;
  const knownAs = get("knownAs");
  const description = [knownAs, get("description")].filter(Boolean).join(" · ");
  return {
    row: entry.row,
    companyText: get("company"),
    address,
    addressNum,
    hostname: get("hostname") || null,
    mac: normalizeMac(get("mac")),
    vendor: get("vendor") || null,
    switchName: get("switch") || null,
    switchPort: get("port") || null,
    description: description || null,
    reserved: /reserv/i.test(get("status")),
  };
}
