import { describe, it, expect } from "vitest";
import { parseArp, routedNetworks } from "@/modules/infrastructure/arp-parse";

describe("ARP and routed interfaces", () => {
  it("reads the addresses a switch routes from its configuration", () => {
    const ios = [
      "interface Vlan10",
      " description BOH_ADMIN",
      " ip address 10.100.10.254 255.255.252.0",
      " ip address 10.100.20.1 255.255.255.0 secondary",
      " ip helper-address 10.100.100.10",
      "!",
      "interface Vlan42",
      " no ip address",
      " shutdown",
      "!",
      "interface GigabitEthernet1/0/1",
      " switchport access vlan 10",
      "router ospf 1",
      " network 10.0.0.0 0.255.255.255 area 0",
    ].join("\n");
    expect(routedNetworks(ios)).toEqual([
      { interface: "Vlan10", address: "10.100.10.254", prefix: 22 },
      { interface: "Vlan10", address: "10.100.20.1", prefix: 24 },
    ]);
    expect(routedNetworks("interface vlan 50\n    ip address 192.168.63.253/22\n")).toEqual([{ interface: "vlan 50", address: "192.168.63.253", prefix: 22 }]);
    expect(routedNetworks('vlan 7\n   name "Servers"\n   ip address 192.168.100.254 255.255.255.0\n   exit')).toEqual([
      { interface: "vlan 7", address: "192.168.100.254", prefix: 24 },
    ]);
  });

  it("reads ARP tables from each family and leaves out the switch's own and incomplete entries", () => {
    const ios = "Internet  10.100.35.254   -   0011.2233.4455  ARPA   Vlan50\nInternet  10.100.32.10   3   aabb.cc00.0010  ARPA   Vlan50\nInternet  10.100.34.9   0   Incomplete  ARPA";
    expect(parseArp(ios)).toEqual([{ address: "10.100.32.10", mac: "aa:bb:cc:00:00:10" }]);
    expect(parseArp("  10.1.1.5      00:11:22:33:44:55  vlan50   1/1/1   reachable")).toEqual([{ address: "10.1.1.5", mac: "00:11:22:33:44:55" }]);
    expect(parseArp("  10.1.1.6        001122-334466    dynamic  A1")).toEqual([{ address: "10.1.1.6", mac: "00:11:22:33:44:66" }]);
    expect(parseArp("vlan 10   gi1/0/1   10.1.1.7   00:11:22:33:44:77   dynamic")).toEqual([{ address: "10.1.1.7", mac: "00:11:22:33:44:77" }]);
  });
});
