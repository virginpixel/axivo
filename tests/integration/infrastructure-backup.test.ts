import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execSync } from "node:child_process";
import type { AddressInfo } from "node:net";
import { Server, utils, type Connection } from "ssh2";

/**
 * Configuration backups and asset links (SDS Doc 24) against a real database
 * and a fake switch: an SSH server in this process that behaves like a Cisco
 * IOS box (user mode, enable, paging) or a small-business one (login asked
 * again inside the session).
 */

const DB_NAME = "axivo_integration_backup";
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
let runner: typeof import("@/modules/infrastructure/config-runner");
let ssh: typeof import("@/modules/infrastructure/config-ssh");
let backups: typeof import("@/modules/infrastructure/config-backup");
let assetLinks: typeof import("@/modules/infrastructure/asset-link");
let ipam: typeof import("@/modules/infrastructure/ipam");
let arp: typeof import("@/modules/infrastructure/arp-runner");

const LOGIN = { username: "netadmin", password: "S3cret-Switch-Pass!" };
const ENABLE = "En4ble-Pass!";
const audit = { actorLabel: "integration-test" };
let cxr: { id: string };
let switchType: { id: string };
let category: { id: string };
const admin = () => ({ audit, companyId: cxr.id, isGlobalAdmin: true });

// ---------------------------------------------------------------------------
// The fake switch
// ---------------------------------------------------------------------------

interface FakeSwitch {
  mode: "ios" | "sb";
  hostname: string;
  serial: string;
  firmware: string;
  config: string[];
  commands: string[];
  /** Ignores the command that turns paging off, so the pager must be answered. */
  stubborn?: boolean;
}

function versionText(sw: FakeSwitch) {
  return sw.mode === "ios"
    ? `Cisco IOS XE Software, Version ${sw.firmware}\r\n${sw.hostname} uptime is 3 weeks\r\ncisco C9300-48P (X86) processor\r\nModel Number                       : C9300-48P\r\nSystem Serial Number               : ${sw.serial}\r\n`
    : `SW version    ${sw.firmware} ( date  02-Sep-2020 time  16:52:22 )\r\n`;
}

