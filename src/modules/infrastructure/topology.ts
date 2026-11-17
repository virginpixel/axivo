import { db, type DbClient } from "@/shared/db";
import { recordAudit } from "@/shared/audit/audit";
import { NotFoundError, ValidationError } from "@/shared/errors";
import type { Prisma } from "@prisma/client";
import { companyFilter, type Scope } from "./service";
import { readSheets } from "./import";
import {
  normalizePort, portKey, deviceKey, linkKey, pickLinkSheet, cell, LINK_FIELD_LABELS, LINK_FIELDS, type LinkField,
} from "./topology-parse";
import type { LinkInput } from "./validators";

/**
 * Switch connections and the topology map (SDS Doc 24). A link is one cable:
 * a port on one device to a port on another. They are typed by hand or read
 * from a neighbour table (CDP/LLDP), such as the one in the discovery workbook.
 */

const MODULE = "infrastructure";
const MAX_ROWS = 20000;

interface End {
  id: string;
  name: string;
  companyId: string;
}

export function describeLink(a: { name: string }, portA: string | null, b: { name: string }, portB: string | null) {
  return `${a.name}${portA ? ` ${portA}` : ""} to ${b.name}${portB ? ` ${portB}` : ""}`;
}

/** Each end's device page lists the change, so both are audited. */
async function auditEnds(
  client: DbClient,
  scope: Scope,
  a: End,
  b: End,
  entry: { eventType: string; action: string; linkId: string },
) {
  for (const end of a.id === b.id ? [a] : [a, b]) {
    await recordAudit(
      { ...scope.audit, companyId: end.companyId },
      {
        module: MODULE,
        eventType: entry.eventType,
        action: entry.action,
        targetType: "infra_device",
        targetId: end.id,
        targetLabel: end.name,
        details: { linkId: entry.linkId },
      },
      client,
    );
  }
}

async function loadEnds(scope: Scope, deviceAId: string, deviceBId: string) {
  const devices = await db.infraDevice.findMany({
    where: { id: { in: [deviceAId, deviceBId] }, deletedAt: null },
    select: { id: true, name: true, companyId: true },
  });
  const a = devices.find((d) => d.id === deviceAId);
  const b = devices.find((d) => d.id === deviceBId);
  if (!a) throw new ValidationError(undefined, { deviceAId: "Select a device." });
  if (!b) throw new ValidationError(undefined, { deviceBId: "Select the device it connects to." });
  if (!scope.isGlobalAdmin) {
    if (a.companyId !== scope.companyId) throw new ValidationError(undefined, { deviceAId: "Select a device of your company." });
    if (b.companyId !== scope.companyId) throw new ValidationError(undefined, { deviceBId: "Select a device of your company." });
  }
  return { a, b };
}

/** A port carries one cable; a loop needs two different ports. */
async function checkPorts(a: End, portA: string | null, b: End, portB: string | null, excludeId?: string) {
  if (a.id === b.id && (!portA || !portB || portKey(portA) === portKey(portB))) {
    throw new ValidationError(undefined, { portB: "A cable from a device back to itself needs two different ports." });
  }
  for (const [end, port, field] of [[a, portA, "portA"], [b, portB, "portB"]] as const) {
    if (!port) continue;
    const taken = await db.infraLink.findFirst({
      where: {
        ...(excludeId ? { id: { not: excludeId } } : {}),
        OR: [
          { deviceAId: end.id, portA: { equals: port, mode: "insensitive" } },
          { deviceBId: end.id, portB: { equals: port, mode: "insensitive" } },
        ],
      },
      include: { deviceA: { select: { name: true } }, deviceB: { select: { name: true } } },
    });
    if (taken) {
      const other = taken.deviceAId === end.id && portKey(taken.portA) === portKey(port)
        ? { name: taken.deviceB.name, port: taken.portB }
        : { name: taken.deviceA.name, port: taken.portA };
      throw new ValidationError(undefined, {
        [field]: `${port} on ${end.name} is already connected to ${other.name}${other.port ? ` ${other.port}` : ""}.`,
      });
    }
  }
}

