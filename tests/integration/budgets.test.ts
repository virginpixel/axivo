import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execSync } from "node:child_process";

/**
 * OPEX and CAPEX budgets (SDS Doc 25) against a real database: company
 * splits and totals, the draft-only rule, the approval steps, copying a year
 * and importing a sheet.
 */

const DB_NAME = "axivo_integration_budgets";
const TEST_DB_URL = `postgresql://axivo:axivo@localhost:5432/${DB_NAME}?schema=public`;

(process.env as Record<string, string>).NODE_ENV = "test";
process.env.APP_URL = "http://localhost:3000";
process.env.DATABASE_URL = TEST_DB_URL;
process.env.REDIS_URL = "redis://localhost:6379";
process.env.SESSION_SECRET = "integration-session-secret-0123456789abcdef0123456789";
process.env.ENCRYPTION_KEY = "integration-encryption-key-0123456789abcdef0123456789";
process.env.TOKEN_SIGNING_KEY = "integration-token-key-0123456789abcdef0123456789abcd";
process.env.STORAGE_PATH = "./storage-integration-test";

let db: typeof import("@/shared/db").db;
let budgets: typeof import("@/modules/budgets/service");
const audit = { actorLabel: "integration-test" };
let cxr: { id: string };
let hrh: { id: string };

const line = (overrides: Record<string, unknown>) => ({
  reference: null, department: "IT", description: "Item", vendorId: null, category: null, amount: null, phasing: "EVEN" as const,
  months: null, quantity: null, unitPrice: null, associatedCost: null, priority: null, capexType: null, period: null,
  locationCode: null, justification: null, notes: null, allocations: [{ companyId: cxr.id, percent: 100 }],
  ...overrides,
});

beforeAll(async () => {
  execSync(
    `docker exec axivo-dev-pg psql -U axivo -d postgres -c "DROP DATABASE IF EXISTS ${DB_NAME} WITH (FORCE);" -c "CREATE DATABASE ${DB_NAME};"`,
    { stdio: "pipe" },
  );
  execSync(`npx prisma migrate deploy`, { cwd: process.cwd(), env: { ...process.env, DATABASE_URL: TEST_DB_URL }, stdio: "pipe" });
  ({ db } = await import("@/shared/db"));
  budgets = await import("@/modules/budgets/service");
  cxr = await db.company.create({ data: { name: "Crossroads" } });
  hrh = await db.company.create({ data: { name: "Hard Rock Hotel" } });
}, 180_000);

afterAll(async () => {
  await db?.$disconnect();
});

