/**
 * Pure helpers for switch connections (SDS Doc 24): port names, device-name
 * matching and the column map of a neighbour table. No server imports, so the
 * unit tests and the dialogs can share them.
 */

const LONG_PORTS: [RegExp, string][] = [
  [/^hundredgig(abit)?e(thernet)?/i, "Hu"],
  [/^fortygig(abit)?e(thernet)?/i, "Fo"],
  [/^twentyfivegig(abit)?e(thernet)?/i, "Twe"],
  [/^tengig(abit)?e(thernet)?/i, "Te"],
  [/^gigabitethernet/i, "Gi"],
  [/^fastethernet/i, "Fa"],
  [/^port-?channel/i, "Po"],
  [/^ethernet/i, "Eth"],
];
const SHORT_PORTS: Record<string, string> = { hu: "Hu", fo: "Fo", twe: "Twe", te: "Te", gi: "Gi", fa: "Fa", po: "Po", eth: "Eth" };

/**
 * One spelling per port, so a cable typed by hand and the same cable read from
 * CDP agree: "GigabitEthernet1/0/1", "gi 1/0/1" and "Gi1/0/1" all become
 * "Gi1/0/1". Ports without a known prefix (Aruba "24", "1/1/24") are kept.
 */
export function normalizePort(raw: string | null | undefined): string | null {
  const value = raw?.trim().replace(/\s+/g, "");
  if (!value) return null;
  for (const [pattern, short] of LONG_PORTS) {
    if (pattern.test(value)) return short + value.replace(pattern, "");
  }
  const match = /^(twe|hu|fo|te|gi|fa|po|eth)(?=\d)/i.exec(value);
  if (match) return SHORT_PORTS[match[1]!.toLowerCase()]! + value.slice(match[1]!.length);
  return value;
}

/** Comparison key for a port: case does not matter. */
export function portKey(port: string | null | undefined): string {
  return normalizePort(port)?.toLowerCase() ?? "";
}

const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;

/**
 * Comparison key for a device name as neighbour tables print it: CDP adds the
 * domain ("BOH-RES-SW03.crossroadsmv.local") and some platforms the serial
 * ("CORE(FDO1234)"), neither of which is part of the name people use.
 */
export function deviceKey(raw: string | null | undefined): string {
  let value = raw?.trim() ?? "";
  if (!value) return "";
  if (IPV4.test(value)) return value;
  value = value.replace(/\([^)]*\)\s*$/, "");
  const dot = value.indexOf(".");
  if (dot > 0) value = value.slice(0, dot);
  return value.trim().toLowerCase();
}

/** A connection's identity, the same whichever end it was read from. */
export function linkKey(deviceA: string, portA: string | null, deviceB: string, portB: string | null): string {
  const ends = [`${deviceA}|${portKey(portA)}`, `${deviceB}|${portKey(portB)}`].sort();
  return `${ends[0]}~${ends[1]}`;
}

// ---------------------------------------------------------------------------
// Neighbour table columns
// ---------------------------------------------------------------------------

export const LINK_FIELDS = ["device", "deviceIp", "port", "neighbour", "neighbourIp", "neighbourPort", "neighbourType"] as const;
export type LinkField = (typeof LINK_FIELDS)[number];

export const LINK_FIELD_LABELS: Record<LinkField, string> = {
  device: "Device",
  deviceIp: "Device IP",
  port: "Port",
  neighbour: "Connected to",
  neighbourIp: "Connected device IP",
  neighbourPort: "Its port",
  neighbourType: "Neighbour type",
};

const LINK_ALIASES: Record<LinkField, string[]> = {
  device: ["switch", "device", "localdevice", "hostname", "sourcedevice", "fromdevice", "from", "switchname", "devicename"],
  deviceIp: ["switchip", "deviceip", "localip", "sourceip", "fromip"],
  port: ["localport", "localinterface", "localif", "port", "interface", "sourceport", "fromport", "switchport"],
  neighbour: [
    "neighbour", "neighbor", "neighbourdevice", "neighbordevice", "neighbourname", "neighborname", "remotedevice",
    "deviceid", "connectedto", "todevice", "to", "systemname",
  ],
  neighbourIp: ["neighbourip", "neighborip", "remoteip", "toip", "managementip"],
  neighbourPort: ["neighbourport", "neighborport", "remoteport", "remoteinterface", "portid", "toport", "itsport"],
  neighbourType: ["neighbourtype", "neighbortype", "remotetype"],
};

function normalizeHeader(header: string): string {
  return header.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export interface LinkColumns {
  fields: Partial<Record<LinkField, number>>;
  headers: string[];
}

export function mapLinkColumns(headers: string[]): LinkColumns {
  const fields: Partial<Record<LinkField, number>> = {};
  headers.forEach((header, index) => {
    const key = normalizeHeader(header ?? "");
    if (!key) return;
    for (const field of LINK_FIELDS) {
      if (fields[field] === undefined && LINK_ALIASES[field].includes(key)) {
        fields[field] = index;
        return;
      }
    }
  });
  return { fields, headers };
}

function usable(columns: LinkColumns): boolean {
  const f = columns.fields;
  return f.device !== undefined && f.neighbour !== undefined && (f.port !== undefined || f.neighbourPort !== undefined);
}

export interface LinkSheet {
  name: string;
  /** 1-based row of the headings. */
  headerRow: number;
  columns: LinkColumns;
  rows: { row: number; cells: string[] }[];
}

/**
 * The sheet that holds a neighbour table: the one whose headings (in any of
 * its first five rows) name a device, what it connects to, and a port.
 */
export function pickLinkSheet(sheets: { name: string; rows: string[][] }[]): LinkSheet | null {
  let best: { sheet: LinkSheet; score: number } | null = null;
  for (const sheet of sheets) {
    for (let index = 0; index < Math.min(5, sheet.rows.length); index += 1) {
      const columns = mapLinkColumns((sheet.rows[index] ?? []).map((cell) => String(cell ?? "").trim()));
      if (!usable(columns)) continue;
      const score = Object.keys(columns.fields).length;
      if (!best || score > best.score) {
        best = {
          score,
          sheet: {
            name: sheet.name,
            headerRow: index + 1,
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

export function cell(sheet: LinkSheet, cells: string[], field: LinkField): string {
  const index = sheet.columns.fields[field];
  return index === undefined ? "" : (cells[index] ?? "").trim();
}
