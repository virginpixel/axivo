import { Prisma, type BudgetKind } from "@prisma/client";
import { db, type DbClient } from "@/shared/db";
import { recordAudit, diffRecords, type AuditContext } from "@/shared/audit/audit";
import { BusinessRuleError, NotFoundError, ValidationError } from "@/shared/errors";
import { readSheets } from "@/modules/infrastructure/import";
import { capexTotal, lineMonths, share, sharesComplete, sum } from "./budget-math";
import { parseCapexSheets, parseOpex, type CapexRow, type OpexRow } from "./budget-import-parse";
import type { AllocationInput, BudgetCreateInput, LineInput } from "./validators";

/**
 * OPEX and CAPEX budgets (SDS Doc 25). One budget per kind and year, in USD.
 * Lines are split between companies by percentage. Only a draft can be
 * changed; submitting, approving, returning and reopening are audited, and
 * returning or reopening needs a reason.
 */

const MODULE = "budgets";
const label = (b: { kind: string; year: number }) => `${b.year} ${b.kind}`;
const num = (d: Prisma.Decimal | number | null | undefined) => (d === null || d === undefined ? null : Number(d));

async function draftBudget(client: DbClient, id: string) {
  const budget = await client.budget.findUnique({ where: { id } });
  if (!budget) throw new NotFoundError("Budget not found.");
  if (budget.status !== "DRAFT") {
    throw new BusinessRuleError(`The ${label(budget)} budget is ${budget.status.toLowerCase()}. Return it to draft to change it.`);
  }
  return budget;
}

async function checkAllocations(allocations: AllocationInput[]) {
  const ids = allocations.map((a) => a.companyId);
  if (new Set(ids).size !== ids.length) throw new ValidationError(undefined, { allocations: "Each company can appear only once." });
  if (!sharesComplete(allocations.map((a) => a.percent))) {
    throw new ValidationError(undefined, { allocations: "The shares must add up to 100%." });
  }
  const found = await db.company.count({ where: { id: { in: ids }, deletedAt: null } });
  if (found !== ids.length) throw new ValidationError(undefined, { allocations: "Choose existing companies." });
}

// ---------------------------------------------------------------------------
// Budgets
// ---------------------------------------------------------------------------

export async function createBudget(audit: AuditContext, input: BudgetCreateInput) {
  if (await db.budget.findUnique({ where: { kind_year: { kind: input.kind, year: input.year } } })) {
    throw new ValidationError(undefined, { year: `There is already a ${input.year} ${input.kind} budget.` });
  }
  const source = input.copyFromId
    ? await db.budget.findUnique({ where: { id: input.copyFromId }, include: { lines: { include: { allocations: true }, orderBy: { sortOrder: "asc" } } } })
    : null;
  if (input.copyFromId && (!source || source.kind !== input.kind)) {
    throw new ValidationError(undefined, { copyFromId: `Choose an earlier ${input.kind} budget.` });
  }
  return db.$transaction(async (tx) => {
    const budget = await tx.budget.create({
      data: { kind: input.kind, year: input.year, notes: input.notes, createdById: audit.actorUserId ?? null },
    });
    for (const line of source?.lines ?? []) {
      const { id: _id, budgetId: _b, createdAt: _c, updatedAt: _u, allocations, months, ...rest } = line;
      await tx.budgetLine.create({
        data: {
          ...rest,
          months: months ?? Prisma.JsonNull,
          budgetId: budget.id,
          createdById: audit.actorUserId ?? null,
          updatedById: null,
          allocations: { create: allocations.map((a) => ({ companyId: a.companyId, percent: a.percent })) },
        },
      });
    }
    await recordAudit(
      audit,
      {
        module: MODULE,
        eventType: "budget.created",
        action: `Created the ${label(budget)} budget${source ? ` from ${label(source)} (${source.lines.length} lines)` : ""}`,
        targetType: "budget",
        targetId: budget.id,
        targetLabel: label(budget),
      },
      tx,
    );
    return budget;
  }, { timeout: 60_000 });
}

export async function deleteBudget(audit: AuditContext, id: string) {
  const budget = await draftBudget(db, id);
  await db.$transaction(async (tx) => {
    await tx.budget.delete({ where: { id } });
    await recordAudit(audit, { module: MODULE, eventType: "budget.deleted", action: `Deleted the ${label(budget)} budget`, targetType: "budget", targetId: id, targetLabel: label(budget) }, tx);
  });
}