describe("budgets", () => {
  let opexId: string;

  it("splits lines between companies and counts each company's share", async () => {
    const opex = await budgets.createBudget(audit, { kind: "OPEX", year: 2027, copyFromId: null, notes: null });
    opexId = opex.id;
    await expect(budgets.createBudget(audit, { kind: "OPEX", year: 2027, copyFromId: null, notes: null })).rejects.toMatchObject({ fieldErrors: { year: expect.any(String) } });

    await budgets.saveLine(audit, opexId, line({ description: "Microsoft 365", amount: 12000, allocations: [{ companyId: cxr.id, percent: 60 }, { companyId: hrh.id, percent: 40 }] }));
    await budgets.saveLine(audit, opexId, line({ description: "Internet", phasing: "MONTHLY", months: [...Array(11).fill(15000), 20000] }));
    await expect(budgets.saveLine(audit, opexId, line({ amount: 100, allocations: [{ companyId: cxr.id, percent: 60 }] })))
      .rejects.toMatchObject({ fieldErrors: { allocations: expect.stringMatching(/100%/) } });

    const all = await budgets.loadBudget(opexId);
    expect(all.total).toBe(197000);
    expect(all.byCompany).toEqual([{ id: cxr.id, name: "Crossroads", amount: 192200 }, { id: hrh.id, name: "Hard Rock Hotel", amount: 4800 }]);
    expect(all.byMonth[11]).toBe(21000);
    const theirs = await budgets.loadBudget(opexId, hrh.id);
    expect(theirs.lines).toHaveLength(1);
    expect(theirs.total).toBe(4800);
    expect(theirs.byMonth[0]).toBe(400);
  });

  it("locks a submitted budget, and returning it needs a reason", async () => {
    await budgets.moveBudget(audit, opexId, "submit", null);
    await expect(budgets.saveLine(audit, opexId, line({ amount: 5 }))).rejects.toThrow(/submitted/);
    await expect(budgets.moveBudget(audit, opexId, "return", null)).rejects.toMatchObject({ fieldErrors: { reason: expect.any(String) } });
    await budgets.moveBudget(audit, opexId, "approve", null);
    expect(await db.budget.findUniqueOrThrow({ where: { id: opexId } })).toMatchObject({ status: "APPROVED" });
    await budgets.moveBudget(audit, opexId, "reopen", "Internet price went up");
    const events = await db.auditEvent.findMany({ where: { targetId: opexId }, select: { eventType: true, action: true } });
    expect(events.map((e) => e.eventType)).toEqual(expect.arrayContaining(["budget.submitted", "budget.approved", "budget.reopened"]));
    expect(events.find((e) => e.eventType === "budget.reopened")?.action).toMatch(/Internet price went up/);
  });

  it("starts a new year from an earlier one, splits included", async () => {
    const next = await budgets.createBudget(audit, { kind: "OPEX", year: 2028, copyFromId: opexId, notes: null });
    const copy = await budgets.loadBudget(next.id);
    expect(copy.lines.map((l) => l.description)).toEqual(["Microsoft 365", "Internet"]);
    expect(copy.total).toBe(197000);
    expect(copy.lines[1]!.evenlySpread).toBe(false);
    expect(copy.budget.status).toBe("DRAFT");
  });

  it("works out CAPEX lines and imports the wish list", async () => {
    const capex = await budgets.createBudget(audit, { kind: "CAPEX", year: 2027, copyFromId: null, notes: null });
    await budgets.saveLine(audit, capex.id, line({ description: "HP EliteBook", quantity: 4, unitPrice: 1800, associatedCost: 200, priority: "FIRST", capexType: "REGULAR_REPLACEMENT", period: "Q2" }));
    const rows = [
      ["", "Ref#", "Description", "Priority Order", "Location Code", "Asset Category", "CAPEX types", "Status", "Q'ty", "Unit Price", "Item Cost", "Associated Cost", "Total Amount", "Reasons/Justification"],
      ["", "IT-02", "UniFi U6-Pro Access Point", "First Priority", "HR", "", "New Operation Enhancement", "", "5", "400", "2000", "", "2000", "Staff Wi-Fi"],
      ["", "IT-03", "Synology NAS", "Wish List", "IT", "", "C", "", "1", "900", "900", "", "900", "Backups"],
    ];
    const file = new File([rows.map((r) => r.join(",")).join("\n")], "capex.csv");
    const preview = await budgets.previewBudgetImport(capex.id, file, null);
    expect(preview).toMatchObject({ total: 2900, lines: [{ description: "UniFi U6-Pro Access Point" }, { description: "Synology NAS" }] });
    const result = await budgets.commitBudgetImport(audit, capex.id, file, null, [{ companyId: hrh.id, percent: 100 }]);
    expect(result.added).toBe(2);
    const loaded = await budgets.loadBudget(capex.id);
    expect(loaded.total).toBe(7400 + 2900);
    expect(loaded.byCompany.find((c) => c.id === hrh.id)?.amount).toBe(2900);
    expect(loaded.lines[1]).toMatchObject({ reference: "IT-02", priority: "FIRST", capexType: "NEW_OPERATION", locationCode: "HR" });
  });
});

