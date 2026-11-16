import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execSync } from "node:child_process";

/**
 * Infrastructure register and credential vault (SDS Doc 24) against a real
 * PostgreSQL database: company scoping, the reveal audit, the import's login
 * grouping, and that no password ever lands anywhere but the ciphertext column.
 */

const DB_NAME = "axivo_integration_infra";
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
let service: typeof import("@/modules/infrastructure/service");
let vault: typeof import("@/modules/infrastructure/vault");
let importer: typeof import("@/modules/infrastructure/import");

const SECRET = "S3cret-Switch-Pass!";
const audit = { actorLabel: "integration-test" };
let cxr: { id: string };
let hrh: { id: string };
let switchType: { id: string };
let vmType: { id: string };

const admin = () => ({ audit, companyId: cxr.id, isGlobalAdmin: true });
const hrhUser = () => ({ audit, companyId: hrh.id, isGlobalAdmin: false });

function device(overrides: Record<string, unknown>) {
  return {
    companyId: cxr.id, typeId: switchType.id, name: "SW", hostname: null, ipAddress: null, locationId: null,
    manufacturerId: null, model: null, serialNumber: null, operatingSystem: null, version: null, domain: null,
    purpose: null, status: "ACTIVE" as const, hostDeviceId: null, notes: null, applicationIds: [], ...overrides,
  };
}