function startSwitch(sw: FakeSwitch): Promise<{ port: number; close: () => void }> {
  const hostKey = utils.generateKeyPairSync("ed25519").private;
  const server = new Server({ hostKeys: [hostKey] }, (client: Connection) => {
    client.on("authentication", (ctx) => {
      if (sw.mode === "sb") return ctx.method === "none" ? ctx.accept() : ctx.reject(["none"]);
      if (ctx.method === "password" && ctx.username === LOGIN.username && ctx.password === LOGIN.password) return ctx.accept();
      return ctx.reject(["password"]);
    });
    client.on("ready", () => {
      client.on("session", (accept) => {
        const session = accept();
        session.on("pty", (acceptPty) => acceptPty?.());
        session.on("shell", (acceptShell) => {
          const stream = acceptShell();
          let line = "";
          let state: "user" | "password" | "login" | "login-password" | "enable-password" | "prompt" | "paged" = sw.mode === "sb" ? "login" : "prompt";
          let enabled = sw.mode === "sb";
          let paging = true;
          let pending: string[] = [];
          const prompt = () => stream.write(`\r\n${sw.hostname}${enabled ? "#" : ">"}`);
          const page = () => {
            const chunk = paging ? pending.splice(0, 20) : pending.splice(0);
            stream.write(chunk.join("\r\n") + "\r\n");
            if (pending.length > 0 && paging) {
              state = "paged";
              stream.write(" --More-- ");
            } else {
              state = "prompt";
              prompt();
            }
          };
          if (sw.mode === "sb") stream.write("\r\nUser Name:");
          else {
            stream.write("\r\nUnauthorised access prohibited\r\n");
            prompt();
          }
          const run = (command: string) => {
            sw.commands.push(command);
            if (command === "enable") {
              state = "enable-password";
              return stream.write("\r\nPassword: ");
            }
            if (command === "terminal length 0" || command === "terminal datadump") paging = !!sw.stubborn;
            else if (command === "show version") stream.write(`\r\n${versionText(sw)}`);
            else if (command === "show inventory") stream.write(`\r\nPID: SG350-28P-K9   VID: V01   SN: ${sw.serial}\r\n`);
            else if (command === "show system") stream.write("\r\nSystem Name: SB\r\n");
            else if (command === "show ip arp") {
              stream.write(
                "\r\nProtocol  Address          Age (min)  Hardware Addr   Type   Interface\r\n" +
                  "Internet  10.100.35.254           -   0011.2233.4455  ARPA   Vlan50\r\n" +
                  "Internet  10.100.32.5            12   aabb.cc00.0005  ARPA   Vlan50\r\n" +
                  "Internet  10.100.32.10            3   aabb.cc00.0010  ARPA   Vlan50\r\n" +
                  "Internet  10.100.33.7             0   aabb.cc00.0337  ARPA   Vlan50\r\n" +
                  "Internet  10.100.34.9             0   Incomplete      ARPA\r\n" +
                  "Internet  10.1.1.1                5   aabb.cc00.0101  ARPA   Vlan1\r\n",
              );
            }
            else if (command === "show running-config") {
              if (!enabled) {
                stream.write("\r\n% Invalid input detected at '^' marker.\r\n");
              } else {
                stream.write("\r\nBuilding configuration...\r\n\r\nCurrent configuration : 999 bytes\r\n");
                pending = [...sw.config];
                return page();
              }
            } else if (command === "exit") return stream.close();
            else if (command !== "") stream.write("\r\n% Invalid input detected at '^' marker.\r\n");
            prompt();
          };
          stream.on("data", (data: Buffer) => {
            for (const ch of data.toString("utf8")) {
              if (state === "paged") {
                if (ch === " ") page();
                continue;
              }
              if (ch !== "\r" && ch !== "\n") {
                line += ch;
                // Echo what is typed, except passwords.
                if (state === "prompt" || state === "login") stream.write(ch);
                continue;
              }
              const input = line;
              line = "";
              if (state === "login") {
                state = input === LOGIN.username ? "login-password" : "login";
                stream.write(state === "login" ? "\r\nUser Name:" : "\r\nPassword:");
              } else if (state === "login-password") {
                if (input === LOGIN.password) {
                  state = "prompt";
                  prompt();
                } else {
                  state = "login";
                  stream.write("\r\nLogin failed\r\nUser Name:");
                }
              } else if (state === "enable-password") {
                enabled = input === ENABLE;
                state = "prompt";
                if (!enabled) stream.write("\r\n% Access denied\r\n");
                prompt();
              } else {
                run(input.trim());
              }
            }
          });
        });
      });
    });
    client.on("error", () => undefined);
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      resolve({ port: (server.address() as AddressInfo).port, close: () => server.close() });
    });
  });
}

const CONFIG = [
  "!",
  "! Last configuration change at 02:00:01 MVT Mon Nov 17 2026 by netadmin",
  "version 16.12",
  "hostname SW-TEST",
  "interface Vlan50",
  " ip address 10.100.35.254 255.255.252.0",
  ...Array.from({ length: 48 }, (_, i) => `interface GigabitEthernet1/0/${i + 1}\n switchport access vlan 10`).join("\n").split("\n"),
  "end",
];

let iosSwitch: FakeSwitch;
let iosServer: { port: number; close: () => void };
let sbSwitch: FakeSwitch;
let sbServer: { port: number; close: () => void };

beforeAll(async () => {
  execSync(
    `docker exec axivo-dev-pg psql -U axivo -d postgres -c "DROP DATABASE IF EXISTS ${DB_NAME} WITH (FORCE);" -c "CREATE DATABASE ${DB_NAME};"`,
    { stdio: "pipe" },
  );
  execSync(`npx prisma migrate deploy`, { cwd: process.cwd(), env: { ...process.env, DATABASE_URL: TEST_DB_URL }, stdio: "pipe" });
  ({ db } = await import("@/shared/db"));
  service = await import("@/modules/infrastructure/service");
  vault = await import("@/modules/infrastructure/vault");
  runner = await import("@/modules/infrastructure/config-runner");
  ssh = await import("@/modules/infrastructure/config-ssh");
  backups = await import("@/modules/infrastructure/config-backup");
  assetLinks = await import("@/modules/infrastructure/asset-link");
  ipam = await import("@/modules/infrastructure/ipam");
  arp = await import("@/modules/infrastructure/arp-runner");
  cxr = await db.company.create({ data: { name: "Crossroads" } });
  switchType = await db.infraDeviceType.create({ data: { kind: "NETWORK", name: "Switch" } });
  category = await db.assetCategory.create({ data: { name: "Network Switch" } });

  iosSwitch = { mode: "ios", hostname: "SW-TEST", serial: "FOC2236X0AB", firmware: "16.12.04", config: [...CONFIG], commands: [] };
  sbSwitch = { mode: "sb", hostname: "SB-TEST", serial: "DNI2233AB12", firmware: "3.0.0.69", config: [...CONFIG], commands: [] };
  iosServer = await startSwitch(iosSwitch);
  sbServer = await startSwitch(sbSwitch);
}, 180_000);