describe("export, search and sample files", () => {
  it("finds lines as typed and exports what is on screen, month by month", async () => {
    const opex = await db.budget.findFirstOrThrow({ where: { kind: "OPEX", year: 2028 } });
    const found = await budgets.loadBudget(opex.id, undefined, "intern");
    expect(found.lines.map((l) => l.description)).toEqual(["Internet"]);
    expect(found.total).toBe(185000);

    const ExcelJS = (await import("exceljs")).default;
    const { name, buffer } = await budgets.exportBudget(audit, opex.id, hrh.id);
    expect(name).toBe("2028 OPEX Hard Rock Hotel.xlsx");
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(buffer as unknown as ArrayBuffer);
    const rows = book.worksheets[0]!.getSheetValues().filter(Boolean) as unknown[][];
    const header = rows[1]!.slice(1);
    expect(header.slice(0, 6)).toEqual(["Department", "Product or service", "Vendor", "Kind of cost", "Jan", "Feb"]);
    // Hard Rock pays 40% of Microsoft 365 (12,000): 400 a month.
    const m365 = rows.find((r) => r[2] === "Microsoft 365")!.slice(1);
    expect(m365[4]).toBe(400);
    expect(m365[16]).toBe(4800);
    expect(await db.auditEvent.count({ where: { targetId: opex.id, eventType: "budget.exported" } })).toBe(1);
  });

  it("gives a sample for every import that its importer reads back", async () => {
    const { buildSample } = await import("@/modules/samples/samples");
    const { readSheets } = await import("@/modules/infrastructure/import");
    const { pickSheet } = await import("@/modules/infrastructure/import-parse");
    const { pickLinkSheet } = await import("@/modules/infrastructure/topology-parse");
    const ipamParse = await import("@/modules/infrastructure/ipam-parse");
    const parse = await import("@/modules/budgets/budget-import-parse");
    const read = async (kind: Parameters<typeof buildSample>[0]) => {
      const { file, buffer } = await buildSample(kind);
      return readSheets(new File([new Uint8Array(buffer)], file));
    };

    const network = pickSheet(await read("network-devices"))!;
    expect(network.sheetName).toBe("Network devices");
    expect(Object.keys(network.columns.fields)).toEqual(expect.arrayContaining(["company", "name", "type", "ipAddress", "serialNumber", "status", "username", "password"]));
    expect(network.rows).toHaveLength(2);
    expect(pickSheet(await read("servers"))!.columns.fields.domain).toBeDefined();

    const links = pickLinkSheet(await read("connections"))!;
    expect(links.rows).toHaveLength(2);

    const vlanSheet = ipamParse.pickPlanSheet(await read("vlans"))!;
    expect(vlanSheet.rows.map((r) => ipamParse.parsePlanRow(vlanSheet, r))).toMatchObject([
      { ok: true, row: { number: 10, companyText: "Crossroads", cidr: { prefix: 23 } } },
      { ok: true, row: { number: 42, status: "RESERVED" } },
    ]);
    const addressSheet = ipamParse.pickAddressSheet(await read("ip-addresses"))!;
    expect(addressSheet.rows.map((r) => ipamParse.parseAddressRow(addressSheet, r)!.reserved)).toEqual([false, true]);

    const opex = parse.parseOpex(await read("opex"))!;
    expect(opex.lines).toMatchObject([
      { department: "IT", description: "Microsoft 365", vendor: "Pacific Technologies", amount: 11000, months: null },
      { description: "Internet", amount: 185000 },
    ]);
    const capex = parse.parseCapexSheets(await read("capex"))[0]!;
    expect(capex.lines).toMatchObject([
      { reference: "IT-01", department: "IT", category: "Hardware", amount: 2000, priority: "FIRST", period: "Q1" },
      { reference: "IT-02", amount: 7400, priority: "MEDIUM", capexType: "REGULAR_REPLACEMENT" },
    ]);
  });
});

