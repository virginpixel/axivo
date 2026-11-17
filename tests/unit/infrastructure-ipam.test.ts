import { describe, it, expect } from "vitest";
import {
  ipToNumber, numberToIp, parseCidr, subnetFacts, maskToPrefix, nextFree, overlaps, normalizeMac,
} from "@/modules/infrastructure/ip-math";
import { pickPlanSheet, pickAddressSheet, parsePlanRow, parseAddressRow, firstIp } from "@/modules/infrastructure/ipam-parse";

describe("ip math", () => {
  it("turns addresses into numbers and back", () => {
    expect(ipToNumber("10.100.200.254")).toBe(10 * 2 ** 24 + 100 * 2 ** 16 + 200 * 256 + 254);
    expect(numberToIp(ipToNumber("255.255.255.255")!)).toBe("255.255.255.255");
    expect(ipToNumber("10.0.0.256")).toBeNull();
    expect(ipToNumber("10.0.0")).toBeNull();
  });

  it("reads subnets written three ways and refuses an address that is not a network", () => {
    const a = parseCidr("10.4.44.0/22");
    const b = parseCidr("10.4.44.0 255.255.252.0");
    const c = parseCidr("10.4.44.0/255.255.252.0");
    for (const r of [a, b, c]) expect(r).toMatchObject({ ok: true, cidr: { network: "10.4.44.0", prefix: 22 } });
    const wrong = parseCidr("10.4.45.0/22");
    expect(wrong.ok).toBe(false);
    if (!wrong.ok) expect(wrong.error).toMatch(/Did you mean 10\.4\.44\.0\/22/);
    expect(maskToPrefix("255.255.0.255")).toBeNull();
  });

  it("works out size and usable range rather than trusting what was typed", () => {
    expect(subnetFacts("10.4.44.0", 22)).toEqual({
      cidr: "10.4.44.0/22", mask: "255.255.252.0", size: 1024, usable: 1022,
      firstUsable: "10.4.44.1", lastUsable: "10.4.47.254", broadcast: "10.4.47.255",
    });
    expect(subnetFacts("10.9.9.0", 31)).toMatchObject({ usable: 2, broadcast: null });
  });

  it("finds the next free address and overlaps", () => {
    const taken = ["192.168.1.1", "192.168.1.2", "192.168.1.4"].map((ip) => ipToNumber(ip)!);
    expect(nextFree("192.168.1.0", 24, taken)).toBe("192.168.1.3");
    const full = Array.from({ length: 254 }, (_, i) => ipToNumber("192.168.2.0")! + i + 1);
    expect(nextFree("192.168.2.0", 24, full)).toBeNull();
    const big = parseCidr("192.168.0.0/16");
    const small = parseCidr("192.168.5.0/24");
    if (big.ok && small.ok) expect(overlaps(big.cidr, small.cidr)).toBe(true);
    expect(normalizeMac("70-18-A7-AF-5E-E4")).toBe("70:18:a7:af:5e:e4");
    expect(normalizeMac("7018.a7af.5ee4")).toBe("70:18:a7:af:5e:e4");
  });
});

describe("VLAN plan and address sheets", () => {
  const workbook2 = [
    { name: "Summary", rows: [["VLANs and IP ranges - discovery"]] },
    {
      name: "VLAN plan",
      rows: [
        ["Site", "VLAN", "Name", "Subnet", "Gateway (switch)", "DHCP relay", "Switches carrying it", "Live devices", "Suggested", "Please check"],
        ["Crossroads", "3", "Corosync", "172.20.20.0/27", "172.20.20.30 (BOH_DC_Core_SW1)", "", "23", "17", "Keep", ""],
        ["Crossroads", "6", "Crossroads", "", "", "", "0", "0", "Not in use", ""],
        ["SAii Lagoon", "40", "Saii-Staff", "192.168.40.0/24", "192.168.40.1 (SAII-CORE)", "10.100.100.10, 10.100.100.11", "4", "9", "Keep", ""],
        ["Crossroads", "x", "Bad", "", "", "", "", "", "", ""],
      ],
    },
    { name: "Subnets", rows: [["Site", "VLAN", "VLAN name", "Network", "Mask"]] },
  ];

  it("picks the VLAN plan sheet and reads its rows", () => {
    const sheet = pickPlanSheet(workbook2)!;
    expect(sheet.name).toBe("VLAN plan");
    const rows = sheet.rows.map((entry) => parsePlanRow(sheet, entry));
    expect(rows[0]).toMatchObject({ ok: true, row: { companyText: "Crossroads", number: 3, name: "Corosync", gateway: "172.20.20.30", status: "ACTIVE", cidr: { prefix: 27 } } });
    expect(rows[1]).toMatchObject({ ok: true, row: { number: 6, cidr: null, status: "UNUSED" } });
    expect(rows[2]).toMatchObject({ ok: true, row: { dhcpRelay: "10.100.100.10, 10.100.100.11" } });
    expect(rows[3]).toMatchObject({ ok: false });
  });

  it("reads a plain sheet with subnet and mask in two columns", () => {
    const sheet = pickPlanSheet([{ name: "Sheet1", rows: [["VLAN ID", "VLAN Name", "Network", "Subnet Mask"], ["10", "Admin", "10.100.8.0", "255.255.252.0"]] }])!;
    expect(parsePlanRow(sheet, sheet.rows[0]!)).toMatchObject({ ok: true, row: { number: 10, cidr: { network: "10.100.8.0", prefix: 22 } } });
  });

  it("never reads an address list as a VLAN plan", () => {
    expect(pickPlanSheet([{ name: "Live devices", rows: [["Site", "IP", "DNS name", "VLAN", "VLAN name", "Subnet"]] }])).toBeNull();
  });

  it("picks the live devices sheet and reads its addresses", () => {
    const sheet = pickAddressSheet([
      { name: "Server list check", rows: [["No", "Name (your list)", "IP"]] },
      {
        name: "Live devices",
        rows: [
          ["Site", "IP", "DNS name", "MAC", "MAC vendor", "VLAN", "VLAN name", "Subnet", "Seen by", "Switch", "Port", "Known as"],
          ["Crossroads", "10.1.110.73", "", "a8:b4:56:f3:32:a8", "Cisco Systems", "90", "AP_BOH", "10.1.110.0/24", "ping + ARP", "MARI-DR12-SW01", "Gi1/0/21", ""],
          ["", "not an ip", "", "", "", "", "", "", "", "", "", ""],
        ],
      },
    ])!;
    expect(sheet.name).toBe("Live devices");
    expect(parseAddressRow(sheet, sheet.rows[0]!)).toMatchObject({ address: "10.1.110.73", mac: "a8:b4:56:f3:32:a8", vendor: "Cisco Systems", switchName: "MARI-DR12-SW01", switchPort: "Gi1/0/21" });
    expect(parseAddressRow(sheet, sheet.rows[1]!)).toBeNull();
    expect(firstIp("10.70.99.15 (HRH-FO-SW01)")).toBe("10.70.99.15");
  });
});
