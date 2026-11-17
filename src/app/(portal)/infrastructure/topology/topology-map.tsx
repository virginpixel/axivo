"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ReactFlow, ReactFlowProvider, Background, Controls, MiniMap, Handle, Position, BaseEdge, EdgeLabelRenderer,
  useReactFlow, useStore, type Node, type Edge, type NodeProps, type EdgeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  ArrowDownFromLine, ArrowRightFromLine, ExternalLink, List, Map as MapIcon, Network, Router, Search, Server,
  ShieldCheck, TriangleAlert, Wifi, X,
} from "lucide-react";
import type { TopologyNode, TopologyLink } from "@/modules/infrastructure/topology";
import { Combobox } from "@/shared/ui/combobox";
import { Input } from "@/shared/ui/input";
import { Table, THead, TBody, TR, TH, TD } from "@/shared/ui/table";
import { cn } from "@/shared/utils";
import { layoutTopology, NODE_HEIGHT, NODE_WIDTH, type Direction, type LaidOutEdge } from "./topology-layout";
import { LinkDialog, RemoveLinkButton, type DeviceOption } from "../link-dialogs";

export type MapLink = TopologyLink & { seenLabel: string | null };

interface Props {
  nodes: TopologyNode[];
  links: MapLink[];
  unconnected: { id: string; name: string }[];
  canManage: boolean;
  devices: DeviceOption[];
  focusId?: string;
}

type DeviceNodeData = {
  node: TopologyNode;
  loops: { portA: string | null; portB: string | null }[];
  selected: boolean;
  dim: boolean;
  direction: Direction;
};
type CableEdgeData = {
  cables: LaidOutEdge["cables"];
  highlight: boolean;
  dim: boolean;
  direction: Direction;
  title: string;
};
type DeviceNodeType = Node<DeviceNodeData, "device">;
type CableEdgeType = Edge<CableEdgeData, "cable">;

const DIRECTION_KEY = "axivo-topology-direction";

function iconFor(node: TopologyNode) {
  if (node.kind === "SERVER") return Server;
  if (/firewall/i.test(node.typeName)) return ShieldCheck;
  if (/router/i.test(node.typeName)) return Router;
  if (/wireless|access point/i.test(node.typeName)) return Wifi;
  return Network;
}

const STATUS_DOT: Record<string, string> = {
  ACTIVE: "bg-success",
  STANDBY: "bg-warning",
  DECOMMISSIONED: "bg-muted-foreground/50",
};

function portText(port: string | null) {
  return port ?? "?";
}

function useDarkMode() {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const root = document.documentElement;
    const update = () => setDark(root.classList.contains("dark"));
    update();
    const observer = new MutationObserver(update);
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);
  return dark;
}

/** SVG attributes cannot read CSS variables, so the minimap gets resolved colours. */
function useTokenColours(dark: boolean) {
  const [colours, setColours] = useState({ primary: "#4f63d2", destructive: "#d23c32", node: "#9aa0b4", mask: "rgb(240 242 248 / 0.7)" });
  useEffect(() => {
    const style = getComputedStyle(document.documentElement);
    const token = (name: string, alpha = 1) => `hsl(${style.getPropertyValue(name).trim()} / ${alpha})`;
    setColours({
      primary: token("--primary"),
      destructive: token("--destructive"),
      node: token("--muted-foreground", 0.55),
      mask: token("--background", 0.72),
    });
  }, [dark]);
  return colours;
}

// ---------------------------------------------------------------------------
// Canvas pieces
// ---------------------------------------------------------------------------