async function workbook(rows: (string | number)[][]): Promise<File> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.addWorksheet("Summary").addRow(["Server list"]);
  const sheet = wb.addWorksheet("Sheet1");
  rows.forEach((row) => sheet.addRow(row));
  const buffer = await wb.xlsx.writeBuffer();
  return new File([buffer], "servers.xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

beforeAll(async () => {
  execSync(
    `docker exec axivo-dev-pg psql -U axivo -d postgres -c "DROP DATABASE IF EXISTS ${DB_NAME} WITH (FORCE);" -c "CREATE DATABASE ${DB_NAME};"`,
    { stdio: "pipe" },
  );
  execSync(`npx prisma migrate deploy`, { cwd: process.cwd(), env: { ...process.env, DATABASE_URL: TEST_DB_URL }, stdio: "pipe" });
  ({ db } = await import("@/shared/db"));
  service = await import("@/modules/infrastructure/service");
  vault = await import("@/modules/infrastructure/vault");
  importer = await import("@/modules/infrastructure/import");
  cxr = await db.company.create({ data: { name: "Crossroads" } });
  hrh = await db.company.create({ data: { name: "Hard Rock Hotel" } });
  switchType = await db.infraDeviceType.create({ data: { kind: "NETWORK", name: "Switch" } });
  vmType = await db.infraDeviceType.create({ data: { kind: "SERVER", name: "Virtual Machine" } });
}, 180_000);

afterAll(async () => {
  await db?.$disconnect();
});

describe("infrastructure register", () => {
  it("keeps names unique per company and refuses a host loop", async () => {
    await service.createDevice(admin(), device({ name: "CORE-SW1", ipAddress: "10.100.200.254" }));
    await expect(service.createDevice(admin(), device({ name: "core-sw1" }))).rejects.toThrow(/correct the highlighted/i);
    // The same name in another company is a different device.
    await service.createDevice(admin(), device({ companyId: hrh.id, name: "CORE-SW1" }));

    const host = await service.createDevice(admin(), device({ name: "PVE-01", typeId: vmType.id }));
    const guest = await service.createDevice(admin(), device({ name: "VM-01", typeId: vmType.id, hostDeviceId: host.id }));
    await expect(
      service.updateDevice(admin(), host.id, device({ name: "PVE-01", typeId: vmType.id, hostDeviceId: guest.id })),
    ).rejects.toThrow();
    await expect(service.deleteDevice(admin(), host.id)).rejects.toThrow(/runs on "PVE-01"/);
  });

  it("does not let another company's user touch a device", async () => {
    const cxrDevice = await db.infraDevice.findFirstOrThrow({ where: { companyId: cxr.id, name: "CORE-SW1" } });
    await expect(service.setDeviceStatus(hrhUser(), cxrDevice.id, "STANDBY")).rejects.toThrow(/permission/i);
  });
});

describe("credential vault", () => {
  it("stores the password encrypted, reveals it with an audit entry, and never logs it", async () => {
    const set = await vault.createCredentialSet(admin(), { companyId: cxr.id, name: "CXR switch admin", username: "netadmin", password: SECRET, notes: null });
    const row = await db.credentialSet.findUniqueOrThrow({ where: { id: set.id } });
    expect(row.secretCiphertext).toBeTruthy();
    expect(row.secretCiphertext).not.toContain(SECRET);

    expect(await vault.revealPassword(admin(), set.id)).toBe(SECRET);
    const reveals = await db.auditEvent.count({ where: { eventType: "credential.revealed", targetId: set.id } });
    expect(reveals).toBe(1);

    await vault.updateCredentialSet(admin(), set.id, { companyId: cxr.id, name: "CXR switch admin", username: "netadmin", password: "N3w-Pass", notes: null });
    expect(await vault.revealPassword(admin(), set.id)).toBe("N3w-Pass");
    // An edit without a password keeps the stored one.
    await vault.updateCredentialSet(admin(), set.id, { companyId: cxr.id, name: "CXR switch admin", username: "netadmin2", notes: null });
    expect(await vault.revealPassword(admin(), set.id)).toBe("N3w-Pass");

    const events = await db.auditEvent.findMany({ include: { fieldChanges: true } });
    const dump = JSON.stringify(events);
    expect(dump).not.toContain(SECRET);
    expect(dump).not.toContain("N3w-Pass");
  });

  it("hides one company's sets from another company's user", async () => {
    const set = await db.credentialSet.findFirstOrThrow({ where: { name: "CXR switch admin" } });
    await expect(vault.revealPassword(hrhUser(), set.id)).rejects.toThrow(/not found/i);
    const hrhDevice = await db.infraDevice.findFirstOrThrow({ where: { companyId: hrh.id } });
    await expect(
      vault.linkCredential(admin(), { deviceId: hrhDevice.id, credentialSetId: set.id, purpose: "SSH" }),
    ).rejects.toThrow(/correct the highlighted/i);
  });

  it("will not narrow a shared set while another company's device uses it", async () => {
    const shared = await vault.createCredentialSet(admin(), { companyId: null, name: "Group admin", username: "admin", password: "x", notes: null });
    const hrhDevice = await db.infraDevice.findFirstOrThrow({ where: { companyId: hrh.id } });
    await vault.linkCredential(admin(), { deviceId: hrhDevice.id, credentialSetId: shared.id, purpose: "SSH" });
    await expect(
      vault.updateCredentialSet(admin(), shared.id, { companyId: cxr.id, name: "Group admin", username: "admin", notes: null }),
    ).rejects.toThrow(/correct the highlighted/i);
    // And a company user cannot change a shared set at all.
    await expect(
      vault.updateCredentialSet(hrhUser(), shared.id, { companyId: null, name: "Renamed", username: "admin", notes: null }),
    ).rejects.toThrow(/permission/i);
  });

  it("erases the ciphertext when a set is deleted", async () => {
    const set = await vault.createCredentialSet(admin(), { companyId: cxr.id, name: "Temp", username: "t", password: "temp-pass", notes: null });
    await vault.deleteCredentialSet(admin(), set.id);
    const row = await db.credentialSet.findUniqueOrThrow({ where: { id: set.id } });
    expect(row.deletedAt).not.toBeNull();
    expect(row.secretCiphertext).toBeNull();
  });
});

describe("import", () => {
  const header = ["No", "Description", "IP Address", "OS", "Authentication", "Compliance", "Username", "Password", "Domain Name ", "Remark"];
  const rows = [
    header,
    [1, "CXR-FS", "10.100.100.150", "Windows Server 2019", "Yes", "No", "administrator", "Imp0rt-Pass", "cxrmv.local", "VM Removed"],
    [2, "CXR-DC01", "10.100.100.10", "Windows Server 2022", "Yes", "Yes", "administrator", "Imp0rt-Pass", "cxrmv.local", ""],
    [3, "HRH-APP", "10.197.100.20", "Ubuntu 22.04", "", "", "root", "Other-Pass", "", ""],
    [4, "HRH-NAS", "10.197.100.30", "Synology DSM 7.2", "", "", "", "", "", ""],
    [5, "", "10.0.0.1", "", "", "", "", "", "", ""],
    [6, "CXR-BAD", "not-an-ip", "Windows Server 2019", "", "", "", "", "", ""],
  ];

  it("previews without passwords and groups identical logins", async () => {
    const preview = await importer.previewImport(admin(), "SERVER", await workbook(rows));
    expect(preview.sheetName).toBe("Sheet1");
    expect(preview.ignoredHeaders).toEqual(["No", "Authentication", "Compliance"]);
    expect(JSON.stringify(preview)).not.toContain("Imp0rt-Pass");
    expect(JSON.stringify(preview)).not.toContain("Other-Pass");
    const fs = preview.rows.find((r) => r.name === "CXR-FS")!;
    const dc = preview.rows.find((r) => r.name === "CXR-DC01")!;
    const app = preview.rows.find((r) => r.name === "HRH-APP")!;
    expect(fs.loginFingerprint).toBe(dc.loginFingerprint);
    expect(app.loginFingerprint).not.toBe(fs.loginFingerprint);
    expect(preview.companyKeys.find((k) => k.key === "HRH")?.suggestedCompanyId).toBe(hrh.id);
    expect(preview.companyKeys.find((k) => k.key === "CXR")?.suggestedCompanyId).toBeNull();
    expect(preview.rows.find((r) => r.name === "CXR-BAD")?.problems[0]).toMatch(/not an IP/);
  });

  it("imports devices and one credential set per distinct login, then reuses them", async () => {
    const options = {
      kind: "SERVER" as const,
      companyMap: { CXR: cxr.id, HRH: hrh.id, "(blank)": "" },
      typeMap: {
        "Windows Server 2019": vmType.id, "Windows Server 2022": vmType.id, "Ubuntu 22.04": vmType.id, "Synology DSM 7.2": vmType.id, "(all rows)": "",
      },
      existing: "update" as const,
      importLogins: true,
      excludedRows: [],
    };
    const first = await importer.commitImport(admin(), await workbook(rows), options);
    expect(first.created).toBe(5);
    expect(first.skipped.map((s) => s.reason)).toEqual(["No name"]);
    expect(first.credentialSetsCreated).toBe(2);
    expect(first.credentialLinks).toBe(3);

    const fs = await db.infraDevice.findFirstOrThrow({ where: { name: "CXR-FS" }, include: { credentials: true } });
    // A remark is a note, not a status: "VM Removed" remarks were out of date.
    expect(fs.status).toBe("ACTIVE");
    expect(fs.notes).toBe("VM Removed");
    expect(fs.domain).toBe("cxrmv.local");
    expect(fs.credentials).toHaveLength(1);
    const bad = await db.infraDevice.findFirstOrThrow({ where: { name: "CXR-BAD" } });
    expect(bad.ipAddress).toBeNull();

    const second = await importer.commitImport(admin(), await workbook(rows), options);
    expect(second.created).toBe(0);
    expect(second.updated).toBe(5);
    expect(second.credentialSetsCreated).toBe(0);
    expect(second.credentialSetsReused).toBe(2);
    expect(await db.credentialSet.count({ where: { name: { contains: "(imported)" } } })).toBe(2);

    const all = JSON.stringify(await db.auditEvent.findMany({ include: { fieldChanges: true } }));
    expect(all).not.toContain("Imp0rt-Pass");
  });
});