type Move = "submit" | "approve" | "return" | "reopen";

const MOVES: Record<Move, { from: string; to: "DRAFT" | "SUBMITTED" | "APPROVED"; verb: string; event: string }> = {
  submit: { from: "DRAFT", to: "SUBMITTED", verb: "Submitted", event: "submitted" },
  approve: { from: "SUBMITTED", to: "APPROVED", verb: "Approved", event: "approved" },
  return: { from: "SUBMITTED", to: "DRAFT", verb: "Returned to draft", event: "returned" },
  reopen: { from: "APPROVED", to: "DRAFT", verb: "Reopened", event: "reopened" },
};

/** Move a budget along Draft → Submitted → Approved, or back with a reason. */
export async function moveBudget(audit: AuditContext, id: string, move: Move, reason: string | null) {
  const budget = await db.budget.findUnique({ where: { id }, include: { _count: { select: { lines: true } } } });
  if (!budget) throw new NotFoundError("Budget not found.");
  const step = MOVES[move];
  if (budget.status !== step.from) throw new BusinessRuleError(`The ${label(budget)} budget is ${budget.status.toLowerCase()}.`);
  if (move === "submit" && budget._count.lines === 0) throw new BusinessRuleError("Add at least one line before submitting.");
  if ((move === "return" || move === "reopen") && !reason) throw new ValidationError(undefined, { reason: "Say why." });
  const now = new Date();
  return db.$transaction(async (tx) => {
    const updated = await tx.budget.update({
      where: { id },
      data: {
        status: step.to,
        updatedById: audit.actorUserId ?? null,
        ...(move === "submit" ? { submittedAt: now, submittedById: audit.actorUserId ?? null } : {}),
        ...(move === "approve" ? { approvedAt: now, approvedById: audit.actorUserId ?? null } : {}),
        ...(move === "return" || move === "reopen" ? { approvedAt: null, approvedById: null } : {}),
      },
    });
    await recordAudit(
      audit,
      {
        module: MODULE,
        eventType: `budget.${step.event}`,
        action: `${step.verb} the ${label(budget)} budget${reason ? `: ${reason}` : ""}`,
        targetType: "budget",
        targetId: id,
        targetLabel: label(budget),
        fieldChanges: [{ field: "status", previousValue: budget.status, newValue: step.to }],
      },
      tx,
    );
    return updated;
  });
}

// ---------------------------------------------------------------------------
// Lines
// ---------------------------------------------------------------------------

function lineData(kind: BudgetKind, input: LineInput) {
  const common = {
    reference: input.reference,
    department: input.department,
    description: input.description,
    vendorId: input.vendorId,
    category: input.category,
    locationCode: input.locationCode,
    notes: input.notes,
  };
  if (kind === "OPEX") {
    const months = input.phasing === "MONTHLY" ? input.months ?? null : null;
    const amount = months ? sum(months) : input.amount ?? 0;
    if (amount <= 0) throw new ValidationError(undefined, { [months ? "months" : "amount"]: "Enter the amount for the year." });
    return {
      ...common,
      amount,
      months: months ?? Prisma.JsonNull,
      quantity: null, unitPrice: null, associatedCost: null, priority: null, capexType: null, period: null, justification: input.justification,
    };
  }
  const amount = capexTotal(input.quantity, input.unitPrice, input.associatedCost);
  if (amount <= 0) throw new ValidationError(undefined, { unitPrice: "Enter a quantity and unit price." });
  return {
    ...common,
    amount,
    months: Prisma.JsonNull,
    quantity: input.quantity,
    unitPrice: input.unitPrice,
    associatedCost: input.associatedCost,
    priority: input.priority,
    capexType: input.capexType,
    period: input.period,
    justification: input.justification,
  };
}

async function checkVendor(vendorId: string | null) {
  if (!vendorId) return;
  if (!(await db.vendor.findFirst({ where: { id: vendorId, deletedAt: null } }))) {
    throw new ValidationError(undefined, { vendorId: "Choose a vendor from the list." });
  }
}

const READABLE = ["reference", "department", "description", "vendorId", "category", "amount", "quantity", "unitPrice", "associatedCost", "priority", "capexType", "period", "locationCode", "justification", "notes", "split"];

