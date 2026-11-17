/**
 * Lays the switch map out as a tree grown from the best-connected switch of
 * each island (the core). Every switch's branches are packed into a few
 * columns rather than one long line, so a core with dozens of access switches
 * still gives a map wider than it is tall. Cables that are not part of the
 * tree (a second uplink, a ring) are drawn too; they just do not shape it.
 */

export type Direction = "LR" | "TB";

export const NODE_WIDTH = 224;
export const NODE_HEIGHT = 64;

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
  place: (main: number, cross: number) => void;
}

export function layoutTopology(nodes: { id: string; name: string }[], links: LayoutLink[], direction: Direction): LayoutResult {
  const names = new Map(nodes.map((n) => [n.id, n.name]));
  const byName = (p: string, q: string) => (names.get(p) ?? "").localeCompare(names.get(q) ?? "");
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
  const roots: string[] = [];
  const byConnections = [...nodes].sort(
    (x, y) => (neighbours.get(y.id)?.size ?? 0) - (neighbours.get(x.id)?.size ?? 0) || x.name.localeCompare(y.name),
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
        queue.push(next);
      }
    }
  }

  const edges: LaidOutEdge[] = [];
  for (const [key, group] of pairs) {
    const [x, y] = key.split("~") as [string, string];
    const dx = depth.get(x) ?? 0;
    const dy = depth.get(y) ?? 0;
    const xFirst = dx < dy || (dx === dy && byName(x, y) <= 0);
    const source = xFirst ? x : y;
    const target = xFirst ? y : x;
    edges.push({
      id: key,
      source,
      target,
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

  // Sizes along / across the direction of growth.
  const horizontal = direction === "LR";
  const nodeMain = horizontal ? NODE_WIDTH : NODE_HEIGHT;
  const nodeCross = horizontal ? NODE_HEIGHT : NODE_WIDTH;
  const linkGap = horizontal ? 150 : 96; // parent to its first column: room for the port labels
  const columnGap = horizontal ? 56 : 48; // between packed columns of branches
  const crossGap = horizontal ? 16 : 24; // between neighbouring branches
  // The whole map aims for a landscape shape; each branch for a square one.
  const mapRatio = horizontal ? 1.2 : 0.3;

  /** Pack boxes into columns no taller than needed for the wanted shape. */
  function pack(boxes: Box[], ratio: number) {
    const area = boxes.reduce((sum, b) => sum + (b.main + columnGap) * (b.cross + crossGap), 0);
    const limit = Math.max(...boxes.map((b) => b.cross), Math.sqrt(area / ratio));
    const columns: { boxes: Box[]; main: number; cross: number }[] = [];
    for (const box of boxes) {
      const column = columns[columns.length - 1];
      if (column && column.cross + crossGap + box.cross <= limit) {
        column.boxes.push(box);
        column.cross += crossGap + box.cross;
        column.main = Math.max(column.main, box.main);
      } else {
        columns.push({ boxes: [box], main: box.main, cross: box.cross });
      }
    }
    const main = columns.reduce((sum, c) => sum + c.main, 0) + columnGap * (columns.length - 1);
    const cross = Math.max(...columns.map((c) => c.cross));
    const place = (m: number, c: number) => {
      let cursor = m;
      for (const column of columns) {
        let offset = c;
        for (const box of column.boxes) {
          box.place(cursor, offset);
          offset += box.cross + crossGap;
        }
        cursor += column.main + columnGap;
      }
    };
    return { main, cross, firstCross: columns[0]?.cross ?? 0, place };
  }

  const placed = new Map<string, { main: number; cross: number }>();
  function build(id: string, ratio = 1): Box {
    const kids = (treeChildren.get(id) ?? []).map((kid) => build(kid));
    if (kids.length === 0) {
      return { main: nodeMain, cross: nodeCross, place: (m, c) => placed.set(id, { main: m, cross: c }) };
    }
    // Bigger branches first, so the small ones fill the gaps after them.
    kids.sort((p, q) => q.main * q.cross - p.main * p.cross);
    const packed = pack(kids, ratio);
    return {
      main: nodeMain + linkGap + packed.main,
      cross: Math.max(nodeCross, packed.cross),
      place: (m, c) => {
        // Level with the middle of its first column of branches.
        placed.set(id, { main: m, cross: c + Math.max(0, (Math.min(packed.firstCross, packed.cross) - nodeCross) / 2) });
        packed.place(m + nodeMain + linkGap, c);
      },
    };
  }

  // The core's own branches take the map's shape; deeper ones stay compact.
  const islands = roots.map((root) => build(root, mapRatio)).sort((p, q) => q.main * q.cross - p.main * p.cross);
  if (islands.length > 0) pack(islands, mapRatio).place(0, 0);

  const positions = new Map<string, { x: number; y: number }>();
  for (const node of nodes) {
    const spot = placed.get(node.id) ?? { main: 0, cross: 0 };
    positions.set(node.id, horizontal ? { x: spot.main, y: spot.cross } : { x: spot.cross, y: spot.main });
  }
  return { positions, edges, loops, depth };
}