function DeviceNode({ data }: NodeProps<DeviceNodeType>) {
  const { node, loops, selected, dim, direction } = data;
  const Icon = iconFor(node);
  const handle = "!h-1.5 !w-1.5 !min-h-0 !min-w-0 !border-0 !bg-muted-foreground/40";
  return (
    <div
      style={{ width: NODE_WIDTH, height: NODE_HEIGHT }}
      className={cn(
        "flex flex-col justify-center rounded-xl border bg-card px-3 text-card-foreground shadow-sm transition-opacity duration-200",
        selected && "border-primary ring-2 ring-primary/30",
        !selected && loops.length > 0 && "border-destructive/70",
        !node.accessible && "border-dashed bg-muted/60",
        dim && "opacity-25",
      )}
    >
      <Handle type="target" position={direction === "LR" ? Position.Left : Position.Top} isConnectable={false} className={handle} />
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        <span className="min-w-0 flex-1 truncate text-[13px] font-semibold" title={node.name}>{node.name}</span>
        {loops.length > 0 ? (
          <span
            className="flex shrink-0 items-center gap-0.5 rounded-full bg-destructive/15 px-1.5 py-0.5 text-[10px] font-semibold text-destructive"
            title={`Loop: ${loops.map((l) => `${portText(l.portA)} and ${portText(l.portB)}`).join(", ")}`}
          >
            <TriangleAlert className="h-3 w-3" aria-hidden /> Loop
          </span>
        ) : null}
        <span className={cn("h-2 w-2 shrink-0 rounded-full", STATUS_DOT[node.status] ?? "bg-muted-foreground/50")} title={node.status.toLowerCase()} />
      </div>
      <p className="mt-0.5 truncate pl-6 text-[11px] text-muted-foreground">
        {node.accessible ? [node.typeName, node.ipAddress].filter(Boolean).join(" · ") : node.companyName}
      </p>
      <Handle type="source" position={direction === "LR" ? Position.Right : Position.Bottom} isConnectable={false} className={handle} />
    </div>
  );
}

/** Cubic point at t, for placing the port label near the far (outer) end. */
function pointAt(t: number, p0: number, p1: number, p2: number, p3: number) {
  const u = 1 - t;
  return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3;
}