const splitText = (allocations: { companyId: string; percent: unknown }[], names: Map<string, string>) =>
  allocations
    .map((a) => `${names.get(a.companyId) ?? a.companyId} ${Number(a.percent)}%`)
    .sort()
    .join(", ");

export async function saveLine(audit: AuditContext, budgetId: string, input: LineInput, lineId?: string) {
  const budget = await draftBudget(db, budgetId);
  await checkAllocations(input.allocations);
  await checkVendor(input.vendorId);
  const data = lineData(budget.kind, input);
  const existing = lineId ? await db.budgetLine.findFirst({ where: { id: lineId, budgetId }, include: { allocations: true } }) : null;
  if (lineId && !existing) throw new NotFoundError("Line not found.");
  const companies = new Map((await db.company.findMany({ select: { id: true, name: true } })).map((c) => [c.id, c.name]));

  return db.$transaction(async (tx) => {
    let line;
    if (existing) {
      await tx.budgetAllocation.deleteMany({ where: { lineId: existing.id } });
      line = await tx.budgetLine.update({
        where: { id: existing.id },
        data: { ...data, updatedById: audit.actorUserId ?? null, allocations: { create: input.allocations } },
      });
    } else {
      const last = await tx.budgetLine.aggregate({ where: { budgetId }, _max: { sortOrder: true } });
      line = await tx.budgetLine.create({
        data: {
          ...data,
          budgetId,
          sortOrder: (last._max.sortOrder ?? 0) + 1,
          createdById: audit.actorUserId ?? null,
          allocations: { create: input.allocations },
        },
      });
    }
    const before = existing ? { ...existing, amount: num(existing.amount), unitPrice: num(existing.unitPrice), associatedCost: num(existing.associatedCost), split: splitText(existing.allocations, companies) } : null;
    const after = { ...line, amount: num(line.amount), unitPrice: num(line.unitPrice), associatedCost: num(line.associatedCost), split: splitText(input.allocations, companies) };
    const fieldChanges = before ? diffRecords(before, after, READABLE) : [];
    if (!existing || fieldChanges.length > 0) {
      await recordAudit(
        audit,
        {
          module: MODULE,
          eventType: existing ? "budget.line_updated" : "budget.line_added",
          action: `${existing ? "Updated" : "Added"} "${line.description}" (${Number(line.amount).toFixed(2)} USD) ${existing ? "in" : "to"} the ${label(budget)} budget`,
          targetType: "budget",
          targetId: budgetId,
          targetLabel: label(budget),
          fieldChanges,
        },
        tx,
      );
    }
    return line;
  });
}

