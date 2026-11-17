/**
 * Lays the switch map out as a tree grown from the best-connected switch of
 * each island (the core).
 *
 * The rules that keep it readable:
 *  - a switch's children sit in the column right next to it, in name order
 *    (SW01, SW02, SW03 top to bottom), each with its own branches beside it,
 *    so a line never crosses somebody else's branch;
 *  - the core grows both ways (left and right, or up and down), each side
 *    taking a run of names, so the map stays about as wide as it is tall;
 *  - each switch's cables share one trunk and turn into each child at a
 *    right angle (drawn by the map; positions here leave room for it).
 * Cables that are not part of the tree (a second uplink, a ring) are drawn
 * too; they just do not shape it.
 */

export type Direction = "LR" | "TB";

export const NODE_WIDTH = 224;
export const NODE_HEIGHT = 64;
/** Space between a switch and its children's column, along the direction of growth. */
export const LINK_GAP_LR = 190;
export const LINK_GAP_TB = 110;
/** Where the shared trunk runs: this far out from the parent. */
export const TRUNK_OFFSET = 28;

export interface LayoutLink {
  id: string;
  a: string;
  portA: string | null;
  b: string;
  portB: string | null;
  source: "MANUAL" | "DISCOVERY";
}

export interface LaidOutEdge {
  id: string;
  /** The end nearer the core. */
  source: string;
  target: string;
  /** The target lies left of (or above) the source: the core's second side. */
  reversed: boolean;
  /** The cable that places the target in the tree: drawn along its parent's trunk. */
  tree: boolean;
  /** Every cable between the pair, ports given from source to target. */
  cables: { id: string; sourcePort: string | null; targetPort: string | null; manual: boolean }[];
}

export interface LayoutResult {
  positions: Map<string, { x: number; y: number }>;
  edges: LaidOutEdge[];
  /** Cables from a device back to itself. */
  loops: Map<string, { id: string; portA: string | null; portB: string | null }[]>;
  depth: Map<string, number>;
}

interface Box {
  /** Extent along the direction of growth (left→right or top→bottom). */
  main: number;
  /** Extent across it. */
  cross: number;
  /** Place the box with its near corner at (main, cross); flip grows it the other way. */
  place: (main: number, cross: number) => void;
}