afterAll(async () => {
  iosServer?.close();
  sbServer?.close();
  await db?.$disconnect();
});

function device(overrides: Record<string, unknown>) {
  return {
    companyId: cxr.id, typeId: switchType.id, name: "SW", hostname: null, ipAddress: null, locationId: null,
    manufacturerId: null, model: null, serialNumber: null, operatingSystem: null, version: null, domain: null,
    purpose: null, status: "ACTIVE" as const, hostDeviceId: null, notes: null, applicationIds: [],
    assetMode: "keep" as const, assetCategoryId: null, assetLookup: null, ...overrides,
  };
}

describe("reading a switch over SSH", () => {
  it("logs in, enters enable, turns paging off and reads the whole configuration", async () => {
    const result = await ssh.collectConfig({ host: "127.0.0.1", port: iosServer.port, ...LOGIN, enablePassword: ENABLE, timeoutMs: 30_000 });
    expect(result.family).toBe("ios");
    expect(result.prompt).toBe("SW-TEST#");
    expect(result.config.split("\n")).toEqual(CONFIG);
    // Only read-only commands were ever sent.
    expect(iosSwitch.commands.every((c) => c === "enable" || c === "exit" || c.startsWith("show ") || c === "terminal length 0")).toBe(true);
  }, 30_000);

  it("answers the pager when paging cannot be turned off", async () => {
    iosSwitch.stubborn = true;
    try {
      const result = await ssh.collectConfig({ host: "127.0.0.1", port: iosServer.port, ...LOGIN, enablePassword: ENABLE, timeoutMs: 30_000 });
      expect(result.config.split("\n")).toEqual(CONFIG);
    } finally {
      iosSwitch.stubborn = false;
    }
  }, 30_000);

  it("explains a wrong password and a wrong enable password", async () => {
    await expect(
      ssh.collectConfig({ host: "127.0.0.1", port: iosServer.port, username: LOGIN.username, password: "wrong", timeoutMs: 20_000 }),
    ).rejects.toThrow(/Login refused/);
    await expect(
      ssh.collectConfig({ host: "127.0.0.1", port: iosServer.port, ...LOGIN, enablePassword: "nope", timeoutMs: 20_000 }),
    ).rejects.toThrow(/enable password was refused/);
  }, 45_000);

  it("logs in to a small-business switch that asks inside the session", async () => {
    const result = await ssh.collectConfig({ host: "127.0.0.1", port: sbServer.port, ...LOGIN, timeoutMs: 30_000 });
    expect(result.family).toBe("sb");
    expect(result.config.split("\n")).toEqual(CONFIG);
    expect(sbSwitch.commands).toContain("terminal datadump");
  }, 30_000);
});

