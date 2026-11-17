import { describe, it, expect } from "vitest";
import {
  cleanConfig, comparable, detectFamily, diffCounts, diffLines, looksLikeConfig, parseIdentity, plain, scheduledRunDue,
} from "@/modules/infrastructure/config-parse";
import { pickLogins } from "@/modules/infrastructure/config-runner";

const IOS_XE = `Cisco IOS XE Software, Version 16.12.04
Cisco IOS Software [Gibraltar], Catalyst L3 Switch Software (CAT9K_IOSXE), Version 16.12.4, RELEASE SOFTWARE (fc5)
BOH_DC_Core_SW1 uptime is 1 year, 2 weeks, 3 days
cisco C9300-48P (X86) processor with 1392780K/6147K bytes of memory.
Processor board ID FOC2236X0AB
Model Number                       : C9300-48P
System Serial Number               : FOC2236X0AB
`;

const IOS_15 = `Cisco IOS Software, C2960X Software (C2960X-UNIVERSALK9-M), Version 15.2(7)E3, RELEASE SOFTWARE (fc3)
BOH-CLUB-SW01 uptime is 20 weeks
cisco WS-C2960X-48FPD-L (APM86XXX) processor (revision B0) with 524288K bytes of memory.
Processor board ID FOC1932S0XY
Model number                    : WS-C2960X-48FPD-L
System serial number            : FOC1932S0XY
`;

describe("config backup: what the device says about itself", () => {
  it("reads IOS XE and IOS 15 the way discovery did", () => {
    expect(detectFamily(IOS_XE)).toBe("ios");
    expect(parseIdentity("ios", { "show version": IOS_XE })).toEqual({
      operatingSystem: "Cisco IOS-XE", model: "C9300-48P", serialNumber: "FOC2236X0AB", version: "16.12.04",
    });
    expect(parseIdentity("ios", { "show version": IOS_15 })).toEqual({
      operatingSystem: "Cisco IOS", model: "WS-C2960X-48FPD-L", serialNumber: "FOC1932S0XY", version: "15.2(7)E3",
    });
  });

  it("falls back to show inventory for the serial", () => {
    const version = "Cisco IOS Software, C3560 Software (C3560-IPBASEK9-M), Version 12.2(55)SE12\ncisco WS-C3560-24PS (PowerPC405) processor\n";
    const inventory = 'NAME: "1", DESCR: "WS-C3560-24PS"\nPID: WS-C3560-24PS-S , VID: V06, SN: CAT1234ABCD\n';
    const identity = parseIdentity("ios", { "show version": version, "show inventory": inventory });
    expect(identity.serialNumber).toBe("CAT1234ABCD");
    expect(identity.model).toBe("WS-C3560-24PS");
  });

  it("reads small-business, ProCurve and CX switches", () => {
    const sbVersion = "SW version    3.0.0.69 ( date  02-Sep-2020 time  16:52:22 )\nBoot version    1.4.0.02\n";
    expect(detectFamily(sbVersion)).toBe("sb");
    expect(parseIdentity("sb", {
      "show version": sbVersion,
      "show inventory": 'NAME: "1"  DESCR: "SG350-28P 28-Port Gigabit PoE Managed Switch"\nPID: SG350-28P-K9   VID: V01   SN: DNI2233AB12\n',
    })).toMatchObject({ operatingSystem: "Cisco SB", model: "SG350-28P-K9", serialNumber: "DNI2233AB12", version: "3.0.0.69" });

    const procurve = "  System Name        : HRH-STORE-SW01\n  Software revision  : YB.16.10.0012\n  Serial Number      : CN12ABC345\n";
    expect(detectFamily(procurve)).toBe("procurve");
    expect(parseIdentity("procurve", { "show system": procurve })).toMatchObject({ model: "Aruba 2530", serialNumber: "CN12ABC345", version: "YB.16.10.0012" });

    const cx = "Hostname           : SAII-CORE\nProduct Name       : JL658A 6300M 24SFP+ 4SFP56 Swch\nChassis Serial Nbr : SG1ZKN1234\nVersion            : FL.10.10.1030\n";
    expect(detectFamily(`ArubaOS-CX\n${cx}`)).toBe("aoscx");
    expect(parseIdentity("aoscx", { "show system": cx, "show version": "" })).toMatchObject({
      model: "JL658A 6300M 24SFP+ 4SFP56 Swch", serialNumber: "SG1ZKN1234", version: "FL.10.10.1030",
    });
  });

  it("returns nothing rather than a guess when the output says nothing", () => {
    expect(parseIdentity("ios", { "show version": "% Invalid input" })).toMatchObject({ model: null, serialNumber: null, version: null });
  });
});