export async function deleteLine(audit: AuditContext, lineId: string) {
  const line = await db.budgetLine.findUnique({ where: { id: lineId } });
  if (!line) throw new NotFoundError("Line not found.");
  const budget = await draftBudget(db, line.budgetId);
  await db.$transaction(async (tx) => {
    await tx.budgetLine.delete({ where: { id: lineId } });
    await recordAudit(
      audit,
      {
        module: MODULE,
        eventType: "budget.line_removed",
        action: `Removed "${line.description}" (${Number(line.amount).toFixed(2)} USD) from the ${label(budget)} budget`,
        targetType: "budget",
        targetId: budget.id,
        targetLabel: label(budget),
      },
      tx,
    );
  });
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

/** Every budget with its total and each company's share. */
export async function listBudgets() {
  const budgets = await db.budget.findMany({
    orderBy: [{ year: "desc" }, { kind: "asc" }],
    include: { lines: { select: { amount: true, allocations: { select: { companyId: true, percent: true } } } } },
  });
  const companies = await db.company.findMany({ where: { deletedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true } });
  return budgets.map((b) => {
    const byCompany = new Map<string, number>();
    for (const line of b.lines) {
      for (const a of line.allocations) byCompany.set(a.companyId, (byCompany.get(a.companyId) ?? 0) + share(Number(line.amount), Number(a.percent)));
    }
    return {
      id: b.id,
      kind: b.kind,
      year: b.year,
      status: b.status,
      lines: b.lines.length,
      total: b.lines.reduce((s, l) => s + Number(l.amount), 0),
      companies: companies.filter((c) => byCompany.has(c.id)).map((c) => ({ id: c.id, name: c.name, amount: byCompany.get(c.id)! })),
    };
  });
}

/** One budget with its lines (optionally one company's, matching a search), each company's share and the months. */
export async function loadBudget(id: string, companyId?: string, search?: string) {
  const budget = await db.budget.findUnique({
    where: { id },
    include: {
      lines: {
        orderBy: { sortOrder: "asc" },
        include: { vendor: { select: { id: true, name: true } }, allocations: { include: { company: { select: { id: true, name: true } } } } },
      },
    },
  });
  if (!budget) throw new NotFoundError("Budget not found.");
  const lines = budget.lines.map((line) => {
    const amount = Number(line.amount);
    const months = lineMonths({ amount, months: line.months });
    const mine = companyId ? Number(line.allocations.find((a) => a.companyId === companyId)?.percent ?? 0) : 100;
    return {
      id: line.id,
      reference: line.reference,
      department: line.department,
      description: line.description,
      vendor: line.vendor,
      category: line.category,
      amount,
      months,
      evenlySpread: !Array.isArray(line.months),
      quantity: line.quantity,
      unitPrice: num(line.unitPrice),
      associatedCost: num(line.associatedCost),
      priority: line.priority,
      capexType: line.capexType,
      period: line.period,
      locationCode: line.locationCode,
      justification: line.justification,
      notes: line.notes,
      allocations: line.allocations.map((a) => ({ companyId: a.companyId, companyName: a.company.name, percent: Number(a.percent) })),
      /** The part in view: the whole line, or the chosen company's share. */
      inView: share(amount, mine),
      monthsInView: months.map((m) => share(m, mine)),
    };
  });
  const q = search?.trim().toLowerCase() ?? "";
  const matches = (l: (typeof lines)[number]) =>
    !q ||
    [l.description, l.reference, l.department, l.vendor?.name, l.category, l.notes, l.justification, l.locationCode]
      .some((field) => field?.toLowerCase().includes(q));
  const visible = lines.filter((l) => (!companyId || l.allocations.some((a) => a.companyId === companyId)) && matches(l));

  const byCompany = new Map<string, { name: string; amount: number }>();
  for (const line of lines) {
    for (const a of line.allocations) {
      const entry = byCompany.get(a.companyId) ?? { name: a.companyName, amount: 0 };
      entry.amount += share(line.amount, a.percent);
      byCompany.set(a.companyId, entry);
    }
  }
  const byMonth = Array.from({ length: 12 }, (_, m) => visible.reduce((s, l) => s + l.monthsInView[m]!, 0));

  return {
    budget,
    lines: visible,
    total: visible.reduce((s, l) => s + l.inView, 0),
    byCompany: [...byCompany].map(([id, v]) => ({ id, ...v })).sort((a, b) => b.amount - a.amount),
    byMonth,
  };
}

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

export interface BudgetImportPreview {
  sheet: string;
  /** CAPEX: every list found, so another can be chosen. */
  sheets: { name: string; lines: number }[];
  lines: {
    row: number; reference: string | null; department: string | null; description: string; vendor: string | null;
    category: string | null; amount: number; detail: string;
  }[];
  total: number;
  leftOut: { row: number; text: string; reason: string }[];
  newVendors: string[];
}

async function analyse(budgetId: string, file: File, sheetName: string | null) {
  const budget = await db.budget.findUnique({ where: { id: budgetId } });
  if (!budget) throw new NotFoundError("Budget not found.");
  const sheets = await readSheets(file);
  let opex: OpexRow[] = [];
  let capex: CapexRow[] = [];
  let sheet = "";
  let options: { name: string; lines: number }[] = [];
  let leftOut: BudgetImportPreview["leftOut"] = [];
  if (budget.kind === "OPEX") {
    const parsed = parseOpex(sheets);
    if (!parsed) throw new ValidationError(undefined, { file: "No sheet has a description column and the twelve month columns (January to December)." });
    ({ sheet, leftOut } = parsed);
    opex = parsed.lines;
    options = [{ name: parsed.sheet, lines: parsed.lines.length }];
  } else {
    const all = parseCapexSheets(sheets);
    if (all.length === 0) throw new ValidationError(undefined, { file: "No sheet has Description, Q'ty and Unit Price headings with items under them." });
    const chosen = (sheetName && all.find((p) => p.sheet === sheetName)) || all[0]!;
    ({ sheet, leftOut } = chosen);
    capex = chosen.lines;
    options = all.map((p) => ({ name: p.sheet, lines: p.lines.length }));
  }
  const vendorNames = [...new Set(opex.map((l) => l.vendor).filter((v): v is string => !!v))];
  const vendors = await db.vendor.findMany({ where: { deletedAt: null }, select: { id: true, name: true } });
  const vendorId = new Map(vendors.map((v) => [v.name.toLowerCase(), v.id]));
  return { budget, sheet, options, leftOut, opex, capex, vendorNames, vendorId };
}

export async function previewBudgetImport(budgetId: string, file: File, sheetName: string | null): Promise<BudgetImportPreview> {
  const a = await analyse(budgetId, file, sheetName);
  const lines: BudgetImportPreview["lines"] =
    a.budget.kind === "OPEX"
      ? a.opex.map((l) => ({
          row: l.row, reference: l.reference, department: l.department, description: l.description, vendor: l.vendor, category: null,
          amount: l.amount, detail: l.months ? "Amounts per month" : "Spread evenly",
        }))
      : a.capex.map((l) => ({
          row: l.row, reference: l.reference, department: l.department, description: l.description, vendor: null, category: l.category,
          amount: l.amount, detail: `${l.quantity ?? 1} × ${l.unitPrice?.toFixed(2) ?? "?"}${l.associatedCost ? ` + ${l.associatedCost.toFixed(2)}` : ""}`,
        }));
  return {
    sheet: a.sheet,
    sheets: a.options,
    lines,
    total: lines.reduce((s, l) => s + l.amount, 0),
    leftOut: a.leftOut,
    newVendors: a.vendorNames.filter((name) => !a.vendorId.has(name.toLowerCase())),
  };
}

/** Add the file's lines to a draft budget, each split as given. Vendors not yet known are added. */
export async function commitBudgetImport(audit: AuditContext, budgetId: string, file: File, sheetName: string | null, allocations: AllocationInput[]) {
  await draftBudget(db, budgetId);
  await checkAllocations(allocations);
  const a = await analyse(budgetId, file, sheetName);
  let added = 0;
  await db.$transaction(
    async (tx) => {
      const vendorId = new Map(a.vendorId);
      for (const name of a.vendorNames) {
        if (vendorId.has(name.toLowerCase())) continue;
        const vendor = await tx.vendor.create({ data: { name } });
        vendorId.set(name.toLowerCase(), vendor.id);
        await recordAudit(audit, { module: "catalogs", eventType: "vendor.created", action: `Added vendor "${name}" (budget import)`, targetType: "vendor", targetId: vendor.id, targetLabel: name }, tx);
      }
      const last = await tx.budgetLine.aggregate({ where: { budgetId }, _max: { sortOrder: true } });
      let order = last._max.sortOrder ?? 0;
      // One spelling per department: the budget's own first, then the file's first.
      const spelling = new Map<string, string>();
      for (const l of await tx.budgetLine.findMany({ where: { budgetId, department: { not: null } }, select: { department: true }, orderBy: { sortOrder: "asc" } })) {
        if (!spelling.has(l.department!.toLowerCase())) spelling.set(l.department!.toLowerCase(), l.department!);
      }
      const department = (name: string | null) => {
        if (!name) return null;
        if (!spelling.has(name.toLowerCase())) spelling.set(name.toLowerCase(), name);
        return spelling.get(name.toLowerCase())!;
      };
      const common = (l: { reference: string | null; department: string | null; description: string }) => ({
        budgetId,
        reference: l.reference,
        department: department(l.department),
        description: l.description,
        sortOrder: ++order,
        createdById: audit.actorUserId ?? null,
        allocations: { create: allocations },
      });
      for (const l of a.opex) {
        await tx.budgetLine.create({
          data: {
            ...common(l),
            vendorId: l.vendor ? vendorId.get(l.vendor.toLowerCase()) ?? null : null,
            amount: l.amount,
            months: l.months ?? Prisma.JsonNull,
            notes: l.notes,
            locationCode: l.locationCode,
          },
        });
        added += 1;
      }
      for (const l of a.capex) {
        await tx.budgetLine.create({
          data: {
            ...common(l),
            category: l.category,
            amount: l.amount,
            quantity: l.quantity,
            unitPrice: l.unitPrice,
            associatedCost: l.associatedCost,
            priority: l.priority,
            capexType: l.capexType,
            period: l.period,
            locationCode: l.locationCode,
            justification: l.justification,
          },
        });
        added += 1;
      }
      await recordAudit(
        audit,
        {
          module: MODULE,
          eventType: "budget.imported",
          action: `Imported ${added} lines from "${file.name}" (sheet "${a.sheet}") into the ${label(a.budget)} budget`,
          targetType: "budget",
          targetId: budgetId,
          targetLabel: label(a.budget),
        },
        tx,
      );
    },
    { timeout: 120_000 },
  );
  return { added };
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

/**
 * The budget's lines as a workbook: OPEX month by month, CAPEX with
 * quantities and prices. What is on screen: the chosen company's share and
 * the search, if any. Audited.
 */
export async function exportBudget(audit: AuditContext, id: string, companyId?: string, search?: string) {
  const ExcelJS = (await import("exceljs")).default;
  const { budget, lines, total, byMonth, byCompany } = await loadBudget(id, companyId, search);
  const company = companyId ? byCompany.find((c) => c.id === companyId)?.name : null;
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet(`${budget.year} ${budget.kind}`);
  const money = "#,##0.00";
  const split = (l: (typeof lines)[number]) => l.allocations.map((a) => `${a.companyName} ${a.percent}%`).join(", ");
  sheet.addRow([`${budget.year} ${budget.kind} budget (USD)${company ? `, ${company}'s share` : ""}${search ? `, lines matching "${search}"` : ""}`]).font = { bold: true, size: 13 };
  sheet.addRow([]);
  if (budget.kind === "OPEX") {
    const header = sheet.addRow(["Department", "Product or service", "Vendor", "Kind of cost", ...MONTH_NAMES, "Year", "Paid by", "Used by", "Notes"]);
    header.font = { bold: true };
    for (const l of lines) {
      sheet.addRow([l.department, l.description, l.vendor?.name ?? null, l.category, ...l.monthsInView, l.inView, split(l), l.locationCode, l.notes]);
    }
    const totals = sheet.addRow(["", "Total", "", "", ...byMonth, total]);
    totals.font = { bold: true };
    for (let c = 5; c <= 17; c += 1) sheet.getColumn(c).numFmt = money;
    sheet.columns.forEach((col, i) => (col.width = i === 1 ? 40 : i >= 4 && i <= 16 ? 12 : i === 17 ? 34 : 18));
  } else {
    const header = sheet.addRow([
      "Ref", "Department", "Item", "Category", "Priority", "CAPEX type", "Needed in", "Quantity", "Unit price", "Associated cost",
      company ? "Share" : "Total", "Paid by", "Used by", "Reason / justification", "Notes",
    ]);
    header.font = { bold: true };
    for (const l of lines) {
      sheet.addRow([
        l.reference, l.department, l.description, l.category, l.priority ? PRIORITY_NAMES[l.priority] : null,
        l.capexType ? CAPEX_TYPE_NAMES[l.capexType] : null, l.period, l.quantity, l.unitPrice, l.associatedCost, l.inView,
        split(l), l.locationCode, l.justification, l.notes,
      ]);
    }
    const totals = sheet.addRow(["", "", "Total", "", "", "", "", "", "", "", total]);
    totals.font = { bold: true };
    for (const c of [9, 10, 11]) sheet.getColumn(c).numFmt = money;
    sheet.columns.forEach((col, i) => (col.width = i === 2 ? 40 : i === 13 ? 60 : 16));
  }
  sheet.views = [{ state: "frozen", ySplit: 3 }];
  await recordAudit(audit, {
    module: MODULE,
    eventType: "budget.exported",
    action: `Exported the ${label(budget)} budget (${lines.length} lines${company ? `, ${company}'s share` : ""}${search ? `, matching "${search}"` : ""})`,
    targetType: "budget",
    targetId: budget.id,
    targetLabel: label(budget),
  });
  const name = `${budget.year} ${budget.kind}${company ? ` ${company}` : ""}.xlsx`.replace(/[^\w .-]+/g, "");
  return { name, buffer: Buffer.from(await book.xlsx.writeBuffer()) };
}

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const PRIORITY_NAMES = { FIRST: "First priority", MEDIUM: "Medium priority", WISH_LIST: "Wish list" } as const;
const CAPEX_TYPE_NAMES = {
  REVENUE_GENERATING: "Revenue generating",
  COST_SAVING: "Cost saving",
  REGULAR_REPLACEMENT: "Regular replacement",
  NEW_OPERATION: "New operation enhancement",
  OTHER: "Other",
} as const;