describe("the backup pass", () => {
  let deviceId: string;

  it("saves the first copy, skips devices with no login, and updates the register", async () => {
    const created = await service.createDevice(
      admin(),
      device({ name: "SW-TEST", ipAddress: "127.0.0.1", model: "old-model", version: "16.9.1", assetMode: "create", assetCategoryId: category.id }),
    );
    deviceId = created.id;
    await service.createDevice(admin(), device({ name: "NO-LOGIN", ipAddress: "10.0.0.9" }));
    const login = await vault.createCredentialSet(admin(), { companyId: cxr.id, name: "Switch SSH", username: LOGIN.username, password: LOGIN.password, notes: null });
    const enable = await vault.createCredentialSet(admin(), { companyId: cxr.id, name: "Switch enable", username: null, password: ENABLE, notes: null });
    await vault.linkCredential(admin(), { deviceId, credentialSetId: login.id, purpose: "SSH" });
    await vault.linkCredential(admin(), { deviceId, credentialSetId: enable.id, purpose: "Enable" });

    // The worker's collector, pointed at the fake switch's port.
    const collect = (input: Parameters<typeof ssh.collectConfig>[0]) => ssh.collectConfig({ ...input, port: iosServer.port, timeoutMs: 30_000 });
    const runId = await runner.runConfigBackup({ trigger: "SCHEDULED" }, collect);
    const run = await db.infraBackupRun.findUniqueOrThrow({ where: { id: runId } });
    expect(run).toMatchObject({ devices: 2, changed: 1, unchanged: 0, failed: 0, skipped: 1 });

    const saved = await db.infraDevice.findUniqueOrThrow({ where: { id: deviceId }, include: { asset: true, configs: true } });
    expect(saved).toMatchObject({ configStatus: "OK", model: "C9300-48P", serialNumber: "FOC2236X0AB", version: "16.12.04", operatingSystem: "Cisco IOS-XE" });
    expect(saved.configs).toHaveLength(1);
    // The configuration is stored encrypted, never as text.
    expect(saved.configs[0]!.contentCiphertext).not.toContain("hostname");
    // The asset made with the device had no serial: filled in from the switch.
    // Its model was typed in, so it stays.
    expect(saved.asset).toMatchObject({ name: "SW-TEST", serialNumber: "FOC2236X0AB", model: "old-model" });
    const noLogin = await db.infraDevice.findFirstOrThrow({ where: { name: "NO-LOGIN" } });
    expect(noLogin).toMatchObject({ configStatus: "SKIPPED" });
    expect(noLogin.configError).toMatch(/No SSH login/);
  }, 60_000);

  it("keeps no new copy when only the clock line changed, and a new one when the config did", async () => {
    const collect = (input: Parameters<typeof ssh.collectConfig>[0]) => ssh.collectConfig({ ...input, port: iosServer.port, timeoutMs: 30_000 });
    iosSwitch.config[1] = "! Last configuration change at 09:15:44 MVT Tue Nov 18 2026 by netadmin";
    await runner.runConfigBackup({ trigger: "MANUAL", deviceIds: [deviceId], actorUserId: null }, collect);
    expect(await db.infraConfigBackup.count({ where: { deviceId } })).toBe(1);

    iosSwitch.config.splice(5, 0, " description Uplink to core");
    iosSwitch.firmware = "17.9.4";
    await runner.runConfigBackup({ trigger: "MANUAL", deviceIds: [deviceId], actorUserId: null }, collect);
    const copies = await db.infraConfigBackup.findMany({ where: { deviceId }, orderBy: { takenAt: "desc" } });
    expect(copies).toHaveLength(2);
    expect(copies[0]).toMatchObject({ linesAdded: 1, linesRemoved: 0, firmware: "17.9.4" });
    const events = await db.auditEvent.findMany({ where: { targetId: deviceId }, select: { eventType: true, action: true } });
    expect(events.map((e) => e.eventType)).toEqual(expect.arrayContaining(["config.saved", "config.changed", "device.updated_from_device"]));
    expect(events.find((e) => e.eventType === "config.changed")?.action).toMatch(/1 line added, 0 removed/);

    // Reading it back is audited and shows the change.
    const read = await backups.readBackup(admin(), deviceId, copies[0]!.id, "compare");
    expect(read.content).toContain(" description Uplink to core");
    expect(read.diff?.filter((l) => l.kind === "added").map((l) => l.text)).toEqual([" description Uplink to core"]);
    expect(await db.auditEvent.count({ where: { targetId: deviceId, eventType: "config.viewed" } })).toBe(1);
  }, 60_000);

  it("records a failure on the device and carries on", async () => {
    const failing = async () => {
      throw new ssh.CollectError("Cannot reach the device's IP address.");
    };
    await runner.runConfigBackup({ trigger: "MANUAL", deviceIds: [deviceId] }, failing);
    expect(await db.infraDevice.findUniqueOrThrow({ where: { id: deviceId } })).toMatchObject({
      configStatus: "FAILED",
      configError: "Cannot reach the device's IP address.",
    });
    expect(await db.infraConfigBackup.count({ where: { deviceId } })).toBe(2);
  });

  it("tries the next SSH login when one is refused, and not when the switch cannot be reached", async () => {
    // An older SSH login with a wrong password, linked before the right one.
    const right = await db.infraDeviceCredential.findFirstOrThrow({ where: { deviceId, purpose: "SSH" }, include: { credentialSet: true } });
    await vault.unlinkCredential(admin(), right.id);
    const stale = await vault.createCredentialSet(admin(), { companyId: cxr.id, name: "Old SSH", username: LOGIN.username, password: "wrong", notes: null });
    await vault.linkCredential(admin(), { deviceId, credentialSetId: stale.id, purpose: "SSH" });
    await vault.linkCredential(admin(), { deviceId, credentialSetId: right.credentialSetId, purpose: "SSH" });

    const collect = (input: Parameters<typeof ssh.collectConfig>[0]) => ssh.collectConfig({ ...input, port: iosServer.port, timeoutMs: 30_000 });
    await runner.runConfigBackup({ trigger: "MANUAL", deviceIds: [deviceId] }, collect);
    const saved = await db.infraDevice.findUniqueOrThrow({ where: { id: deviceId } });
    expect(saved.configStatus).toBe("OK");
    expect(saved.configError).toMatch(/^Logged in with "Switch SSH"\. "Old SSH": Login refused/);

    // A switch that cannot be reached fails the same way for every login: tried once.
    let calls = 0;
    const unreachable = async () => {
      calls += 1;
      throw new ssh.CollectError("No answer on SSH (port 22).");
    };
    await runner.runConfigBackup({ trigger: "MANUAL", deviceIds: [deviceId] }, unreachable);
    expect(calls).toBe(1);
    expect(await db.infraDevice.findUniqueOrThrow({ where: { id: deviceId } })).toMatchObject({
      configStatus: "FAILED",
      configError: "No answer on SSH (port 22).",
    });

    // Every login refused: the message names each one.
    const refused = async (input: { username: string; password: string }) => {
      throw new ssh.CollectError(`Login refused for ${input.password === "wrong" ? "the old one" : "the new one"}.`, true);
    };
    await runner.runConfigBackup({ trigger: "MANUAL", deviceIds: [deviceId] }, refused as never);
    expect((await db.infraDevice.findUniqueOrThrow({ where: { id: deviceId } })).configError).toBe(
      '"Old SSH": Login refused for the old one. "Switch SSH": Login refused for the new one.',
    );
  }, 60_000);
});