describe("config backup: the configuration text", () => {
  it("strips the echo, the preamble, the prompt and pager leftovers", () => {
    const raw =
      "show running-config\r\nBuilding configuration...\r\n\r\nCurrent configuration : 1234 bytes\r\n!\r\nversion 16.12\r\n" +
      " --More-- \x08\x08\x08\x08\x08\x08\x08\x08\x08\x08          \x08\x08\x08\x08\x08\x08\x08\x08\x08\x08hostname SW1\r\n!\r\nend\r\n\r\nSW1#";
    expect(cleanConfig(raw, "show running-config", "SW1#")).toBe("!\nversion 16.12\nhostname SW1\n!\nend");
    expect(plain("\x1b[0mabc\x1b[K")).toBe("abc");
  });

  it("ignores clocks when deciding whether anything changed", () => {
    const a = "!\n! Last configuration change at 02:00:01 MVT Mon Nov 17 2026 by admin\nhostname SW1\nntp clock-period 36028797\nend";
    const b = "!\n! Last configuration change at 09:15:44 MVT Tue Nov 18 2026 by admin\nhostname SW1\nntp clock-period 36028811\nend";
    expect(comparable(a)).toBe(comparable(b));
    expect(comparable(a)).not.toBe(comparable(b.replace("SW1", "SW2")));
  });

  it("tells a configuration from an error", () => {
    expect(looksLikeConfig("% Invalid input detected at '^' marker.")).toBe(false);
    expect(looksLikeConfig("!\nversion 16.12\nhostname SW1\n!\ninterface Vlan1\n no ip address\nend")).toBe(true);
  });
});

describe("config backup: line diff", () => {
  it("finds added, removed and kept lines with their numbers", () => {
    const before = "hostname SW1\ninterface Gi1/0/1\n description PC\n switchport access vlan 10\nend";
    const after = "hostname SW1\ninterface Gi1/0/1\n description Printer\n switchport access vlan 10\n spanning-tree portfast\nend";
    const diff = diffLines(before, after);
    expect(diff.filter((l) => l.kind === "removed").map((l) => l.text)).toEqual([" description PC"]);
    expect(diff.filter((l) => l.kind === "added").map((l) => l.text)).toEqual([" description Printer", " spanning-tree portfast"]);
    expect(diff.at(-1)).toEqual({ kind: "same", text: "end", oldNo: 5, newNo: 6 });
    expect(diffCounts(before, after)).toEqual({ added: 2, removed: 1 });
    expect(diffCounts(before, before)).toEqual({ added: 0, removed: 0 });
  });

  it("copes with a long configuration with one change in the middle", () => {
    const lines = Array.from({ length: 4000 }, (_, i) => `interface Gi1/0/${i}`);
    const changed = [...lines];
    changed[2000] = "interface Gi9/9/9";
    expect(diffCounts(lines.join("\n"), changed.join("\n"))).toEqual({ added: 1, removed: 1 });
  });
});

describe("config backup: schedule and logins", () => {
  it("runs once a local day, after the chosen hour", () => {
    const tz = "Indian/Maldives"; // UTC+5
    const at = (iso: string) => new Date(iso);
    // 01:30 local: too early for a 02:00 run.
    expect(scheduledRunDue(at("2026-11-17T20:30:00Z"), tz, 2, null)).toBe(false);
    // 02:10 local, nothing run yet today.
    expect(scheduledRunDue(at("2026-11-17T21:10:00Z"), tz, 2, at("2026-11-16T21:00:00Z"))).toBe(true);
    // Already ran at 02:00 local today.
    expect(scheduledRunDue(at("2026-11-17T23:00:00Z"), tz, 2, at("2026-11-17T21:00:00Z"))).toBe(false);
    // Missed while the worker was down: caught up later that day.
    expect(scheduledRunDue(at("2026-11-18T05:00:00Z"), tz, 2, at("2026-11-16T21:00:00Z"))).toBe(true);
    // Never run before: switched on at 10:00 local waits for 02:00, not now.
    expect(scheduledRunDue(at("2026-11-18T05:00:00Z"), tz, 2, null)).toBe(false);
    expect(scheduledRunDue(at("2026-11-17T21:05:00Z"), tz, 2, null)).toBe(true);
  });

  it("picks the SSH login and the enable password", () => {
    const set = (username: string | null) => ({ username, secretCiphertext: "x", deletedAt: null });
    const picked = pickLogins([
      { purpose: "Web UI", credentialSet: set("web") },
      { purpose: "Enable", credentialSet: set(null) },
      { purpose: "SSH", credentialSet: set("netadmin") },
    ]);
    expect(picked.login?.credentialSet.username).toBe("netadmin");
    expect(picked.enable?.purpose).toBe("Enable");
    expect(pickLogins([{ purpose: null, credentialSet: set("admin") }]).login?.credentialSet.username).toBe("admin");
    expect(pickLogins([{ purpose: "Web UI", credentialSet: set("web") }]).login).toBeUndefined();
  });
});
