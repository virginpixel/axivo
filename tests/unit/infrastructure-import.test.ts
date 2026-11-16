import { describe, expect, it } from "vitest";
import {
  mapColumns, pickSheet, parseCsv, companyKey, typeKey, suggestCompany, suggestType, parseStatus,
} from "@/modules/infrastructure/import-parse";
import { isIpAddress } from "@/modules/infrastructure/validators";

const COMPANIES = [
  { id: "cxr", name: "Crossroads" },
  { id: "slm", name: "SAii Lagoon Maldives" },
  { id: "hrh", name: "Hard Rock Hotel" },
];
const TYPES = [
  { id: "sw", name: "Switch", kind: "NETWORK" },
  { id: "fw", name: "Firewall", kind: "NETWORK" },
  { id: "vm", name: "Virtual Machine", kind: "SERVER" },
  { id: "nas", name: "NAS / Storage", kind: "SERVER" },
  { id: "hv", name: "Hypervisor", kind: "SERVER" },
];

describe("infrastructure import: columns", () => {
  it("reads the server list's headings, ignoring the VAPT columns", () => {
    const map = mapColumns(["No", "Description", "IP Address", "OS", "Authentication", "Compliance", "Username", "Password", "Domain Name ", "Remark"]);
    expect(map.fields).toMatchObject({ name: 1, ipAddress: 2, operatingSystem: 3, username: 6, password: 7, domain: 8, notes: 9 });
    expect(map.ignored).toEqual(["No", "Authentication", "Compliance"]);
    expect(map.headers.name).toBe("Description");
  });

  it("uses Hostname as the name when there is no name column", () => {
    const map = mapColumns(["Company", "Hostname", "Mgmt IP", "Vendor", "Model", "Serial", "OS", "Firmware"]);
    expect(map.fields.name).toBe(1);
    expect(map.fields.hostname).toBe(1);
    expect(map.fields).toMatchObject({ company: 0, ipAddress: 2, manufacturer: 3, model: 4, serialNumber: 5, operatingSystem: 6, version: 7 });
  });

  it("keeps Name and Hostname apart when both exist", () => {
    const map = mapColumns(["Name", "Hostname", "IP"]);
    expect(map.fields.name).toBe(0);
    expect(map.fields.hostname).toBe(1);
  });

  it("skips a summary sheet and a title row to find the device table", () => {
    const sheet = pickSheet([
      { name: "Summary", rows: [["Network switches - discovery"], ["Switches collected", "156"]] },
      {
        name: "Switches",
        rows: [
          ["Discovery output"],
          ["Company", "Hostname", "Mgmt IP"],
          ["Crossroads", "BOH_DC_Core_SW1", "10.100.200.254"],
          [],
          ["Hard Rock Hotel", "HRH-CORE-SW01", "10.197.200.1"],
        ],
      },
    ]);
    expect(sheet?.sheetName).toBe("Switches");
    expect(sheet?.headerRow).toBe(2);
    expect(sheet?.rows.map((r) => [r.row, r.values.name])).toEqual([
      [3, "BOH_DC_Core_SW1"],
      [5, "HRH-CORE-SW01"],
    ]);
  });

  it("returns nothing when no sheet has a name column", () => {
    expect(pickSheet([{ name: "x", rows: [["IP", "Model"], ["1.2.3.4", "a"]] }])).toBeNull();
  });
});

describe("infrastructure import: CSV", () => {
  it("handles quotes, embedded commas, doubled quotes and CRLF", () => {
    expect(parseCsv('﻿Name,Notes\r\n"SW1","rack 3, top"\r\nSW2,"say ""hi"""\n')).toEqual([
      ["Name", "Notes"],
      ["SW1", "rack 3, top"],
      ["SW2", 'say "hi"'],
    ]);
  });
});

describe("infrastructure import: grouping and suggestions", () => {
  it("groups by the company column, or by the name's leading letters", () => {
    expect(companyKey({ row: 2, values: { name: "x", company: "Crossroads" } }, true)).toBe("Crossroads");
    expect(companyKey({ row: 2, values: { name: "CXR-FS" } }, false)).toBe("CXR");
    expect(companyKey({ row: 2, values: { name: "SHRMV0639" } }, false)).toBe("SHRMV");
    expect(companyKey({ row: 2, values: { name: "10.1.1.1" } }, false)).toBe("(blank)");
  });

  it("suggests companies by exact name, prefix or initials, and leaves CXR to the user", () => {
    expect(suggestCompany("Crossroads", COMPANIES)).toBe("cxr");
    expect(suggestCompany("SAii Lagoon", COMPANIES)).toBe("slm");
    expect(suggestCompany("HRH", COMPANIES)).toBe("hrh");
    expect(suggestCompany("SLM", COMPANIES)).toBe("slm");
    expect(suggestCompany("CXR", COMPANIES)).toBeNull();
  });

  it("groups types by OS when there is no type column, and suggests from it", () => {
    expect(typeKey({ row: 2, values: { operatingSystem: "Synology DSM 7.2" } }, false, true)).toBe("Synology DSM 7.2");
    expect(typeKey({ row: 2, values: {} }, false, false)).toBe("(all rows)");
    expect(suggestType("Synology DSM 7.2", "SERVER", TYPES)).toBe("nas");
    expect(suggestType("VMware ESXi 7", "SERVER", TYPES)).toBe("hv");
    expect(suggestType("Windows Server 2019", "SERVER", TYPES)).toBe("vm");
    expect(suggestType("(all rows)", "NETWORK", TYPES)).toBe("sw");
    expect(suggestType("Cisco Firepower", "NETWORK", TYPES)).toBe("fw");
  });

  it("reads statuses it recognises and ignores the rest", () => {
    expect(parseStatus("VM Removed")).toBe("DECOMMISSIONED");
    expect(parseStatus("Standby")).toBe("STANDBY");
    expect(parseStatus("Active")).toBe("ACTIVE");
    expect(parseStatus("Collected - matches your list")).toBeNull();
    expect(parseStatus(undefined)).toBeNull();
  });
});

describe("IP address check", () => {
  it("accepts IPv4 and IPv6, rejects the rest", () => {
    for (const ok of ["10.100.200.254", "192.168.0.1", "0.0.0.0", "fe80::5e71:dff:fe6a:ef85", "::1", "2001:db8::1"]) {
      expect(isIpAddress(ok), ok).toBe(true);
    }
    for (const bad of ["10.100.200.256", "10.100.200", "-", "server01", "1.2.3.4.5", "1:2", "fe80:::1"]) {
      expect(isIpAddress(bad), bad).toBe(false);
    }
  });
});