export async function createLink(scope: Scope, input: LinkInput) {
  const portA = normalizePort(input.portA);
  const portB = normalizePort(input.portB);
  const { a, b } = await loadEnds(scope, input.deviceAId, input.deviceBId);
  await checkPorts(a, portA, b, portB);
  return db.$transaction(async (tx) => {
    const link = await tx.infraLink.create({
      data: {
        deviceAId: a.id, portA, deviceBId: b.id, portB, notes: input.notes, source: "MANUAL",
        createdById: scope.audit.actorUserId ?? null, updatedById: scope.audit.actorUserId ?? null,
      },
    });
    await auditEnds(tx, scope, a, b, { eventType: "link.created", action: `Connected ${describeLink(a, portA, b, portB)}`, linkId: link.id });
    return link;
  });
}

async function findLink(scope: Scope, id: string) {
  const link = await db.infraLink.findFirst({
    where: { id, deviceA: { deletedAt: null }, deviceB: { deletedAt: null } },
    include: {
      deviceA: { select: { id: true, name: true, companyId: true } },
      deviceB: { select: { id: true, name: true, companyId: true } },
    },
  });
  if (!link) throw new NotFoundError("Connection not found.");
  if (!scope.isGlobalAdmin && (link.deviceA.companyId !== scope.companyId || link.deviceB.companyId !== scope.companyId)) {
    throw new NotFoundError("Connection not found.");
  }
  return link;
}

export async function updateLink(scope: Scope, id: string, input: LinkInput) {
  const existing = await findLink(scope, id);
  const portA = normalizePort(input.portA);
  const portB = normalizePort(input.portB);
  const { a, b } = await loadEnds(scope, input.deviceAId, input.deviceBId);
  await checkPorts(a, portA, b, portB, id);
  const before = describeLink(existing.deviceA, existing.portA, existing.deviceB, existing.portB);
  const after = describeLink(a, portA, b, portB);
  return db.$transaction(async (tx) => {
    // Edited by hand, so a later import no longer treats it as its own to remove.
    const link = await tx.infraLink.update({
      where: { id },
      data: { deviceAId: a.id, portA, deviceBId: b.id, portB, notes: input.notes, source: "MANUAL", updatedById: scope.audit.actorUserId ?? null },
    });
    const action = before === after ? `Updated the notes on ${after}` : `Changed connection ${before} to ${after}`;
    await auditEnds(tx, scope, a, b, { eventType: "link.updated", action, linkId: id });
    // An end that moved off a device still gets the record on its page.
    for (const old of [existing.deviceA, existing.deviceB]) {
      if (old.id !== a.id && old.id !== b.id) {
        await auditEnds(tx, scope, old, old, { eventType: "link.updated", action, linkId: id });
      }
    }
    return link;
  });
}

export async function deleteLink(scope: Scope, id: string) {
  const existing = await findLink(scope, id);
  await db.$transaction(async (tx) => {
    await tx.infraLink.delete({ where: { id } });
    await auditEnds(tx, scope, existing.deviceA, existing.deviceB, {
      eventType: "link.deleted",
      action: `Removed connection ${describeLink(existing.deviceA, existing.portA, existing.deviceB, existing.portB)}`,
      linkId: id,
    });
  });
}

// ---------------------------------------------------------------------------
// The map
// ---------------------------------------------------------------------------

export interface TopologyNode {
  id: string;
  name: string;
  kind: "NETWORK" | "SERVER";
  typeName: string;
  ipAddress: string | null;
  status: string;
  companyName: string;
  location: string | null;
  /** False for another company's device at the far end of a visible cable. */
  accessible: boolean;
}

export interface TopologyLink {
  id: string;
  a: string;
  portA: string | null;
  b: string;
  portB: string | null;
  source: "MANUAL" | "DISCOVERY";
  lastSeenAt: string | null;
  notes: string | null;
}

export interface TopologyData {
  nodes: TopologyNode[];
  links: TopologyLink[];
  /** Live network devices with no cable recorded yet. */
  unconnected: { id: string; name: string }[];
}

const nodeSelect = {
  id: true, name: true, kind: true, ipAddress: true, status: true, companyId: true,
  type: { select: { name: true } },
  company: { select: { name: true } },
  location: { select: { name: true, parent: { select: { name: true } } } },
} satisfies Prisma.InfraDeviceSelect;

