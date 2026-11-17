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
