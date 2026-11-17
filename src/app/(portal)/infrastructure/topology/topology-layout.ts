/**
 * Lays the switch map out as a tree grown from the best-connected switch of
 * each island (the core).
 *
 * The rule that keeps it readable: a switch's own branches always sit in the
 * column right next to it, so a line never has to cross somebody else's
 * branch to reach its switch. Branches that feed further switches are stacked
 * one under another; switches at the end of the line are packed into a small
 * grid beneath them. The core grows both ways (left and right, or up and
 * down) so the map stays roughly as wide as it is tall. Cables that are not
 * part of the tree (a second uplink, a ring) are drawn too; they just do not
 * shape it.
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
  /** The target lies left of (or above) the source: the core's second side. */
  reversed: boolean;
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
        queue.push(next);
      }
    }
  }

  // Sizes along / across the direction of growth.
  const horizontal = direction === "LR";
  const nodeMain = horizontal ? NODE_WIDTH : NODE_HEIGHT;
  const nodeCross = horizontal ? NODE_HEIGHT : NODE_WIDTH;
  const linkGap = horizontal ? 150 : 96; // parent to its branches: room for the port labels
  const columnGap = horizontal ? 40 : 40; // between columns of a grid of end switches
  const crossGap = horizontal ? 16 : 24; // between neighbouring switches
  const groupGap = horizontal ? 40 : 56; // between one switch's branches and the next's

  /** Positions along the main axis, before the core's second side is flipped. */
  const placed = new Map<string, { main: number; cross: number }>();

  /** A switch with no further branches. */
  function leaf(id: string): Box {
    return { main: nodeMain, cross: nodeCross, place: (m, c) => placed.set(id, { main: m, cross: c }) };
  }

  /**
   * One switch's children as a block: branches stacked, end switches in a
   * grid below them. Every child starts at the block's near edge.
   */
  function block(kids: string[]): Box {
    const branches = kids.filter((kid) => (treeChildren.get(kid)?.length ?? 0) > 0).map(build);
    const ends = kids.filter((kid) => (treeChildren.get(kid)?.length ?? 0) === 0);
    // Short lists stay one column; longer ones wrap into a roughly square grid.
    const columns =
      ends.length <= 6
        ? 1
        : Math.max(1, Math.round(Math.sqrt((ends.length * (nodeCross + crossGap)) / (nodeMain + columnGap))));
    const rows = Math.ceil(ends.length / Math.max(columns, 1));
    const gridMain = ends.length === 0 ? 0 : columns * nodeMain + (columns - 1) * columnGap;
    const gridCross = ends.length === 0 ? 0 : rows * nodeCross + (rows - 1) * crossGap;

    const branchCross =
      branches.reduce((sum, b) => sum + b.cross, 0) + Math.max(0, branches.length - 1) * groupGap;
    const between = branches.length > 0 && ends.length > 0 ? groupGap : 0;
    return {
      main: Math.max(gridMain, ...branches.map((b) => b.main)),
      cross: branchCross + between + gridCross,
      place: (m, c) => {
        let offset = c;
        for (const branch of branches) {
          branch.place(m, offset);
          offset += branch.cross + groupGap;
        }
        if (branches.length > 0) offset += between - groupGap;
        ends.forEach((id, index) => {
          const column = Math.floor(index / rows);
          const row = index % rows;
          placed.set(id, { main: m + column * (nodeMain + columnGap), cross: offset + row * (nodeCross + crossGap) });
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

  /**
   * An island: the core with its branches split over both sides, the bigger
   * ones first so the two sides come out about the same size.
   */
  function island(root: string): Box {
    const kids = treeChildren.get(root) ?? [];
    if (kids.length < 3) return build(root);
    const sizes = new Map(kids.map((kid) => [kid, build(kid).cross]));
    const sides: [string[], string[]] = [[], []];
    const totals: [number, number] = [0, 0];
    for (const kid of [...kids].sort((p, q) => sizes.get(q)! - sizes.get(p)! || byName(p, q))) {
      const side = totals[0] <= totals[1] ? 0 : 1;
      sides[side].push(kid);
      totals[side] += sizes.get(kid)! + crossGap;
    }
    const near = block(sides[0].sort(byName));
    const far = block(sides[1].sort(byName));
    const flipped = sides[1].flatMap((kid) => subtree(kid));
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