describe("reading a subnet's ARP table", () => {
  it("finds the routing switch from its saved configuration and records what the ARP table holds", async () => {
    const sw = await db.infraDevice.findFirstOrThrow({ where: { name: "SW-TEST" } });
    // The backup above saved the interfaces it routes.
    expect(sw.routedNetworks).toEqual(expect.arrayContaining([{ interface: "Vlan50", address: "10.100.35.254", prefix: 22 }]));

    const subnet = await ipam.createSubnet(admin(), {
      companyId: cxr.id, cidr: "10.100.32.0/22", vlanId: null, gateway: "10.100.35.254", dhcpRelay: null, locationId: null, purpose: null, status: "ACTIVE", notes: null,
    });
    expect((await ipam.routingSwitch(subnet))?.name).toBe("SW-TEST");
    await ipam.setArpScan(admin(), subnet.id, { enabled: true, deviceId: null });
    // Recorded by hand before: keeps its status, gains what the switch saw.
    await ipam.saveIpAddress(admin(), { companyId: cxr.id, address: "10.100.32.5", status: "RESERVED", hostname: "nvr", macAddress: null, deviceId: null, description: null });

    const collect = (input: Parameters<typeof ssh.collectArp>[0]) => ssh.collectArp({ ...input, port: iosServer.port, timeoutMs: 30_000 });
    const totals = await arp.runArpScan({}, collect);
    expect(totals).toMatchObject({ subnets: 1, found: 3, added: 2, failed: 0 });
    expect(iosSwitch.commands).toContain("show ip arp");

    const inside = await db.ipAddress.findMany({ where: { companyId: cxr.id, address: { startsWith: "10.100.3" } }, orderBy: { addressNum: "asc" } });
    // Not the switch's own address, not an incomplete entry, nothing outside the subnet.
    expect(inside.map((a) => a.address)).toEqual(["10.100.32.5", "10.100.32.10", "10.100.33.7"]);
    expect(inside[0]).toMatchObject({ status: "RESERVED", hostname: "nvr", macAddress: "aa:bb:cc:00:00:05", source: "MANUAL" });
    expect(inside[1]).toMatchObject({ status: "USED", macAddress: "aa:bb:cc:00:00:10", source: "DISCOVERY" });
    expect(inside.every((a) => a.lastSeenAt)).toBe(true);
    expect(await db.subnet.findUniqueOrThrow({ where: { id: subnet.id } })).toMatchObject({ arpStatus: "OK", arpMessage: "Read from SW-TEST: 3 addresses, 2 new." });

    // A second read adds nothing and removes nothing.
    expect(await arp.runArpScan({ subnetIds: [subnet.id] }, collect)).toMatchObject({ found: 3, added: 0 });
    expect(await db.ipAddress.count({ where: { companyId: cxr.id, address: { startsWith: "10.100.3" } } })).toBe(3);
  }, 60_000);
});

