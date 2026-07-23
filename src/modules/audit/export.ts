import ExcelJS from "exceljs";
import type { AuditEvent } from "@prisma/client";

/**
 * Audit export builders (SDS Doc 16 Ch6): CSV and XLSX with export metadata
 * (applied filters, export timestamp, requesting user).
 */

export interface AuditExportMeta {
  exportedBy: string;
  exportedAt: Date;
  filters: Record<string, string>;
}

const HEADERS = [
  "Audit ID", "Occurred (UTC)", "Module", "Event Type", "Action", "Outcome",
  "Actor", "Target Type", "Target", "IP Address", "Company ID",
];

function rowFor(event: AuditEvent): (string | null)[] {
  return [
    event.id,
    event.occurredAt.toISOString(),
    event.module,
    event.eventType,
    event.action,
    event.outcome,
    event.actorLabel,
    event.targetType,
    event.targetLabel ?? event.targetId,
    event.ipAddress,
    event.companyId,
  ];
}

export function buildAuditCsv(events: AuditEvent[], meta: AuditExportMeta): string {
  const escape = (value: string | null) => {
    const text = value ?? "";
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const lines = [
    `# Axivo audit export`,
    `# Exported by: ${meta.exportedBy}`,
    `# Exported at: ${meta.exportedAt.toISOString()}`,
    `# Filters: ${JSON.stringify(meta.filters)}`,
    HEADERS.join(","),
    ...events.map((event) => rowFor(event).map(escape).join(",")),
  ];
  return lines.join("\r\n");
}

export async function buildAuditXlsx(events: AuditEvent[], meta: AuditExportMeta): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Axivo";
  workbook.created = meta.exportedAt;
  const sheet = workbook.addWorksheet("Audit Log");
  sheet.addRow([`Axivo audit export by ${meta.exportedBy} at ${meta.exportedAt.toISOString()}`]);
  sheet.addRow([`Filters: ${JSON.stringify(meta.filters)}`]);
  sheet.addRow([]);
  const headerRow = sheet.addRow(HEADERS);
  headerRow.font = { bold: true };
  for (const event of events) {
    sheet.addRow(rowFor(event));
  }
  sheet.columns.forEach((column) => {
    column.width = 24;
  });
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
