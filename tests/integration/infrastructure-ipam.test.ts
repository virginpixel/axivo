import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execSync } from "node:child_process";

/**
 * IP & VLAN plan (SDS Doc 24) against a real database: uniqueness, gateway
 * and overlap checks, usage counts, lookups, company scoping and the import
 * of a VLAN plan and an address list.
 */

const DB_NAME = "axivo_integration_ipam";
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
let ipam: typeof import("@/modules/infrastructure/ipam");
let service: typeof import("@/modules/infrastructure/service");

const audit = { actorLabel: "integration-test" };
let cxr: { id: string };
let saii: { id: string };
let switchType: { id: string };
const admin = () => ({ audit, companyId: cxr.id, isGlobalAdmin: true });
const saiiUser = () => ({ audit, companyId: saii.id, isGlobalAdmin: false });

const csv = (name: string, rows: string[][]) =>
  new File([rows.map((r) => r.map((c) => (/[",]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(",")).join("\n")], name, { type: "text/csv" });

const subnet = (overrides: Record<string, unknown>) => ({
  companyId: cxr.id, cidr: "", vlanId: null, gateway: null, dhcpRelay: null, locationId: null, purpose: null, status: "ACTIVE" as const, notes: null,
  ...overrides,
});

beforeAll(async () => {
  execSync(
    `docker exec axivo-dev-pg psql -U axivo -d postgres -c "DROP DATABASE IF EXISTS ${DB_NAME} WITH (FORCE);" -c "CREATE DATABASE ${DB_NAME};"`,
    { stdio: "pipe" },
  );
  execSync(`npx prisma migrate deploy`, { cwd: process.cwd(), env: { ...process.env, DATABASE_URL: TEST_DB_URL }, stdio: "pipe" });
  ({ db } = await import("@/shared/db"));
  ipam = await import("@/modules/infrastructure/ipam");
  service = await import("@/modules/infrastructure/service");
  cxr = await db.company.create({ data: { name: "Crossroads" } });
  saii = await db.company.create({ data: { name: "SAii Lagoon Maldives" } });
  switchType = await db.infraDeviceType.create({ data: { kind: "NETWORK", name: "Switch" } });
}, 180_000);

afterAll(async () => {
  await db?.$disconnect();
});

describe("VLANs, subnets and addresses", () => {
  it("keeps VLAN numbers unique per company and checks a subnet before saving it", async () => {
    const mgmt = await ipam.createVlan(admin(), { companyId: cxr.id, number: 5, name: "Management", purpose: null, status: "ACTIVE", notes: null });
    await expect(ipam.createVlan(admin(), { companyId: cxr.id, number: 5, name: "Again", purpose: null, status: "ACTIVE", notes: null }))
      .rejects.toMatchObject({ fieldErrors: { number: expect.stringMatching(/already exists/) } });
    // Same number in another company is fine.
    await ipam.createVlan(admin(), { companyId: saii.id, number: 5, name: "Saii_Management", purpose: null, status: "ACTIVE", notes: null });

    await expect(ipam.createSubnet(admin(), subnet({ cidr: "10.100.100.7/24" }))).rejects.toMatchObject({ fieldErrors: { cidr: expect.stringMatching(/Did you mean 10\.100\.100\.0\/24/) } });
    await expect(ipam.createSubnet(admin(), subnet({ cidr: "10.100.100.0/24", gateway: "10.100.101.1" }))).rejects.toMatchObject({ fieldErrors: { gateway: expect.any(String) } });
    const created = await ipam.createSubnet(admin(), subnet({ cidr: "10.100.100.0 255.255.255.0", vlanId: mgmt.id, gateway: "10.100.100.254" }));
    expect(created).toMatchObject({ network: "10.100.100.0", prefix: 24 });
    await expect(ipam.createSubnet(admin(), subnet({ cidr: "10.100.100.0/24" }))).rejects.toMatchObject({ fieldErrors: { cidr: expect.stringMatching(/already recorded/) } });
  });

  it("counts usage, finds overlaps and the next free address, and looks an IP up", async () => {
    const wide = await ipam.createSubnet(admin(), subnet({ cidr: "10.100.0.0/16" }));
    const device = await service.createDevice(admin(), {
      companyId: cxr.id, typeId: switchType.id, name: "CORE", hostname: null, ipAddress: "10.100.100.2", locationId: null, manufacturerId: null,
      model: null, serialNumber: null, operatingSystem: null, version: null, domain: null, purpose: null, status: "ACTIVE", hostDeviceId: null,
      notes: null, applicationIds: [], assetMode: "keep", assetCategoryId: null, assetLookup: null,
    });
    await ipam.saveIpAddress(admin(), { companyId: cxr.id, address: "10.100.100.1", status: "USED", hostname: "fw", macAddress: "AA-BB-CC-DD-EE-01", deviceId: null, description: null });
    await ipam.saveIpAddress(admin(), { companyId: cxr.id, address: "10.100.100.3", status: "RESERVED", hostname: null, macAddress: null, deviceId: null, description: "Printer" });
    await expect(
      ipam.saveIpAddress(admin(), { companyId: cxr.id, address: "10.100.100.1", status: "USED", hostname: null, macAddress: null, deviceId: null, description: null }),
    ).rejects.toMatchObject({ fieldErrors: { address: expect.stringMatching(/already recorded for fw/) } });

    const plan = await ipam.loadPlan(admin());
    const mgmt = plan.vlans.find((v) => v.number === 5 && v.companyId === cxr.id)!;
    // Two recorded addresses and the CORE switch from the register.
    expect(mgmt.subnets[0]).toMatchObject({ cidr: "10.100.100.0/24", used: 3, usable: 254, overlapsWith: ["10.100.0.0/16"] });
    expect(plan.looseSubnets.find((s) => s.id === wide.id)).toMatchObject({ overlapsWith: ["10.100.100.0/24"] });

    const detail = await ipam.loadSubnet(admin(), mgmt.subnets[0]!.id);
    expect(detail.devices.map((d) => d.id)).toEqual([device.id]);
    // .1 recorded, .2 the device, .3 reserved: .4 is next.
    expect(detail.nextFree).toBe("10.100.100.4");
    expect(detail.addresses[0]).toMatchObject({ macAddress: "aa:bb:cc:dd:ee:01" });

    const found = await ipam.lookupIp(admin(), "10.100.100.3");
    expect(found!.subnets.map((s) => `${s.network}/${s.prefix}`)).toEqual(["10.100.100.0/24", "10.100.0.0/16"]);
    expect(found!.records[0]).toMatchObject({ status: "RESERVED" });
  });

  it("keeps each company to its own plan", async () => {
    const theirs = await ipam.loadPlan(saiiUser());
    expect(theirs.vlans.map((v) => v.name)).toEqual(["Saii_Management"]);
    const cxrSubnet = await db.subnet.findFirstOrThrow({ where: { companyId: cxr.id } });
    await expect(ipam.loadSubnet(saiiUser(), cxrSubnet.id)).rejects.toThrow();
    await expect(ipam.createVlan(saiiUser(), { companyId: cxr.id, number: 99, name: "X", purpose: null, status: "ACTIVE", notes: null })).rejects.toThrow();
  });
});

describe("import", () => {
  const planFile = () =>
    csv("2 VLANs and IP ranges.csv", [
      ["Site", "VLAN", "Name", "Subnet", "Gateway (switch)", "DHCP relay", "Suggested"],
      ["Crossroads", "5", "Management", "10.100.100.0/24", "10.100.100.254 (BOH_DC_Core_SW1)", "", "Keep"],
      ["Crossroads", "90", "AP_BOH", "10.1.110.0/24", "10.1.110.254 (BOH_DC_Core_SW1)", "10.100.100.10", "Keep"],
      ["Crossroads", "6", "Crossroads", "", "", "", "Not in use"],
      ["SAii Lagoon", "40", "Saii-Staff", "192.168.40.0/24", "192.168.40.1", "", "Keep"],
      ["Hard Rock Hotel", "99", "MANAGMENT", "10.70.99.0/24", "", "", "Keep"],
      ["Crossroads", "91", "AP_BOH_OLD", "10.1.110.0/24", "", "", "Keep"],
    ]);

  it("previews and imports a VLAN plan, matching companies by name", async () => {
    const preview = await ipam.previewIpamImport(admin(), planFile());
    expect(preview.plan).toMatchObject({ vlansNew: 4, vlansSame: 1, subnetsNew: 2, subnetsSame: 1, unmatched: [{ text: "Hard Rock Hotel", rows: 1 }] });
    // The same subnet under a second VLAN stays with the first.
    expect(preview.plan!.problems).toEqual([{ row: 7, error: expect.stringMatching(/10\.1\.110\.0\/24 is also listed under VLAN 90/) }]);
    const result = await ipam.commitIpamImport(admin(), planFile());
    expect(result).toMatchObject({ vlansCreated: 4, subnetsCreated: 2 });
    expect(await db.vlan.findFirst({ where: { companyId: cxr.id, number: 6 } })).toMatchObject({ status: "UNUSED" });
    expect(await db.subnet.findFirst({ where: { network: "10.1.110.0" } })).toMatchObject({ dhcpRelay: "10.100.100.10", gateway: "10.1.110.254", source: "DISCOVERY" });
    // A second run changes nothing.
    const again = await ipam.previewIpamImport(admin(), planFile());
    expect(again.plan).toMatchObject({ vlansNew: 0, subnetsNew: 0, subnetsChanged: [] });
  });

  it("imports addresses into the company whose subnet holds them, and keeps what was typed", async () => {
    const file = () =>
      csv("3 Live devices.csv", [
        ["Site", "IP", "DNS name", "MAC", "MAC vendor", "Switch", "Port", "Known as"],
        ["Crossroads", "10.1.110.73", "", "a8:b4:56:f3:32:a8", "Cisco Systems", "MARI-DR12-SW01", "Gi1/0/21", ""],
        ["", "192.168.40.20", "pos-01", "00:11:22:33:44:55", "HP", "", "", ""],
        ["Crossroads", "10.100.100.3", "printer-3", "00:11:22:33:44:66", "Brother", "SW1", "Gi1/0/3", ""],
        ["", "172.31.0.1", "", "", "", "", "", ""],
      ]);
    const preview = await ipam.previewIpamImport(admin(), file());
    expect(preview.addresses).toMatchObject({ new: 2, updated: 1, noSubnet: 1 });
    await ipam.commitIpamImport(admin(), file());
    expect(await db.ipAddress.findFirst({ where: { address: "192.168.40.20" } })).toMatchObject({ companyId: saii.id, hostname: "pos-01", source: "DISCOVERY" });
    // The reserved printer keeps its status and description, and gains what discovery saw.
    expect(await db.ipAddress.findFirst({ where: { address: "10.100.100.3" } })).toMatchObject({
      status: "RESERVED", description: "Printer", hostname: "printer-3", macVendor: "Brother", switchName: "SW1",
    });
  });
});