/** Everything the map draws. `companyId` narrows to cables touching that company. */
export async function loadTopology(scope: Scope, companyId?: string | null): Promise<TopologyData> {
  const company = scope.isGlobalAdmin ? companyId || null : scope.companyId;
  const links = await db.infraLink.findMany({
    where: {
      deviceA: { deletedAt: null },
      deviceB: { deletedAt: null },
      ...(company ? { OR: [{ deviceA: { companyId: company } }, { deviceB: { companyId: company } }] } : {}),
    },
    orderBy: { createdAt: "asc" },
    include: { deviceA: { select: nodeSelect }, deviceB: { select: nodeSelect } },
  });

  const nodes = new Map<string, TopologyNode>();
  for (const device of links.flatMap((l) => [l.deviceA, l.deviceB])) {
    if (nodes.has(device.id)) continue;
    const accessible = scope.isGlobalAdmin || device.companyId === scope.companyId;
    nodes.set(device.id, {
      id: device.id,
      name: device.name,
      kind: device.kind,
      typeName: device.type.name,
      ipAddress: accessible ? device.ipAddress : null,
      status: device.status,
      companyName: device.company.name,
      location: accessible && device.location
        ? [device.location.parent?.name, device.location.name].filter(Boolean).join(" › ")
        : null,
      accessible,
    });
  }

  const unconnected = await db.infraDevice.findMany({
    where: {
      kind: "NETWORK",
      deletedAt: null,
      status: { not: "DECOMMISSIONED" },
      ...(company ? { companyId: company } : {}),
      linksA: { none: {} },
      linksB: { none: {} },
    },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  return {
    nodes: [...nodes.values()],
    links: links.map((l) => ({
      id: l.id,
      a: l.deviceAId,
      portA: l.portA,
      b: l.deviceBId,
      portB: l.portB,
      source: l.source,
      lastSeenAt: l.lastSeenAt?.toISOString() ?? null,
      notes: l.notes,
    })),
    unconnected,
  };
}

// ---------------------------------------------------------------------------
// Import from a neighbour table
// ---------------------------------------------------------------------------

export interface LinkImportRow {
  key: string;
  a: { id: string; name: string };
  portA: string | null;
  b: { id: string; name: string };
  portB: string | null;
  loop: boolean;
  /** Both switches reported the cable. */
  seenFromBothEnds: boolean;
  outcome: "new" | "known" | "changed";
  /** Recorded cables on the same ports that this one takes the place of. */
  replaces: string[];
}

export interface LinkImportPreview {
  fileName: string;
  sheetName: string;
  headerRow: number;
  totalRows: number;
  columns: { field: LinkField; label: string; header: string }[];
  links: LinkImportRow[];
  /** Names in the file that match no device in the register. */
  unmatched: { name: string; type: string | null; count: number; side: "device" | "neighbour" }[];
  /** Imported cables the file no longer shows, from switches whose table is in it. */
  stale: { id: string; description: string }[];
}

interface Analysis {
  preview: LinkImportPreview;
  create: LinkImportRow[];
  knownIds: string[];
  replaceIds: string[];
}

async function analyse(scope: Scope, file: File): Promise<Analysis> {
  const sheet = pickLinkSheet(await readSheets(file));
  if (!sheet) {
    throw new ValidationError(undefined, {
      file: "No sheet has a device column (Switch or Device), a Neighbour (or Connected to) column and a port column.",
    });
  }
  if (sheet.rows.length === 0) throw new ValidationError(undefined, { file: "The sheet has headings but no rows." });
  if (sheet.rows.length > MAX_ROWS) throw new ValidationError(undefined, { file: `Import at most ${MAX_ROWS} rows at a time.` });

  const devices = await db.infraDevice.findMany({
    where: { deletedAt: null, ...companyFilter(scope) },
    select: { id: true, name: true, hostname: true, ipAddress: true, companyId: true },
  });
  const byName = new Map<string, End[]>();
  const byIp = new Map<string, End[]>();
  const push = (map: Map<string, End[]>, key: string, device: End) => {
    if (!key) return;
    const list = map.get(key) ?? [];
    if (!list.some((d) => d.id === device.id)) list.push(device);
    map.set(key, list);
  };
  for (const device of devices) {
    const end = { id: device.id, name: device.name, companyId: device.companyId };
    push(byName, deviceKey(device.name), end);
    push(byName, deviceKey(device.hostname), end);
    if (device.ipAddress) push(byIp, device.ipAddress, end);
  }
  // Name first: CDP can advertise a stale address, but the name is what the switch calls itself.
  const resolve = (name: string, ip: string, preferCompany?: string): End | null => {
    const key = deviceKey(name);
    let candidates = byName.get(key) ?? byIp.get(key) ?? [];
    if (candidates.length === 0 && ip) candidates = byIp.get(ip) ?? [];
    if (candidates.length > 1 && preferCompany) {
      const same = candidates.filter((d) => d.companyId === preferCompany);
      if (same.length === 1) candidates = same;
    }
    return candidates.length === 1 ? candidates[0]! : null;
  };

  const groups = new Map<string, { a: End; portA: string | null; b: End; portB: string | null; reports: Set<string> }>();
  const unmatched = new Map<string, LinkImportPreview["unmatched"][number]>();
  const covered = new Set<string>();
  const miss = (name: string, type: string | null, side: "device" | "neighbour") => {
    const key = `${side}|${deviceKey(name)}`;
    const entry = unmatched.get(key);
    if (entry) {
      entry.count += 1;
      entry.type ??= type;
    } else {
      unmatched.set(key, { name: /^\d/.test(name) ? name : name.split(".")[0]!, type, count: 1, side });
    }
  };

  for (const { cells } of sheet.rows) {
    const name = cell(sheet, cells, "device");
    const neighbour = cell(sheet, cells, "neighbour");
    if (!name || !neighbour) continue;
    const a = resolve(name, cell(sheet, cells, "deviceIp"));
    if (!a) {
      miss(name, null, "device");
      continue;
    }
    covered.add(a.id);
    const b = resolve(neighbour, cell(sheet, cells, "neighbourIp"), a.companyId);
    if (!b) {
      miss(neighbour, cell(sheet, cells, "neighbourType") || null, "neighbour");
      continue;
    }
    const portA = normalizePort(cell(sheet, cells, "port"));
    const portB = normalizePort(cell(sheet, cells, "neighbourPort"));
    // A port that hears itself is not a cable worth recording.
    if (a.id === b.id && portKey(portA) === portKey(portB)) continue;
    const key = linkKey(a.id, portA, b.id, portB);
    const group = groups.get(key);
    if (group) group.reports.add(a.id);
    else groups.set(key, { a, portA, b, portB, reports: new Set([a.id]) });
  }

  const ids = new Set<string>([...covered]);
  for (const group of groups.values()) {
    ids.add(group.a.id);
    ids.add(group.b.id);
  }
  const existing = await db.infraLink.findMany({
    where: { OR: [{ deviceAId: { in: [...ids] } }, { deviceBId: { in: [...ids] } }] },
    include: { deviceA: { select: { name: true } }, deviceB: { select: { name: true } } },
  });
  const existingByKey = new Map(existing.map((l) => [linkKey(l.deviceAId, l.portA, l.deviceBId, l.portB), l]));
  const atPort = new Map<string, typeof existing>();
  for (const link of existing) {
    for (const [device, port] of [[link.deviceAId, link.portA], [link.deviceBId, link.portB]] as const) {
      if (!port) continue;
      const key = `${device}|${portKey(port)}`;
      atPort.set(key, [...(atPort.get(key) ?? []), link]);
    }
  }

  const rows: LinkImportRow[] = [];
  const knownIds: string[] = [];
  const replaceIds = new Set<string>();
  for (const [key, g] of groups) {
    const known = existingByKey.get(key);
    const row: LinkImportRow = {
      key,
      a: { id: g.a.id, name: g.a.name },
      portA: g.portA,
      b: { id: g.b.id, name: g.b.name },
      portB: g.portB,
      loop: g.a.id === g.b.id,
      seenFromBothEnds: g.a.id !== g.b.id && g.reports.size === 2,
      outcome: "new",
      replaces: [],
    };
    if (known) {
      row.outcome = "known";
      knownIds.push(known.id);
    } else {
      const conflicts = [
        ...(g.portA ? atPort.get(`${g.a.id}|${portKey(g.portA)}`) ?? [] : []),
        ...(g.portB ? atPort.get(`${g.b.id}|${portKey(g.portB)}`) ?? [] : []),
      ].filter((l) => !groups.has(linkKey(l.deviceAId, l.portA, l.deviceBId, l.portB)));
      for (const conflict of conflicts) {
        replaceIds.add(conflict.id);
        const text = describeLink(conflict.deviceA, conflict.portA, conflict.deviceB, conflict.portB);
        if (!row.replaces.includes(text)) row.replaces.push(text);
      }
      if (row.replaces.length > 0) row.outcome = "changed";
    }
    rows.push(row);
  }
  rows.sort((x, y) => x.a.name.localeCompare(y.a.name) || (x.portA ?? "").localeCompare(y.portA ?? "", undefined, { numeric: true }));

  const stale = existing
    .filter((l) =>
      l.source === "DISCOVERY" &&
      !replaceIds.has(l.id) &&
      !groups.has(linkKey(l.deviceAId, l.portA, l.deviceBId, l.portB)) &&
      (covered.has(l.deviceAId) || covered.has(l.deviceBId)))
    .map((l) => ({ id: l.id, description: describeLink(l.deviceA, l.portA, l.deviceB, l.portB) }));

  const preview: LinkImportPreview = {
    fileName: file.name,
    sheetName: sheet.name,
    headerRow: sheet.headerRow,
    totalRows: sheet.rows.length,
    columns: LINK_FIELDS.filter((f) => sheet.columns.fields[f] !== undefined).map((field) => ({
      field,
      label: LINK_FIELD_LABELS[field],
      header: sheet.columns.headers[sheet.columns.fields[field]!] ?? "",
    })),
    links: rows,
    unmatched: [...unmatched.values()].sort((x, y) => y.count - x.count || x.name.localeCompare(y.name)),
    stale,
  };
  return { preview, create: rows.filter((r) => r.outcome !== "known"), knownIds, replaceIds: [...replaceIds] };
}

export async function previewLinkImport(scope: Scope, file: File): Promise<LinkImportPreview> {
  return (await analyse(scope, file)).preview;
}

export interface LinkImportResult {
  created: number;
  confirmed: number;
  replaced: number;
  removed: number;
}

export async function commitLinkImport(scope: Scope, file: File, options: { removeStale: boolean }): Promise<LinkImportResult> {
  const { preview, create, knownIds, replaceIds } = await analyse(scope, file);
  const staleIds = options.removeStale ? preview.stale.map((s) => s.id) : [];
  const now = new Date();
  const actor = scope.audit.actorUserId ?? null;
  await db.$transaction(
    async (tx) => {
      const remove = [...new Set([...replaceIds, ...staleIds])];
      if (remove.length > 0) await tx.infraLink.deleteMany({ where: { id: { in: remove } } });
      if (knownIds.length > 0) await tx.infraLink.updateMany({ where: { id: { in: knownIds } }, data: { lastSeenAt: now } });
      if (create.length > 0) {
        await tx.infraLink.createMany({
          data: create.map((row) => ({
            deviceAId: row.a.id, portA: row.portA, deviceBId: row.b.id, portB: row.portB,
            source: "DISCOVERY" as const, lastSeenAt: now, createdById: actor, updatedById: actor,
          })),
        });
      }
      await recordAudit(
        scope.audit,
        {
          module: MODULE,
          eventType: "link.imported",
          action: `Imported switch connections from "${file.name}": ${create.length} added, ${knownIds.length} confirmed, ${replaceIds.length} replaced, ${staleIds.length} removed`,
          targetType: "infra_link",
          details: { fileName: file.name, sheet: preview.sheetName, created: create.length, confirmed: knownIds.length, replaced: replaceIds.length, removed: staleIds.length },
        },
        tx,
      );
    },
    { timeout: 120_000 },
  );
  return { created: create.length, confirmed: knownIds.length, replaced: replaceIds.length, removed: staleIds.length };
}
