import { capexTotal } from "./budget-math";

/**
 * Reading budget spreadsheets (SDS Doc 25). Pure. Two layouts are read as
 * they are: the IT OPEX sheet (one row per item with twelve month columns)
 * and the CAPEX wish list (department sections, each with its own heading
 * row, and groups such as HARDWARE inside them).
 */

type Sheet = { name: string; rows: string[][] };

export interface OpexRow {
  row: number;
  reference: string | null;
  department: string | null;
  description: string;
  vendor: string | null;
  amount: number;
  /** Null when the twelve months are equal: an even spread. */
  months: number[] | null;
  notes: string | null;
}

export interface CapexRow {
  row: number;
  reference: string | null;
  department: string | null;
  description: string;
  category: string | null;
  quantity: number | null;
  unitPrice: number | null;
  associatedCost: number | null;
  amount: number;
  priority: "FIRST" | "MEDIUM" | "WISH_LIST" | null;
  capexType: "REVENUE_GENERATING" | "COST_SAVING" | "REGULAR_REPLACEMENT" | "NEW_OPERATION" | "OTHER" | null;
  period: string | null;
  locationCode: string | null;
  justification: string | null;
}

export interface Parsed<T> {
  sheet: string;
  lines: T[];
  leftOut: { row: number; text: string; reason: string }[];
}

const MONTH_NAMES = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const norm = (value: string | undefined) => (value ?? "").toLowerCase().replace(/\s+/g, " ").trim();
const text = (value: string | undefined) => {
  const t = (value ?? "").replace(/\s+/g, " ").trim();
  return t ? t : null;
};