describe("devices and assets", () => {
  it("creates the asset with the device, and refuses a second one with the same name", async () => {
    const created = await service.createDevice(
      admin(),
      device({ name: "CORE-A", serialNumber: "FOC111", model: "C9500", assetMode: "create", assetCategoryId: category.id, assetLookup: "CXR-NET-001" }),
    );
    const linked = await db.infraDevice.findUniqueOrThrow({ where: { id: created.id }, include: { asset: true } });
    expect(linked.asset).toMatchObject({ name: "CORE-A", assetTag: "CXR-NET-001", serialNumber: "FOC111", model: "C9500", companyId: cxr.id, status: "IN_USE" });

    await db.asset.create({ data: { companyId: cxr.id, categoryId: category.id, name: "CORE-B", serialNumber: "FOC222" } });
    await expect(
      service.createDevice(admin(), device({ name: "CORE-B", serialNumber: "FOC222", assetMode: "create", assetCategoryId: category.id })),
    ).rejects.toMatchObject({ fieldErrors: { assetCategoryId: expect.stringMatching(/already in the asset register/) } });
  });

  it("links an existing asset by tag or serial, and not one already taken", async () => {
    const tagged = await db.asset.create({ data: { companyId: cxr.id, categoryId: category.id, name: "Spare switch", assetTag: "CXR-NET-050" } });
    const made = await service.createDevice(admin(), device({ name: "ACC-50", assetMode: "link", assetLookup: "cxr-net-050" }));
    expect((await db.infraDevice.findUniqueOrThrow({ where: { id: made.id } })).assetId).toBe(tagged.id);
    expect((await db.asset.findUniqueOrThrow({ where: { id: tagged.id } })).status).toBe("IN_USE");
    await expect(
      service.createDevice(admin(), device({ name: "ACC-51", assetMode: "link", assetLookup: "CXR-NET-050" })),
    ).rejects.toMatchObject({ fieldErrors: { assetLookup: expect.stringMatching(/already linked to "ACC-50"/) } });
    // Unlinking leaves the asset in place.
    await service.updateDevice(admin(), made.id, device({ name: "ACC-50", assetMode: "none" }));
    expect((await db.infraDevice.findUniqueOrThrow({ where: { id: made.id } })).assetId).toBeNull();
    // Unlinked, it is no longer installed anywhere: back to Available.
    expect((await db.asset.findUniqueOrThrow({ where: { id: tagged.id } })).status).toBe("AVAILABLE");
  });

  it("links many at once: serial first, then name, else a new asset", async () => {
    const bySerial = await service.createDevice(admin(), device({ name: "DIST-1", serialNumber: "FOC333" }));
    const byName = await service.createDevice(admin(), device({ name: "DIST-2" }));
    const fresh = await service.createDevice(admin(), device({ name: "DIST-3", serialNumber: "FOC444" }));
    await db.asset.create({ data: { companyId: cxr.id, categoryId: category.id, name: "Old label", serialNumber: "foc333" } });
    await db.asset.create({ data: { companyId: cxr.id, categoryId: category.id, name: "dist-2" } });

    const plan = await assetLinks.planAssetLinks(null, "NETWORK", true);
    const row = (id: string) => plan.find((r) => r.deviceId === id)!;
    expect(row(bySerial.id)).toMatchObject({ action: "link", reason: "Same serial number" });
    expect(row(byName.id)).toMatchObject({ action: "link", reason: "Same name" });
    expect(row(fresh.id)).toMatchObject({ action: "create" });

    const result = await assetLinks.commitAssetLinks(audit, null, "NETWORK", category.id);
    expect(result.linked).toBeGreaterThanOrEqual(2);
    const after = await db.infraDevice.findMany({ where: { id: { in: [bySerial.id, byName.id, fresh.id] } }, include: { asset: true } });
    expect(after.every((d) => d.assetId)).toBe(true);
    expect(after.find((d) => d.id === fresh.id)!.asset).toMatchObject({ name: "DIST-3", serialNumber: "FOC444" });
    // Nothing left to do the second time.
    expect((await assetLinks.planAssetLinks(null, "NETWORK", true)).filter((r) => r.action !== "skip")).toHaveLength(0);
  });
});
