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
let topology: typeof import("@/modules/infrastructure/topology");

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
    purpose: null, status: "ACTIVE" as const, hostDeviceId: null, notes: null, applicationIds: [],
    assetMode: "keep" as const, assetCategoryId: null, assetLookup: null, ...overrides,
  };
}

async function workbook(rows: (string | number)[][], name = "servers.xlsx"): Promise<File> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.addWorksheet("Summary").addRow(["Server list"]);
  const sheet = wb.addWorksheet("Sheet1");
  rows.forEach((row) => sheet.addRow(row));
  const buffer = await wb.xlsx.writeBuffer();
  return new File([buffer], name, { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
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
  topology = await import("@/modules/infrastructure/topology");
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

describe("connections", () => {
  let core: { id: string };
  let acc1: { id: string };
  let acc2: { id: string };
  let hrhCore: { id: string };

  beforeAll(async () => {
    core = await service.createDevice(admin(), device({ name: "BOH_DC_Core_SW1", ipAddress: "10.100.200.254" }));
    acc1 = await service.createDevice(admin(), device({ name: "BOH-ADMIN-SW01", ipAddress: "10.100.200.25" }));
    acc2 = await service.createDevice(admin(), device({ name: "BOH-RES-SW03", hostname: "boh-res-sw03.crossroadsmv.local", ipAddress: "10.100.200.12" }));
    hrhCore = await service.createDevice(admin(), device({ companyId: hrh.id, name: "HRH-CORE-SW01" }));
  });

  it("records a cable once per port and checks loops and companies", async () => {
    const link = await topology.createLink(admin(), {
      deviceAId: acc1.id, portA: "GigabitEthernet1/1/1", deviceBId: core.id, portB: "te1/0/14", notes: null,
    });
    expect(link.portA).toBe("Gi1/1/1");
    expect(link.portB).toBe("Te1/0/14");
    // The same core port cannot take a second cable.
    await expect(
      topology.createLink(admin(), { deviceAId: acc2.id, portA: "Gi1/1/4", deviceBId: core.id, portB: "Te1/0/14", notes: null }),
    ).rejects.toThrow(/correct the highlighted/i);
    // A loop needs two different ports.
    await expect(
      topology.createLink(admin(), { deviceAId: acc2.id, portA: "Gi1/0/1", deviceBId: acc2.id, portB: "gi1/0/1", notes: null }),
    ).rejects.toThrow(/correct the highlighted/i);
    // Another company's user cannot connect to a Crossroads switch.
    await expect(
      topology.createLink(hrhUser(), { deviceAId: hrhCore.id, portA: "Te1/1/1", deviceBId: core.id, portB: "Te1/1/1", notes: null }),
    ).rejects.toThrow(/correct the highlighted/i);
    const events = await db.auditEvent.findMany({ where: { eventType: "link.created" } });
    expect(events.map((e) => e.targetId).sort()).toEqual([acc1.id, core.id].sort());
  });

  it("imports a neighbour table: merges both ends, records loops, replaces moved cables and lists unknown neighbours", async () => {
    const header = ["Company", "Switch", "Switch IP", "Local port", "Neighbour type", "Neighbour", "Neighbour IP", "Neighbour platform", "Neighbour port", "Seen via"];
    const table = [
      header,
      // Both ends report the same cable.
      ["Crossroads", "BOH-RES-SW03", "10.100.200.12", "Gi1/1/1", "Switch", "BOH_DC_Core_SW1", "10.100.200.254", "cisco", "Te1/0/20", "CDP"],
      ["Crossroads", "BOH_DC_Core_SW1", "10.100.200.254", "TenGigabitEthernet1/0/20", "Switch", "BOH-RES-SW03.crossroadsmv.local", "192.168.0.170", "cisco", "GigabitEthernet1/1/1", "CDP"],
      // The admin switch's uplink moved from Te1/0/14 to Te1/0/15.
      ["Crossroads", "BOH-ADMIN-SW01", "10.100.200.25", "Gi1/1/1", "Switch", "BOH_DC_Core_SW1", "10.100.200.254", "cisco", "Te1/0/15", "CDP"],
      // A loop: the switch hears itself.
      ["Crossroads", "BOH-RES-SW03", "10.100.200.12", "Gi1/0/13", "Switch", "BOH-RES-SW03", "10.100.200.12", "cisco", "Gi1/0/14", "CDP"],
      ["Crossroads", "BOH-RES-SW03", "10.100.200.12", "Gi1/0/14", "Switch", "BOH-RES-SW03", "10.100.200.12", "cisco", "Gi1/0/13", "CDP"],
      // Not in the register.
      ["Crossroads", "BOH-RES-SW03", "10.100.200.12", "Gi1/0/5", "Access point", "CDM-Bar", "10.100.93.169", "cisco AIR", "Gi0", "CDP"],
      ["Crossroads", "UNKNOWN-SW", "10.100.200.99", "Gi1/0/1", "Switch", "BOH_DC_Core_SW1", "", "", "Te1/0/30", "CDP"],
    ];
    const preview = await topology.previewLinkImport(admin(), await workbook(table, "1 Switches v2.xlsx"));
    expect(preview.links).toHaveLength(3);
    const res = preview.links.find((l) => !l.loop && (l.a.id === acc2.id || l.b.id === acc2.id))!;
    expect(res.seenFromBothEnds).toBe(true);
    expect(res.outcome).toBe("new");
    const moved = preview.links.find((l) => l.a.id === acc1.id || l.b.id === acc1.id)!;
    expect(moved.outcome).toBe("changed");
    expect(moved.replaces[0]).toMatch(/Te1\/0\/14/);
    expect(preview.links.filter((l) => l.loop)).toHaveLength(1);
    expect(preview.unmatched.map((u) => u.name).sort()).toEqual(["CDM-Bar", "UNKNOWN-SW"]);

    const result = await topology.commitLinkImport(admin(), await workbook(table, "1 Switches v2.xlsx"), { removeStale: false });
    expect(result).toEqual({ created: 3, confirmed: 0, replaced: 1, removed: 0 });
    const uplink = await db.infraLink.findFirstOrThrow({ where: { OR: [{ deviceAId: acc1.id }, { deviceBId: acc1.id }] } });
    expect([uplink.portA, uplink.portB].sort()).toEqual(["Gi1/1/1", "Te1/0/15"]);
    expect(uplink.source).toBe("DISCOVERY");

    // Running it again only confirms what is there.
    const again = await topology.commitLinkImport(admin(), await workbook(table, "1 Switches v2.xlsx"), { removeStale: false });
    expect(again).toEqual({ created: 0, confirmed: 3, replaced: 0, removed: 0 });

    // The loop cable is gone from the next table, so it can be removed.
    const fixed = table.filter((row) => row[3] !== "Gi1/0/13" && row[3] !== "Gi1/0/14");
    const later = await topology.previewLinkImport(admin(), await workbook(fixed, "later.xlsx"));
    expect(later.stale).toHaveLength(1);
    expect(later.stale[0]!.description).toMatch(/^BOH-RES-SW03 Gi1\/0\/1[34] to BOH-RES-SW03 Gi1\/0\/1[34]$/);
    const cleaned = await topology.commitLinkImport(admin(), await workbook(fixed, "later.xlsx"), { removeStale: true });
    expect(cleaned.removed).toBe(1);
    expect(await db.auditEvent.count({ where: { eventType: "link.imported" } })).toBe(3);
  });

  it("draws only what a company may see, and drops cables with a deleted device", async () => {
    const all = await topology.loadTopology(admin());
    expect(all.nodes.map((n) => n.name).sort()).toEqual(["BOH-ADMIN-SW01", "BOH-RES-SW03", "BOH_DC_Core_SW1"]);
    expect(all.links).toHaveLength(2);
    const hrhView = await topology.loadTopology(hrhUser());
    expect(hrhView.links).toHaveLength(0);
    expect(hrhView.unconnected.map((d) => d.name)).toContain("HRH-CORE-SW01");

    await service.deleteDevice(admin(), acc1.id);
    expect(await db.infraLink.count({ where: { OR: [{ deviceAId: acc1.id }, { deviceBId: acc1.id }] } })).toBe(0);
  });
});