/** "1,200.50", "$ 450", "-" → number or null. */
export function money(value: string | undefined): number | null {
  const cleaned = (value ?? "").replace(/[$,\s]/g, "").replace(/^usd/i, "");
  if (!cleaned || cleaned === "-") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

// ---------------------------------------------------------------------------
// OPEX
// ---------------------------------------------------------------------------

function opexColumns(header: string[]) {
  const months: number[] = [];
  header.forEach((cell, index) => {
    const month = MONTH_NAMES.indexOf(norm(cell).slice(0, 3));
    if (month >= 0 && /^[a-z]+$/.test(norm(cell)) && months[month] === undefined) months[month] = index;
  });
  if (months.filter((m) => m !== undefined).length < 12) return null;
  const find = (pattern: RegExp) => header.findIndex((cell) => pattern.test(norm(cell)));
  const description = find(/product|description|item|service/);
  if (description < 0) return null;
  const blank = (index: number) => index >= 0 && index < header.length + 1 && !norm(header[index]);
  const department = find(/department|dept/) >= 0 ? find(/department|dept/) : blank(description - 1) ? description - 1 : -1;
  const vendor = find(/vendor|supplier/) >= 0 ? find(/vendor|supplier/) : blank(description + 1) ? description + 1 : -1;
  const total = find(/total/);
  const remark = find(/remark|note|comment/) >= 0 ? find(/remark|note|comment/) : total >= 0 ? total + 1 : -1;
  const reference = find(/^(#|no\.?|ref.*)$/);
  return { months, description, department, vendor, total, remark, reference };
}

export function parseOpex(sheets: Sheet[]): Parsed<OpexRow> | null {
  for (const sheet of sheets) {
    for (let h = 0; h < Math.min(10, sheet.rows.length); h += 1) {
      const columns = opexColumns(sheet.rows[h] ?? []);
      if (!columns) continue;
      const lines: OpexRow[] = [];
      const leftOut: Parsed<OpexRow>["leftOut"] = [];
      sheet.rows.slice(h + 1).forEach((cells, offset) => {
        const row = h + offset + 2;
        const description = text(cells[columns.description]);
        if (!description || /^total/i.test(description)) return;
        const months = columns.months.map((index) => money(cells[index]) ?? 0);
        const monthTotal = months.reduce((total, m) => total + m, 0);
        // The sheet's own yearly total wins: twelve thirds of a cent would not add back up.
        const totalCell = columns.total >= 0 ? money(cells[columns.total]) : null;
        const amount = round2(totalCell && totalCell > 0 ? totalCell : monthTotal);
        if (amount <= 0) {
          leftOut.push({ row, text: description, reason: "No amount." });
          return;
        }
        const equal = monthTotal > 0 && months.every((m) => Math.abs(m - months[0]!) < 0.01);
        lines.push({
          row,
          reference: columns.reference >= 0 ? text(cells[columns.reference]) : null,
          department: columns.department >= 0 ? text(cells[columns.department]) : null,
          description,
          vendor: columns.vendor >= 0 ? text(cells[columns.vendor]) : null,
          amount,
          months: monthTotal > 0 && !equal ? months.map(round2) : null,
          notes: columns.remark >= 0 ? text(cells[columns.remark]) : null,
        });
      });
      return { sheet: sheet.name, lines, leftOut };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// CAPEX
// ---------------------------------------------------------------------------

function capexColumns(header: string[]) {
  const find = (pattern: RegExp) => header.findIndex((cell) => pattern.test(norm(cell)));
  const description = find(/^description/);
  const quantity = find(/^(q'?ty|qty|quantity)$/);
  const unitPrice = find(/unit price|unit cost/);
  if (description < 0 || (quantity < 0 && unitPrice < 0)) return null;
  return {
    reference: find(/^ref/),
    description,
    priority: find(/priority/),
    location: find(/location/),
    category: find(/category/),
    capexType: find(/capex type|^type/),
    quantity,
    unitPrice,
    associated: find(/associated/),
    total: find(/^total/),
    justification: find(/reason|justification/),
    period: find(/period|required/),
  };
}

export function priorityOf(value: string | undefined): CapexRow["priority"] {
  const v = norm(value);
  if (/first|high/.test(v)) return "FIRST";
  if (/medium/.test(v)) return "MEDIUM";
  if (/wish|low/.test(v)) return "WISH_LIST";
  return null;
}

export function capexTypeOf(value: string | undefined): CapexRow["capexType"] {
  const v = norm(value);
  if (/^a$|revenue/.test(v)) return "REVENUE_GENERATING";
  if (/^b$|cost sav/.test(v)) return "COST_SAVING";
  if (/^c$|replace/.test(v)) return "REGULAR_REPLACEMENT";
  if (/^d$|new op|enhanc/.test(v)) return "NEW_OPERATION";
  if (/^e$|other/.test(v)) return "OTHER";
  return null;
}

/** " 2) F&B DEPARTMENT" → "F&B". */
function departmentName(raw: string): string {
  return raw.replace(/^\s*\d+\)\s*/, "").replace(/\bdepartment\b/i, "").replace(/\s+/g, " ").trim();
}

function parseCapexSheet(sheet: Sheet): Parsed<CapexRow> {
  const lines: CapexRow[] = [];
  const leftOut: Parsed<CapexRow>["leftOut"] = [];
  let columns: ReturnType<typeof capexColumns> = null;
  let department: string | null = null;
  let group: string | null = null;
  sheet.rows.forEach((cells, index) => {
    const row = index + 1;
    const header = capexColumns(cells.map((c) => String(c ?? "")));
    if (header) {
      columns = header;
      group = null;
      return;
    }
    const filled = cells.map((c, i) => [i, text(c)] as const).filter(([, v]) => v !== null);
    if (filled.length === 0) return;
    const numbers = filled.filter(([, v]) => money(v ?? "") !== null);
    // A heading on its own: a department to the left of the description
    // column, or a group (HARDWARE, SOFTWARE) in it.
    if (filled.length === 1 && numbers.length === 0) {
      const [col, value] = filled[0]!;
      if (/^(grand\s+)?total\b|please select/i.test(value!)) return;
      if (!columns || col < columns.description) {
        department = departmentName(value!);
        group = null;
      } else if (col === columns.description) {
        group = value;
      }
      return;
    }
    if (!columns) return;
    const c = columns;
    const description = text(cells[c.description]);
    if (!description || /^(grand\s+)?total\b/i.test(description)) return;
    const quantity = c.quantity >= 0 ? money(cells[c.quantity]) : null;
    const unitPrice = c.unitPrice >= 0 ? money(cells[c.unitPrice]) : null;
    const associatedCost = c.associated >= 0 ? money(cells[c.associated]) : null;
    const totalCell = c.total >= 0 ? money(cells[c.total]) : null;
    let qty = quantity === null ? null : Math.round(quantity);
    let price = unitPrice === null ? null : round2(unitPrice);
    let amount = capexTotal(qty, price, associatedCost);
    // A unit price worked out by division (4,225 / 3) loses a cent when
    // rounded; the sheet's total is what was asked for.
    if (totalCell && Math.abs(totalCell - amount) < 1) amount = totalCell;
    if (amount <= 0 && totalCell && totalCell > 0) {
      // Only a total given: one item at that price.
      amount = totalCell;
      qty = 1;
      price = totalCell;
    }
    if (amount <= 0) {
      leftOut.push({ row, text: description, reason: "No quantity, price or total." });
      return;
    }
    const period = c.period >= 0 ? /q[1-4]/i.exec(cells[c.period] ?? "")?.[0]?.toUpperCase() ?? null : null;
    lines.push({
      row,
      reference: c.reference >= 0 ? text(cells[c.reference]) : null,
      department,
      description,
      category: (c.category >= 0 ? text(cells[c.category]) : null) ?? (group ? (group.length <= 4 ? group : group.charAt(0) + group.slice(1).toLowerCase()) : null),
      quantity: qty,
      unitPrice: price,
      associatedCost,
      amount,
      priority: c.priority >= 0 ? priorityOf(cells[c.priority]) : null,
      capexType: c.capexType >= 0 ? capexTypeOf(cells[c.capexType]) : null,
      period,
      locationCode: c.location >= 0 ? text(cells[c.location]) : null,
      justification: c.justification >= 0 ? text(cells[c.justification]) : null,
    });
  });
  return { sheet: sheet.name, lines, leftOut };
}

const yearIn = (name: string) => Math.max(0, ...[...name.matchAll(/20\d\d/g)].map((m) => Number(m[0])));

/**
 * Every sheet that reads as a CAPEX list, the latest year first (by the year
 * in its name), then the one with most lines: "BGT 2026 Wish List" before
 * "2024-BGT Wish List".
 */
export function parseCapexSheets(sheets: Sheet[]): Parsed<CapexRow>[] {
  return sheets
    .map(parseCapexSheet)
    .filter((parsed) => parsed.lines.length > 0)
    .sort((a, b) => yearIn(b.sheet) - yearIn(a.sheet) || b.lines.length - a.lines.length);
}
