import { describe, expect, it } from "vitest";
import { normalizePort, portKey, deviceKey, linkKey, pickLinkSheet, mapLinkColumns } from "@/modules/infrastructure/topology-parse";
import { layoutTopology } from "@/app/(portal)/infrastructure/topology/topology-layout";

describe("topology: ports and names", () => {
  it("spells every port one way", () => {
    expect(normalizePort("GigabitEthernet1/0/25")).toBe("Gi1/0/25");
    expect(normalizePort("gi 1/0/25")).toBe("Gi1/0/25");
    expect(normalizePort("TenGigabitEthernet1/1/4")).toBe("Te1/1/4");
    expect(normalizePort("TwentyFiveGigE1/0/1")).toBe("Twe1/0/1");
    expect(normalizePort("Port-channel10")).toBe("Po10");
    expect(normalizePort("Ethernet1/49")).toBe("Eth1/49");
    expect(normalizePort("24")).toBe("24");
    expect(normalizePort("  ")).toBeNull();
    expect(portKey("Gi1/0/1")).toBe(portKey("GIGABITETHERNET1/0/1"));
  });

  it("matches a neighbour name without its domain or serial", () => {
    expect(deviceKey("BOH-RES-SW03.crossroadsmv.local")).toBe("boh-res-sw03");
    expect(deviceKey("CORE-SW(FDO2247F12Q)")).toBe("core-sw");
    expect(deviceKey("10.100.200.12")).toBe("10.100.200.12");
  });

  it("gives a cable the same key from either end", () => {
    expect(linkKey("a", "Gi1/0/1", "b", "Te1/1/1")).toBe(linkKey("b", "TenGigabitEthernet1/1/1", "a", "gi1/0/1"));
    expect(linkKey("a", "Gi1/0/1", "a", "Gi1/0/2")).toBe(linkKey("a", "Gi1/0/2", "a", "Gi1/0/1"));
  });
});

describe("topology: neighbour table columns", () => {
  it("reads the discovery workbook's Neighbours sheet and skips the others", () => {
    const sheet = pickLinkSheet([
      { name: "Switches", rows: [["Company", "Hostname", "Mgmt IP", "Model"], ["Crossroads", "SW1", "10.0.0.1", "C9300"]] },
      {
        name: "Neighbours",
        rows: [
          ["Company", "Switch", "Switch IP", "Local port", "Neighbour type", "Neighbour", "Neighbour IP", "Neighbour platform", "Neighbour port", "Seen via"],
          ["Crossroads", "SW1", "10.0.0.1", "Gi1/1/1", "Switch", "CORE.local", "10.0.0.254", "cisco", "Te1/0/1", "CDP"],
        ],
      },
    ]);
    expect(sheet?.name).toBe("Neighbours");
    expect(sheet?.columns.fields).toMatchObject({ device: 1, deviceIp: 2, port: 3, neighbourType: 4, neighbour: 5, neighbourIp: 6, neighbourPort: 8 });
    expect(sheet?.rows).toHaveLength(1);
  });

  it("accepts plain hand-made headings", () => {
    const { fields } = mapLinkColumns(["Device", "Port", "Connected to", "Its port"]);
    expect(fields).toEqual({ device: 0, port: 1, neighbour: 2, neighbourPort: 3 });
  });
});

describe("topology: layout", () => {
  const nodes = ["core", "dist", "acc1", "acc2", "lonely"].map((id) => ({ id, name: id.toUpperCase() }));
  const link = (id: string, a: string, b: string, portA = "p1", portB = "p2") => ({ id, a, portA, b, portB, source: "DISCOVERY" as const });

  it("tiers switches by hops from the best-connected one and groups parallel cables", () => {
    const result = layoutTopology(nodes, [
      link("1", "dist", "core", "Gi1/1/1", "Te1/0/1"),
      link("2", "dist", "core", "Gi1/1/2", "Te1/0/2"),
      link("3", "acc1", "dist"),
      link("4", "acc2", "dist"),
      link("5", "core", "acc1"),
      link("6", "lonely", "lonely", "Gi1/0/1", "Gi1/0/2"),
    ], "TB");
    expect(result.depth.get("dist")).toBe(0);
    const coreEdge = result.edges.find((e) => e.cables.length === 2)!;
    // Ports are given from the end nearer the core.
    expect(coreEdge.source).toBe("dist");
    expect(coreEdge.cables.map((c) => c.sourcePort)).toEqual(["Gi1/1/1", "Gi1/1/2"]);
    expect(coreEdge.cables.map((c) => c.targetPort)).toEqual(["Te1/0/1", "Te1/0/2"]);
    expect(result.loops.get("lonely")).toHaveLength(1);
    expect(result.positions.size).toBe(5);
    // Three branches: the core grows both ways, every branch one step from it.
    const dist = result.positions.get("dist")!;
    const steps = ["core", "acc1", "acc2"].map((id) => result.positions.get(id)!.y - dist.y);
    expect(new Set(steps.map(Math.abs)).size).toBe(1);
    expect(steps.some((step) => step > 0) && steps.some((step) => step < 0)).toBe(true);
    for (const edge of result.edges) {
      expect(edge.reversed).toBe(result.positions.get(edge.target)!.y < result.positions.get(edge.source)!.y);
    }
  });

  it("keeps every switch's branches in the column next to it", () => {
    // A core with one deep branch and several short ones: the short ones must
    // not be pushed out past the deep one's switches.
    const ids = ["core", "big", "b1", "b2", "b3", "b1a", "b1b", "b1c", "small1", "small2", "small3", "leafy"];
    const all = ids.map((id) => ({ id, name: id }));
    const cables = [
      link("1", "core", "big"), link("2", "core", "small1"), link("3", "core", "small2"), link("4", "core", "small3"),
      link("5", "big", "b1"), link("6", "big", "b2"), link("7", "big", "b3"),
      link("8", "b1", "b1a"), link("9", "b1", "b1b"), link("10", "b1", "b1c"),
      link("11", "small1", "leafy"),
    ];
    const result = layoutTopology(all, cables, "LR");
    for (const edge of result.edges) {
      const from = result.positions.get(edge.source)!;
      const to = result.positions.get(edge.target)!;
      expect(Math.abs(to.x - from.x)).toBe(224 + 150);
    }
    // No two switches overlap.
    const spots = [...result.positions.values()];
    for (let i = 0; i < spots.length; i += 1) {
      for (let j = i + 1; j < spots.length; j += 1) {
        const apart = Math.abs(spots[i]!.x - spots[j]!.x) >= 224 || Math.abs(spots[i]!.y - spots[j]!.y) >= 64;
        expect(apart).toBe(true);
      }
    }
  });
});