function CableEdge({ id, sourceX, sourceY, targetX, targetY, data }: EdgeProps<CableEdgeType>) {
  const zoom = useStore((s) => s.transform[2]);
  if (!data) return null;
  const horizontal = data.direction === "LR";
  const span = horizontal ? targetX - sourceX : targetY - sourceY;
  const offset = Math.max(Math.abs(span) / 2, 48);
  const c1x = horizontal ? sourceX + offset : sourceX;
  const c1y = horizontal ? sourceY : sourceY + offset;
  const c2x = horizontal ? targetX - offset : targetX;
  const c2y = horizontal ? targetY : targetY - offset;
  const path = `M${sourceX},${sourceY} C${c1x},${c1y} ${c2x},${c2y} ${targetX},${targetY}`;
  const t = 0.78;
  const labelX = pointAt(t, sourceX, c1x, c2x, targetX);
  const labelY = pointAt(t, sourceY, c1y, c2y, targetY);
  const manual = data.cables.every((c) => c.manual);
  const showLabel = !data.dim && (data.highlight || zoom >= 0.55);

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        interactionWidth={14}
        style={{
          stroke: data.highlight ? "hsl(var(--primary))" : "hsl(var(--muted-foreground) / 0.5)",
          strokeWidth: (data.highlight ? 2.25 : 1.35) + (data.cables.length > 1 ? 1 : 0),
          strokeDasharray: manual ? "6 4" : undefined,
          opacity: data.dim ? 0.12 : 1,
          transition: "opacity 200ms, stroke 200ms",
        }}
      />
      {showLabel ? (
        <EdgeLabelRenderer>
          <div
            title={data.title}
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
            className={cn(
              "nodrag nopan pointer-events-auto absolute whitespace-nowrap rounded-md border bg-card px-1.5 py-0.5 font-mono text-[10px] leading-snug text-card-foreground shadow-sm",
              data.highlight && "border-primary/60",
            )}
          >
            {data.cables.map((cable) => (
              <div key={cable.id}>
                {portText(cable.sourcePort)} <span className="text-muted-foreground">→</span> {portText(cable.targetPort)}
              </div>
            ))}
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  );
}

const nodeTypes = { device: DeviceNode };
const edgeTypes = { cable: CableEdge };

// ---------------------------------------------------------------------------
// Map view
// ---------------------------------------------------------------------------

function MapCanvas({
  nodes, links, unconnected, focusId, canManage, devices,
}: Props) {
  const dark = useDarkMode();
  const colours = useTokenColours(dark);
  const flow = useReactFlow();
  const [direction, setDirection] = useState<Direction>("LR");
  const [selectedId, setSelectedId] = useState<string | null>(focusId ?? null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(DIRECTION_KEY);
      if (saved === "TB" || saved === "LR") setDirection(saved);
    } catch {
      // Private windows may block storage; the default direction is fine.
    }
  }, []);

  function changeDirection(next: Direction) {
    setDirection(next);
    try {
      localStorage.setItem(DIRECTION_KEY, next);
    } catch {
      // Not remembered, which is harmless.
    }
    requestAnimationFrame(() => flow.fitView({ padding: 0.1, duration: 300 }));
  }

  const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  const laid = useMemo(() => layoutTopology(nodes, links, direction), [nodes, links, direction]);

  const neighbourIds = useMemo(() => {
    if (!selectedId) return null;
    const ids = new Set([selectedId]);
    for (const edge of laid.edges) {
      if (edge.source === selectedId) ids.add(edge.target);
      if (edge.target === selectedId) ids.add(edge.source);
    }
    return ids;
  }, [selectedId, laid]);

  const flowNodes: DeviceNodeType[] = useMemo(
    () =>
      nodes.map((node) => ({
        id: node.id,
        type: "device",
        position: laid.positions.get(node.id) ?? { x: 0, y: 0 },
        // A fixed size lets the minimap and fit-to-view work before anything is measured.
        width: NODE_WIDTH,
        height: NODE_HEIGHT,
        draggable: false,
        connectable: false,
        data: {
          node,
          loops: laid.loops.get(node.id) ?? [],
          selected: node.id === selectedId,
          dim: !!neighbourIds && !neighbourIds.has(node.id),
          direction,
        },
      })),
    [nodes, laid, selectedId, neighbourIds, direction],
  );

  const flowEdges: CableEdgeType[] = useMemo(
    () =>
      laid.edges.map((edge) => {
        const touches = !!selectedId && (edge.source === selectedId || edge.target === selectedId);
        const s = byId.get(edge.source)?.name ?? "";
        const t = byId.get(edge.target)?.name ?? "";
        return {
          id: edge.id,
          type: "cable",
          source: edge.source,
          target: edge.target,
          selectable: false,
          zIndex: touches ? 10 : 0,
          data: {
            cables: edge.cables,
            highlight: touches,
            dim: !!selectedId && !touches,
            direction,
            title: edge.cables.map((c) => `${s} ${portText(c.sourcePort)} → ${t} ${portText(c.targetPort)}`).join("\n"),
          },
        };
      }),
    [laid, selectedId, byId, direction],
  );

  function focus(id: string) {
    setSelectedId(id);
    requestAnimationFrame(() => flow.fitView({ nodes: [{ id }], maxZoom: 1.1, duration: 400, padding: 0.6 }));
  }

  const loopNodes = nodes.filter((n) => laid.loops.has(n.id));
  const selected = selectedId ? byId.get(selectedId) ?? null : null;

  return (
    <div className="flex flex-col gap-4 lg:flex-row">
      {/* Only grow along the row: in the stacked (mobile) column a flex-basis would cancel the height React Flow needs. */}
      <div className="relative h-[calc(100dvh-21rem)] min-h-[30rem] w-full min-w-0 overflow-hidden rounded-2xl border bg-background lg:flex-1">
        <div className="absolute left-3 right-3 top-3 z-10 flex flex-wrap items-center gap-2">
          <div className="w-full max-w-xs rounded-full bg-card shadow-sm sm:w-72">
            <Combobox
              id="topology-search"
              value=""
              placeholder="Find a device"
              options={nodes.map((n) => ({ value: n.id, label: n.name, hint: [n.typeName, n.ipAddress].filter(Boolean).join(" · ") }))}
              onChange={(id) => id && focus(id)}
            />
          </div>
          <div className="flex rounded-full border bg-card p-0.5 shadow-sm" role="group" aria-label="Layout direction">
            {([["LR", ArrowRightFromLine, "Left to right"], ["TB", ArrowDownFromLine, "Top down"]] as const).map(([value, Icon, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={direction === value}
                title={label}
                onClick={() => changeDirection(value)}
                className={cn(
                  "flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-medium transition-colors",
                  direction === value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="h-3.5 w-3.5" aria-hidden /> <span className="hidden sm:inline">{label}</span>
              </button>
            ))}
          </div>
        </div>
        <ReactFlow
          nodes={flowNodes}
          edges={flowEdges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          colorMode={dark ? "dark" : "light"}
          onNodeClick={(_, node) => setSelectedId((current) => (current === node.id ? null : node.id))}
          onPaneClick={() => setSelectedId(null)}
          onInit={(instance) => {
            if (focusId && byId.has(focusId)) {
              requestAnimationFrame(() => instance.fitView({ nodes: [{ id: focusId }], maxZoom: 1.1, padding: 0.6 }));
            }
          }}
          nodesDraggable={false}
          nodesConnectable={false}
          edgesFocusable={false}
          fitView
          fitViewOptions={{ padding: 0.1 }}
          minZoom={0.05}
          maxZoom={2}
          proOptions={{ hideAttribution: true }}
          style={{ background: "transparent" }}
        >
          <Background gap={22} size={1} color="hsl(var(--border))" />
          <Controls showInteractive={false} position="bottom-left" />
          <MiniMap
            pannable
            zoomable
            position="bottom-right"
            className="!hidden !rounded-xl !border !bg-card sm:!block"
            nodeColor={(n) => (n.id === selectedId ? colours.primary : laid.loops.has(n.id) ? colours.destructive : colours.node)}
            nodeBorderRadius={6}
            maskColor={colours.mask}
          />
        </ReactFlow>
      </div>

      <aside className="w-full shrink-0 lg:w-80">
        {selected ? (
          <DevicePanel
            node={selected}
            links={links}
            byId={byId}
            onSelect={focus}
            onClose={() => setSelectedId(null)}
            canManage={canManage}
            devices={devices}
          />
        ) : (
          <OverviewPanel nodes={nodes} links={links} loopNodes={loopNodes} unconnected={unconnected} onSelect={focus} />
        )}
      </aside>
    </div>
  );
}

function PanelCard({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("rounded-2xl border bg-card p-4 text-sm", className)}>{children}</div>;
}

function OverviewPanel({
  nodes, links, loopNodes, unconnected, onSelect,
}: {
  nodes: TopologyNode[];
  links: MapLink[];
  loopNodes: TopologyNode[];
  unconnected: { id: string; name: string }[];
  onSelect: (id: string) => void;
}) {
  return (
    <div className="space-y-4">
      <PanelCard>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-2xl font-semibold tabular-nums">{nodes.length}</p>
            <p className="text-xs text-muted-foreground">devices on the map</p>
          </div>
          <div>
            <p className="text-2xl font-semibold tabular-nums">{links.length}</p>
            <p className="text-xs text-muted-foreground">cables</p>
          </div>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Click a device to see its ports. Labels read <span className="font-mono">port → port</span>, from the side nearer the core.
          A dashed line was added by hand; a solid one came from a neighbour table.
        </p>
      </PanelCard>
      {loopNodes.length > 0 ? (
        <PanelCard className="border-destructive/40">
          <p className="mb-2 flex items-center gap-1.5 font-medium text-destructive">
            <TriangleAlert className="h-4 w-4" aria-hidden /> {loopNodes.length} device{loopNodes.length === 1 ? " sees" : "s see"} itself
          </p>
          <p className="mb-2 text-xs text-muted-foreground">Two of its ports lead to the same place. Usually a loop cable or a small switch plugged in twice.</p>
          <ul className="space-y-1">
            {loopNodes.map((node) => (
              <li key={node.id}>
                <button type="button" onClick={() => onSelect(node.id)} className="text-left font-medium hover:underline">{node.name}</button>
              </li>
            ))}
          </ul>
        </PanelCard>
      ) : null}
      {unconnected.length > 0 ? (
        <PanelCard>
          <details>
            <summary className="cursor-pointer font-medium">Not on the map yet ({unconnected.length})</summary>
            <p className="mt-2 text-xs text-muted-foreground">Network devices with no cable recorded. Import a neighbour table, or add the cables on each device.</p>
            <ul className="mt-2 max-h-64 space-y-1 overflow-y-auto">
              {unconnected.map((device) => (
                <li key={device.id}>
                  <Link href={`/infrastructure/devices/${device.id}`} className="hover:underline">{device.name}</Link>
                </li>
              ))}
            </ul>
          </details>
        </PanelCard>
      ) : null}
    </div>
  );
}

interface PortRow {
  linkId: string;
  port: string | null;
  other: TopologyNode | undefined;
  otherPort: string | null;
  loop: boolean;
  link: MapLink;
}

function portsOf(nodeId: string, links: MapLink[], byId: Map<string, TopologyNode>): PortRow[] {
  const rows: PortRow[] = [];
  for (const link of links) {
    if (link.a !== nodeId && link.b !== nodeId) continue;
    const mine = link.a === nodeId;
    rows.push({
      linkId: link.id,
      port: mine ? link.portA : link.portB,
      other: byId.get(mine ? link.b : link.a),
      otherPort: mine ? link.portB : link.portA,
      loop: link.a === link.b,
      link,
    });
  }
  return rows.sort((x, y) => (x.port ?? "").localeCompare(y.port ?? "", undefined, { numeric: true }));
}

function DevicePanel({
  node, links, byId, onSelect, onClose, canManage, devices,
}: {
  node: TopologyNode;
  links: MapLink[];
  byId: Map<string, TopologyNode>;
  onSelect: (id: string) => void;
  onClose: () => void;
  canManage: boolean;
  devices: DeviceOption[];
}) {
  const rows = portsOf(node.id, links, byId);
  const Icon = iconFor(node);
  return (
    <PanelCard className="space-y-4">
      <div className="flex items-start gap-2">
        <Icon className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold" title={node.name}>{node.name}</p>
          <p className="text-xs text-muted-foreground">
            {node.accessible ? [node.typeName, node.ipAddress].filter(Boolean).join(" · ") : `${node.companyName} device`}
          </p>
          {node.accessible ? (
            <p className="text-xs text-muted-foreground">{[node.companyName, node.location].filter(Boolean).join(" · ")}</p>
          ) : null}
        </div>
        <button type="button" onClick={onClose} aria-label="Close" className="rounded-full p-1 text-muted-foreground hover:bg-accent hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div>
        <p className="mb-2 label-caps text-muted-foreground">Connections ({rows.length})</p>
        <ul className="divide-y">
          {rows.map((row) => (
            <li key={row.linkId} className="flex items-baseline gap-2 py-1.5">
              <span className={cn("w-20 shrink-0 font-mono text-xs", row.loop && "text-destructive")}>{portText(row.port)}</span>
              <span className="min-w-0 flex-1">
                {row.loop ? (
                  <span className="text-xs font-medium text-destructive">Loop back to {portText(row.otherPort)}</span>
                ) : row.other ? (
                  <button type="button" onClick={() => onSelect(row.other!.id)} className="block w-full truncate text-left hover:underline" title={row.other.name}>
                    {row.other.name}
                  </button>
                ) : null}
                {!row.loop ? <span className="block font-mono text-[11px] text-muted-foreground">{portText(row.otherPort)}</span> : null}
              </span>
            </li>
          ))}
        </ul>
      </div>
      {node.accessible ? (
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/infrastructure/devices/${node.id}`}
            className="inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium hover:border-primary/40 hover:bg-accent"
          >
            <ExternalLink className="h-3.5 w-3.5" /> Open device
          </Link>
          {canManage ? <LinkDialog devices={devices} fixedDeviceId={node.id} /> : null}
        </div>
      ) : null}
    </PanelCard>
  );
}

// ---------------------------------------------------------------------------
// List view
// ---------------------------------------------------------------------------

function CableList({ nodes, links, canManage, devices }: Pick<Props, "nodes" | "links" | "canManage" | "devices">) {
  const [query, setQuery] = useState("");
  const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return links
      .map((link) => ({ link, a: byId.get(link.a), b: byId.get(link.b) }))
      .filter(({ link, a, b }) =>
        !q || [a?.name, b?.name, link.portA, link.portB, a?.ipAddress, b?.ipAddress].some((v) => v?.toLowerCase().includes(q)))
      .sort((x, y) =>
        (x.a?.name ?? "").localeCompare(y.a?.name ?? "") || (x.link.portA ?? "").localeCompare(y.link.portA ?? "", undefined, { numeric: true }));
  }, [links, byId, query]);

  return (
    <div>
      <div className="relative mb-3 w-full sm:w-80">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search device, port or IP" className="pl-9" aria-label="Search cables" />
      </div>
      <Table>
        <THead>
          <TR>
            <TH>Device</TH><TH>Port</TH><TH>Connects to</TH><TH>Its port</TH><TH>Recorded</TH>
            {canManage ? <TH className="text-right">Actions</TH> : null}
          </TR>
        </THead>
        <TBody>
          {rows.length === 0 ? (
            <TR><TD colSpan={canManage ? 6 : 5} className="py-8 text-center text-muted-foreground">No cable matches.</TD></TR>
          ) : rows.map(({ link, a, b }) => {
            const loop = link.a === link.b;
            const label = `${a?.name ?? ""} ${link.portA ?? ""} to ${b?.name ?? ""} ${link.portB ?? ""}`.replace(/\s+/g, " ").trim();
            return (
              <TR key={link.id}>
                <TD><DeviceName node={a} /></TD>
                <TD className="font-mono text-xs">{portText(link.portA)}</TD>
                <TD>{loop ? <span className="text-xs font-medium text-destructive">Loop back to itself</span> : <DeviceName node={b} />}</TD>
                <TD className="font-mono text-xs">{portText(link.portB)}</TD>
                <TD className="text-xs text-muted-foreground">
                  {link.source === "DISCOVERY" ? `Discovered${link.seenLabel ? `, seen ${link.seenLabel}` : ""}` : "Added by hand"}
                </TD>
                {canManage ? (
                  <TD className="text-right">
                    {a?.accessible && b?.accessible ? (
                      <div className="flex justify-end">
                        <LinkDialog
                          devices={devices}
                          trigger="icon"
                          link={{ id: link.id, deviceAId: link.a, portA: link.portA, deviceBId: link.b, portB: link.portB, notes: link.notes }}
                        />
                        <RemoveLinkButton linkId={link.id} label={label} />
                      </div>
                    ) : null}
                  </TD>
                ) : null}
              </TR>
            );
          })}
        </TBody>
      </Table>
    </div>
  );
}

function DeviceName({ node }: { node: TopologyNode | undefined }) {
  if (!node) return null;
  return node.accessible ? (
    <Link href={`/infrastructure/devices/${node.id}`} className="font-medium hover:underline">{node.name}</Link>
  ) : (
    <span className="text-muted-foreground" title={`${node.companyName} device`}>{node.name}</span>
  );
}

// ---------------------------------------------------------------------------

export function TopologyView(props: Props) {
  const [view, setView] = useState<"map" | "list">("map");
  return (
    <div>
      <div className="mb-3 flex rounded-full border bg-card p-0.5 shadow-sm w-fit" role="group" aria-label="View">
        {([["map", MapIcon, "Map"], ["list", List, "Cable list"]] as const).map(([value, Icon, label]) => (
          <button
            key={value}
            type="button"
            aria-pressed={view === value}
            onClick={() => setView(value)}
            className={cn(
              "flex h-8 items-center gap-1.5 rounded-full px-3.5 text-xs font-medium transition-colors",
              view === value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden /> {label}
          </button>
        ))}
      </div>
      {view === "map" ? (
        <ReactFlowProvider>
          <MapCanvas {...props} />
        </ReactFlowProvider>
      ) : (
        <CableList nodes={props.nodes} links={props.links} canManage={props.canManage} devices={props.devices} />
      )}
    </div>
  );
}
