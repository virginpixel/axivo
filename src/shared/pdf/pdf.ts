import PDFDocument from "pdfkit";
import { formatDateTimeWithZone } from "@/shared/utils";

/**
 * Server-side PDF generation (SDS Doc 02 Ch2). Generated documents (handover
 * forms, clearance forms, request summaries, disposal forms) inherit the
 * configured branding (Doc 03 Ch9).
 */

export interface PdfBranding {
  systemName: string;
  companyName?: string;
  primaryColor?: string;
  /** Optional header logos (PNG/JPG bytes) positioned left / center / right. */
  logos?: { left?: Buffer; center?: Buffer; right?: Buffer };
}

export interface PdfSection {
  heading?: string;
  paragraphs?: string[];
  /** Two-column label/value rows. */
  fields?: { label: string; value: string }[];
  /** Table with headers and rows. */
  table?: { headers: string[]; rows: string[][] };
}

export interface PdfDefinition {
  title: string;
  subtitle?: string;
  /** Small label/value chips shown in a band under the title (e.g. number, date, status). */
  meta?: { label: string; value: string }[];
  branding: PdfBranding;
  sections: PdfSection[];
  footerNote?: string;
}

export async function renderPdf(definition: PdfDefinition): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 50, bufferPages: true });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const primary = definition.branding.primaryColor ?? "#24424c";
    const ink = "#1a1a1a";
    const muted = "#6b7280";
    const hair = "#e5e7eb";
    const LEFT = 50;
    const RIGHT = 545;
    const WIDTH = RIGHT - LEFT;

    const ensureSpace = (needed: number) => {
      if (doc.y + needed > doc.page.height - 60) {
        doc.addPage();
        doc.y = 50;
      }
    };

    // Optional logo band (left / center / right), sitting above the title.
    const logos = definition.branding.logos;
    if (logos && (logos.left || logos.center || logos.right)) {
      const bandY = doc.y;
      const h = 46;
      const w = 150;
      const place = (buffer: Buffer | undefined, x: number, align: "left" | "center" | "right") => {
        if (!buffer) return;
        try {
          doc.image(buffer, x, bandY, { fit: [w, h], align, valign: "center" } as never);
        } catch {
          /* ignore invalid image bytes */
        }
      };
      place(logos.left, LEFT, "left");
      place(logos.center, (595 - w) / 2, "center");
      place(logos.right, RIGHT - w, "right");
      doc.y = bandY + h + 12;
    }

    // Title block: the document is the form, so its own title leads.
    doc.fillColor(ink).font("Helvetica-Bold").fontSize(20).text(definition.title, LEFT, doc.y, {
      width: WIDTH,
      align: "center",
    });
    if (definition.subtitle) {
      doc.moveDown(0.3);
      doc.fillColor(muted).fontSize(10.5).font("Helvetica").text(definition.subtitle, LEFT, doc.y, {
        width: WIDTH,
        align: "center",
      });
    }
    doc.moveDown(0.8);
    doc.moveTo(LEFT, doc.y).lineTo(RIGHT, doc.y).strokeColor(primary).lineWidth(2).stroke();
    doc.moveDown(0.9);

    // Meta band: a row of label/value chips (request no, submitted, status …).
    if (definition.meta && definition.meta.length > 0) {
      const cellW = WIDTH / definition.meta.length;
      const y = doc.y;
      definition.meta.forEach((chip, index) => {
        const x = LEFT + index * cellW;
        doc
          .fillColor(muted)
          .font("Helvetica-Bold")
          .fontSize(7.5)
          .text(chip.label.toUpperCase(), x, y, { width: cellW - 8, characterSpacing: 0.6 });
        doc
          .fillColor(ink)
          .font("Helvetica-Bold")
          .fontSize(11)
          .text(chip.value, x, y + 11, { width: cellW - 8, lineBreak: false, ellipsis: true });
      });
      doc.y = y + 30;
      doc.moveTo(LEFT, doc.y).lineTo(RIGHT, doc.y).strokeColor(hair).lineWidth(1).stroke();
      doc.moveDown(1);
    } else {
      doc.moveDown(0.3);
    }

    for (const section of definition.sections) {
      if (section.heading) {
        ensureSpace(52);
        doc.moveDown(0.5);
        doc
          .fillColor(primary)
          .font("Helvetica-Bold")
          .fontSize(10.5)
          .text(section.heading.toUpperCase(), LEFT, doc.y, { characterSpacing: 0.8 });
        doc.moveDown(0.35);
        doc.moveTo(LEFT, doc.y).lineTo(RIGHT, doc.y).strokeColor(hair).lineWidth(1).stroke();
        doc.moveDown(0.65);
      }
      if (section.paragraphs) {
        for (const paragraph of section.paragraphs) {
          doc.fillColor("#333333").fontSize(10).font("Helvetica").text(paragraph, LEFT, doc.y, {
            width: WIDTH,
            lineGap: 2,
          });
          doc.moveDown(0.45);
        }
      }
      if (section.fields) {
        for (const field of section.fields) {
          ensureSpace(24);
          const y = doc.y;
          doc.fillColor(muted).fontSize(9).font("Helvetica-Bold").text(field.label, LEFT, y, { width: 150 });
          doc
            .fillColor(ink)
            .fontSize(10)
            .font("Helvetica")
            .text(field.value || "—", LEFT + 165, y, { width: WIDTH - 165 });
          doc.moveDown(0.6);
        }
        doc.moveDown(0.5);
      }
      if (section.table) {
        renderTable(doc, section.table, primary);
        doc.moveDown(0.6);
      }
    }

    if (definition.footerNote) {
      doc.moveDown(1);
      doc
        .fillColor("#9ca3af")
        .fontSize(8)
        .font("Helvetica-Oblique")
        .text(definition.footerNote, LEFT, doc.y, { width: WIDTH });
    }

    // Page numbers + generation timestamp. The footer sits below the normal text
    // area, so the bottom margin is temporarily zeroed: otherwise PDFKit treats
    // it as overflow and appends a blank page.
    const range = doc.bufferedPageRange();
    const generatedAt = formatDateTimeWithZone(new Date());
    for (let i = range.start; i < range.start + range.count; i += 1) {
      doc.switchToPage(i);
      const bottomMargin = doc.page.margins.bottom;
      doc.page.margins.bottom = 0;
      doc
        .fillColor("#999999")
        .fontSize(8)
        .font("Helvetica")
        .text(
          `Generated by ${definition.branding.systemName} on ${generatedAt}. Page ${i + 1} of ${range.count}`,
          50,
          doc.page.height - 35,
          { width: 495, align: "center", lineBreak: false },
        );
      doc.page.margins.bottom = bottomMargin;
    }
    doc.end();
  });
}