export function layoutTopology(nodes: { id: string; name: string }[], links: LayoutLink[], direction: Direction): LayoutResult {
  const names = new Map(nodes.map((n) => [n.id, n.name]));
  const byName = (p: string, q: string) =>
    (names.get(p) ?? "").localeCompare(names.get(q) ?? "", undefined, { numeric: true });
  const loops = new Map<string, { id: string; portA: string | null; portB: string | null }[]>();
  const pairs = new Map<string, LayoutLink[]>();
  const neighbours = new Map<string, Set<string>>(nodes.map((n) => [n.id, new Set()]));

  for (const link of links) {
    if (link.a === link.b) {
      loops.set(link.a, [...(loops.get(link.a) ?? []), { id: link.id, portA: link.portA, portB: link.portB }]);
      continue;
    }
    const key = [link.a, link.b].sort().join("~");
    pairs.set(key, [...(pairs.get(key) ?? []), link]);
    neighbours.get(link.a)?.add(link.b);
    neighbours.get(link.b)?.add(link.a);
  }

  // Hops from the core of each island, and the tree that reaches every switch.
  const depth = new Map<string, number>();
  const treeChildren = new Map<string, string[]>();
  const treeParent = new Map<string, string>();
  const roots: string[] = [];
  const byConnections = [...nodes].sort(
    (x, y) => (neighbours.get(y.id)?.size ?? 0) - (neighbours.get(x.id)?.size ?? 0) || byName(x.id, y.id),
  );
  for (const root of byConnections) {
    if (depth.has(root.id)) continue;
    roots.push(root.id);
    depth.set(root.id, 0);
    const queue = [root.id];
    while (queue.length > 0) {
      const current = queue.shift()!;
      for (const next of [...(neighbours.get(current) ?? [])].sort(byName)) {
        if (depth.has(next)) continue;
        depth.set(next, depth.get(current)! + 1);
        treeChildren.set(current, [...(treeChildren.get(current) ?? []), next]);
        treeParent.set(next, current);
        queue.push(next);
      }
    }
  }

  // Sizes along / across the direction of growth.
  const horizontal = direction === "LR";
  const nodeMain = horizontal ? NODE_WIDTH : NODE_HEIGHT;
  const nodeCross = horizontal ? NODE_HEIGHT : NODE_WIDTH;
  // Parent to its column of children: the trunk, then a straight run into
  // each child long enough to carry its port label.
  const linkGap = horizontal ? LINK_GAP_LR : LINK_GAP_TB;
  const crossGap = horizontal ? 16 : 24; // between neighbouring end switches
  const groupGap = horizontal ? 36 : 56; // around a switch that feeds others

  /** Positions along the main axis, before the core's second side is flipped. */
  const placed = new Map<string, { main: number; cross: number }>();

  /** A switch with no further branches. */
  function leaf(id: string): Box {
    return { main: nodeMain, cross: nodeCross, place: (m, c) => placed.set(id, { main: m, cross: c }) };
  }

  const feeds = (id: string) => (treeChildren.get(id)?.length ?? 0) > 0;

  /**
   * One switch's children as a single column in name order, each with its
   * own branches beside it, so SW01, SW02, SW03 always read top to bottom.
   */
  function block(kids: string[]): Box {
    const ordered = [...kids].sort(byName);
    const boxes = ordered.map(build);
    const gapAfter = (index: number) =>
      index === boxes.length - 1 ? 0 : feeds(ordered[index]!) || feeds(ordered[index + 1]!) ? groupGap : crossGap;
    return {
      main: Math.max(0, ...boxes.map((b) => b.main)),
      cross: boxes.reduce((sum, b, index) => sum + b.cross + gapAfter(index), 0),
      place: (m, c) => {
        let offset = c;
        boxes.forEach((box, index) => {
          box.place(m, offset);
          offset += box.cross + gapAfter(index);
        });
      },
    };
  }

  /** A switch with its children beside it, the switch centred on them. */
  function build(id: string): Box {
    const kids = treeChildren.get(id) ?? [];
    if (kids.length === 0) return leaf(id);
    const children = block(kids);
    const cross = Math.max(nodeCross, children.cross);
    return {
      main: nodeMain + linkGap + children.main,
      cross,
      place: (m, c) => {
        placed.set(id, { main: m, cross: c + (cross - nodeCross) / 2 });
        children.place(m + nodeMain + linkGap, c + (cross - children.cross) / 2);
      },
    };
  }

  /** Every switch in a subtree. */
  function subtree(id: string, into: string[] = []): string[] {
    into.push(id);
    for (const kid of treeChildren.get(id) ?? []) subtree(kid, into);
    return into;
  }

  /** "BOH-BLK-C-SW03" → "BOH-BLK-C-SW": switches that belong together. */
  const family = (id: string) => (names.get(id) ?? "").toLowerCase().replace(/[\d\s]+$/, "");

  /**
   * An island: the core with its branches over both sides. Each side takes a
   * run of names, so the order still reads A to Z (first side, then the
   * second). The run is cut where the two sides come out about the same
   * size, but never inside a family such as BOH-BLK-C-SW01, 02, 03.
   */
  function island(root: string): Box {
    const kids = [...(treeChildren.get(root) ?? [])].sort(byName);
    if (kids.length < 3) return build(root);
    const sizes = kids.map((kid) => build(kid).cross + groupGap);
    const total = sizes.reduce((a, b) => a + b, 0);
    let best = { cut: 1, cost: Infinity };
    let running = 0;
    for (let cut = 1; cut < kids.length; cut += 1) {
      running += sizes[cut - 1]!;
      const splitsFamily = family(kids[cut - 1]!) === family(kids[cut]!);
      const cost = Math.abs(total - 2 * running) + (splitsFamily ? total : 0);
      if (cost < best.cost) best = { cut, cost };
    }
    const nearKids = kids.slice(0, best.cut);
    const farKids = kids.slice(best.cut);
    const near = block(nearKids);
    const far = block(farKids);
    const flipped = farKids.flatMap((kid) => subtree(kid));
    const farMain = far.main + linkGap;
    const cross = Math.max(nodeCross, near.cross, far.cross);
    return {
      main: farMain + nodeMain + linkGap + near.main,
      cross,
      place: (m, c) => {
        const core = m + farMain;
        placed.set(root, { main: core, cross: c + (cross - nodeCross) / 2 });
        near.place(core + nodeMain + linkGap, c + (cross - near.cross) / 2);
        // Laid out growing forwards from the core, then mirrored about it.
        far.place(core + nodeMain + linkGap, c + (cross - far.cross) / 2);
        for (const id of flipped) {
          const spot = placed.get(id)!;
          placed.set(id, { main: 2 * core - spot.main, cross: spot.cross });
        }
      },
    };
  }

  /** Islands side by side, wrapped so the whole map stays landscape. */
  function packIslands(boxes: Box[]) {
    const area = boxes.reduce((sum, b) => sum + (b.main + groupGap) * (b.cross + groupGap), 0);
    const ratio = horizontal ? 1.4 : 0.7;
    const limit = Math.max(...boxes.map((b) => b.cross), Math.sqrt(area / ratio));
    let main = 0;
    let cross = 0;
    let columnMain = 0;
    for (const box of boxes) {
      if (cross > 0 && cross + box.cross > limit) {
        main += columnMain + groupGap * 2;
        cross = 0;
        columnMain = 0;
      }
      box.place(main, cross);
      cross += box.cross + groupGap * 2;
      columnMain = Math.max(columnMain, box.main);
    }
  }

  const islands = roots.map(island).sort((p, q) => q.main * q.cross - p.main * p.cross);
  if (islands.length > 0) packIslands(islands);

  const edges: LaidOutEdge[] = [];
  for (const [key, group] of pairs) {
    const [x, y] = key.split("~") as [string, string];
    const dx = depth.get(x) ?? 0;
    const dy = depth.get(y) ?? 0;
    const xFirst = dx < dy || (dx === dy && byName(x, y) <= 0);
    const source = xFirst ? x : y;
    const target = xFirst ? y : x;
    const from = placed.get(source)?.main ?? 0;
    const to = placed.get(target)?.main ?? 0;
    edges.push({
      id: key,
      source,
      target,
      reversed: to < from,
      tree: treeParent.get(target) === source,
      cables: group
        .map((link) => ({
          id: link.id,
          sourcePort: link.a === source ? link.portA : link.portB,
          targetPort: link.a === source ? link.portB : link.portA,
          manual: link.source === "MANUAL",
        }))
        .sort((p, q) => (p.sourcePort ?? "").localeCompare(q.sourcePort ?? "", undefined, { numeric: true })),
    });
  }

  const positions = new Map<string, { x: number; y: number }>();
  for (const node of nodes) {
    const spot = placed.get(node.id) ?? { main: 0, cross: 0 };
    positions.set(node.id, horizontal ? { x: spot.main, y: spot.cross } : { x: spot.cross, y: spot.main });
  }
  return { positions, edges, loops, depth };
}