function renderTable(
  doc: PDFKit.PDFDocument,
  table: { headers: string[]; rows: string[][] },
  primary: string,
): void {
  const startX = 50;
  const usableWidth = 495;
  const columnWidth = usableWidth / table.headers.length;
  const padX = 6;
  const padY = 5;
  const cellWidth = columnWidth - padX * 2;
  const pageBottom = doc.page.height - 50;

  // Row height grows to the tallest wrapped cell, so long values (an item
  // name, a step title, a comment) wrap onto extra lines instead of clipping.
  const rowHeightFor = (cells: string[], isHeader: boolean): number => {
    doc.font(isHeader ? "Helvetica-Bold" : "Helvetica").fontSize(9);
    let tallest = 0;
    for (const cell of cells) {
      const height = doc.heightOfString(cell ?? "", { width: cellWidth });
      if (height > tallest) tallest = height;
    }
    return tallest + padY * 2;
  };

  const drawCells = (cells: string[], y: number, height: number, isHeader: boolean) => {
    if (isHeader) doc.rect(startX, y, usableWidth, height).fill(primary);
    cells.forEach((cell, index) => {
      doc
        .fillColor(isHeader ? "#ffffff" : "#1a1a1a")
        .fontSize(9)
        .font(isHeader ? "Helvetica-Bold" : "Helvetica")
        .text(cell ?? "", startX + index * columnWidth + padX, y + padY, {
          width: cellWidth,
        });
    });
  };

  const headerHeight = rowHeightFor(table.headers, true);
  let sectionTop = doc.y;
  let y = sectionTop;
  drawCells(table.headers, y, headerHeight, true);
  y += headerHeight;

  table.rows.forEach((row, index) => {
    const rowHeight = rowHeightFor(row, false);
    if (y + rowHeight > pageBottom) {
      // Close the border for the part of the table on this page, then repeat
      // the header at the top of the next.
      doc.rect(startX, sectionTop, usableWidth, y - sectionTop).strokeColor("#e5e7eb").lineWidth(0.75).stroke();
      doc.addPage();
      y = 50;
      sectionTop = y;
      drawCells(table.headers, y, headerHeight, true);
      y += headerHeight;
    }
    if (index % 2 === 1) {
      doc.rect(startX, y, usableWidth, rowHeight).fill("#f6f7f9");
    }
    drawCells(row, y, rowHeight, false);
    doc.moveTo(startX, y + rowHeight).lineTo(startX + usableWidth, y + rowHeight).strokeColor("#e5e7eb").lineWidth(0.5).stroke();
    y += rowHeight;
  });
  // Outer border around the whole table (current page section).
  doc.rect(startX, sectionTop, usableWidth, y - sectionTop).strokeColor("#e5e7eb").lineWidth(0.75).stroke();
  doc.y = y + 8;
  doc.x = startX;
}
