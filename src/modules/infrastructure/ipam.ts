import { Prisma } from "@prisma/client";
import { db } from "@/shared/db";
import { enqueueConfigBackup } from "@/shared/queue/queue";
import { recordAudit, diffRecords } from "@/shared/audit/audit";
import { BusinessRuleError, NotFoundError, ValidationError } from "@/shared/errors";
import { assertCompanyAccess, companyFilter, type Scope } from "./service";
import { readSheets } from "./import";
import { suggestCompany } from "./import-parse";
import {
  cidrFromParts, contains, ipToNumber, normalizeMac, overlaps, parseCidr, subnetFacts, type Cidr,
} from "./ip-math";
import { parseAddressRow, parsePlanRow, pickAddressSheet, pickPlanSheet, type AddressRow, type PlanRow } from "./ipam-parse";
import type { IpAddressInput, SubnetInput, VlanInput } from "./validators";

/**
 * The IP & VLAN plan (SDS Doc 24): each company's VLANs, IPv4 subnets and the
 * addresses in them. Subnets and addresses carry their range as numbers, so
 * "what is inside this subnet" and "which subnets overlap" are range queries.
 */

const MODULE = "infrastructure";
const MAX_ROWS = 20_000;

const vlanLabel = (v: { number: number; name: string }) => `VLAN ${v.number} ${v.name}`;
const cidrText = (s: { network: string; prefix: number }) => `${s.network}/${s.prefix}`;

async function assertCompany(scope: Scope, companyId: string) {
  assertCompanyAccess(scope, companyId);
  const company = await db.company.findFirst({ where: { id: companyId, deletedAt: null } });
  if (!company) throw new BusinessRuleError("Company not found.");
}

// ---------------------------------------------------------------------------
// VLANs
// ---------------------------------------------------------------------------

export async function createVlan(scope: Scope, input: VlanInput) {
  await assertCompany(scope, input.companyId);
  if (await db.vlan.findUnique({ where: { companyId_number: { companyId: input.companyId, number: input.number } } })) {
    throw new ValidationError(undefined, { number: `VLAN ${input.number} already exists in this company.` });
  }
  return db.$transaction(async (tx) => {
    const vlan = await tx.vlan.create({ data: { ...input, createdById: scope.audit.actorUserId ?? null } });
    await recordAudit(
      { ...scope.audit, companyId: input.companyId },
      { module: MODULE, eventType: "vlan.created", action: `Added ${vlanLabel(vlan)}`, targetType: "vlan", targetId: vlan.id, targetLabel: vlanLabel(vlan) },
      tx,
    );
    return vlan;
  });
}

export async function updateVlan(scope: Scope, id: string, input: VlanInput) {
  const existing = await db.vlan.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError("VLAN not found.");
  assertCompanyAccess(scope, existing.companyId);
  if (existing.companyId !== input.companyId) throw new BusinessRuleError("VLANs cannot be moved between companies.");
  if (input.number !== existing.number) {
    const clash = await db.vlan.findUnique({ where: { companyId_number: { companyId: input.companyId, number: input.number } } });
    if (clash) throw new ValidationError(undefined, { number: `VLAN ${input.number} already exists in this company.` });
  }
  return db.$transaction(async (tx) => {
    const vlan = await tx.vlan.update({ where: { id }, data: { ...input, updatedById: scope.audit.actorUserId ?? null } });
    const fieldChanges = diffRecords(existing, vlan, ["number", "name", "purpose", "status", "notes"]);
    if (fieldChanges.length > 0) {
      await recordAudit(
        { ...scope.audit, companyId: vlan.companyId },
        { module: MODULE, eventType: "vlan.updated", action: `Updated ${vlanLabel(vlan)}`, targetType: "vlan", targetId: id, targetLabel: vlanLabel(vlan), fieldChanges },
        tx,
      );
    }
    return vlan;
  });
}

/** Its subnets stay, without a VLAN. */
export async function deleteVlan(scope: Scope, id: string) {
  const existing = await db.vlan.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError("VLAN not found.");
  assertCompanyAccess(scope, existing.companyId);
  await db.$transaction(async (tx) => {
    await tx.vlan.delete({ where: { id } });
    await recordAudit(
      { ...scope.audit, companyId: existing.companyId },
      { module: MODULE, eventType: "vlan.deleted", action: `Deleted ${vlanLabel(existing)}`, targetType: "vlan", targetId: id, targetLabel: vlanLabel(existing) },
      tx,
    );
  });
}

// ---------------------------------------------------------------------------
// Subnets
// ---------------------------------------------------------------------------

async function checkSubnet(scope: Scope, input: SubnetInput, id?: string) {
  await assertCompany(scope, input.companyId);
  const parsed = parseCidr(input.cidr);
  if (!parsed.ok) throw new ValidationError(undefined, { cidr: parsed.error });
  const cidr = parsed.cidr;
  const clash = await db.subnet.findUnique({
    where: { companyId_network_prefix: { companyId: input.companyId, network: cidr.network, prefix: cidr.prefix } },
  });
  if (clash && clash.id !== id) throw new ValidationError(undefined, { cidr: `${cidrText(cidr)} is already recorded for this company.` });
  if (input.gateway) {
    const gateway = ipToNumber(input.gateway)!;
    if (!contains(cidr, gateway)) throw new ValidationError(undefined, { gateway: `The gateway must be inside ${cidrText(cidr)}.` });
  }
  if (input.vlanId) {
    const vlan = await db.vlan.findFirst({ where: { id: input.vlanId, companyId: input.companyId } });
    if (!vlan) throw new ValidationError(undefined, { vlanId: "Choose a VLAN of this company." });
  }
  if (input.locationId) {
    const location = await db.location.findFirst({ where: { id: input.locationId, companyId: input.companyId, deletedAt: null } });
    if (!location) throw new ValidationError(undefined, { locationId: "Choose a location of this company." });
  }
  return cidr;
}

function subnetData(input: SubnetInput, cidr: Cidr) {
  return {
    vlanId: input.vlanId,
    network: cidr.network,
    prefix: cidr.prefix,
    rangeStart: BigInt(cidr.start),
    rangeEnd: BigInt(cidr.end),
    gateway: input.gateway,
    dhcpRelay: input.dhcpRelay,
    locationId: input.locationId,
    purpose: input.purpose,
    status: input.status,
    notes: input.notes,
  };
}

export async function createSubnet(scope: Scope, input: SubnetInput) {
  const cidr = await checkSubnet(scope, input);
  return db.$transaction(async (tx) => {
    const subnet = await tx.subnet.create({
      data: { ...subnetData(input, cidr), companyId: input.companyId, createdById: scope.audit.actorUserId ?? null },
    });
    await recordAudit(
      { ...scope.audit, companyId: input.companyId },
      { module: MODULE, eventType: "subnet.created", action: `Added subnet ${cidrText(subnet)}`, targetType: "subnet", targetId: subnet.id, targetLabel: cidrText(subnet) },
      tx,
    );
    return subnet;
  });
}

export async function updateSubnet(scope: Scope, id: string, input: SubnetInput) {
  const existing = await db.subnet.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError("Subnet not found.");
  assertCompanyAccess(scope, existing.companyId);
  if (existing.companyId !== input.companyId) throw new BusinessRuleError("Subnets cannot be moved between companies.");
  const cidr = await checkSubnet(scope, input, id);
  return db.$transaction(async (tx) => {
    const subnet = await tx.subnet.update({ where: { id }, data: { ...subnetData(input, cidr), updatedById: scope.audit.actorUserId ?? null } });
    const readable = (s: typeof existing) => ({ ...s, cidr: cidrText(s) });
    const fieldChanges = diffRecords(readable(existing), readable(subnet), ["cidr", "vlanId", "gateway", "dhcpRelay", "locationId", "purpose", "status", "notes"]);
    if (fieldChanges.length > 0) {
      await recordAudit(
        { ...scope.audit, companyId: subnet.companyId },
        { module: MODULE, eventType: "subnet.updated", action: `Updated subnet ${cidrText(subnet)}`, targetType: "subnet", targetId: id, targetLabel: cidrText(subnet), fieldChanges },
        tx,
      );
    }
    return subnet;
  });
}

/** The addresses recorded inside it stay: they belong to the company, not the subnet. */
export async function deleteSubnet(scope: Scope, id: string) {
  const existing = await db.subnet.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError("Subnet not found.");
  assertCompanyAccess(scope, existing.companyId);
  await db.$transaction(async (tx) => {
    await tx.subnet.delete({ where: { id } });
    await recordAudit(
      { ...scope.audit, companyId: existing.companyId },
      { module: MODULE, eventType: "subnet.deleted", action: `Deleted subnet ${cidrText(existing)}`, targetType: "subnet", targetId: id, targetLabel: cidrText(existing) },
      tx,
    );
  });
}

// ---------------------------------------------------------------------------
// Addresses
// ---------------------------------------------------------------------------

export async function saveIpAddress(scope: Scope, input: IpAddressInput, id?: string) {
  await assertCompany(scope, input.companyId);
  const existing = id ? await db.ipAddress.findUnique({ where: { id } }) : null;
  if (id && !existing) throw new NotFoundError("Address not found.");
  if (existing && existing.companyId !== input.companyId) throw new BusinessRuleError("Addresses cannot be moved between companies.");
  const clash = await db.ipAddress.findUnique({ where: { companyId_address: { companyId: input.companyId, address: input.address } } });
  if (clash && clash.id !== id) {
    throw new ValidationError(undefined, { address: `${input.address} is already recorded${clash.hostname ? ` for ${clash.hostname}` : ""}.` });
  }
  if (input.deviceId) {
    const device = await db.infraDevice.findFirst({ where: { id: input.deviceId, companyId: input.companyId, deletedAt: null } });
    if (!device) throw new ValidationError(undefined, { deviceId: "Choose a device of this company." });
  }
  const mac = input.macAddress ? normalizeMac(input.macAddress) : null;
  if (input.macAddress && !mac) throw new ValidationError(undefined, { macAddress: "Enter a MAC address, e.g. 00:1a:2b:3c:4d:5e." });
  const data = {
    address: input.address,
    addressNum: BigInt(ipToNumber(input.address)!),
    status: input.status,
    hostname: input.hostname,
    macAddress: mac,
    deviceId: input.deviceId,
    description: input.description,
  };
  return db.$transaction(async (tx) => {
    const record = existing
      ? await tx.ipAddress.update({ where: { id: existing.id }, data: { ...data, updatedById: scope.audit.actorUserId ?? null } })
      : await tx.ipAddress.create({ data: { ...data, companyId: input.companyId, createdById: scope.audit.actorUserId ?? null } });
    const fieldChanges = existing ? diffRecords(existing, record, ["address", "status", "hostname", "macAddress", "deviceId", "description"]) : [];
    if (!existing || fieldChanges.length > 0) {
      await recordAudit(
        { ...scope.audit, companyId: input.companyId },
        {
          module: MODULE,
          eventType: existing ? "ip.updated" : "ip.created",
          action: `${existing ? "Updated" : record.status === "RESERVED" ? "Reserved" : "Recorded"} ${record.address}${record.hostname ? ` (${record.hostname})` : ""}`,
          targetType: "ip_address",
          targetId: record.id,
          targetLabel: record.address,
          fieldChanges,
        },
        tx,
      );
    }
    return record;
  });
}

export async function deleteIpAddress(scope: Scope, id: string) {
  const existing = await db.ipAddress.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError("Address not found.");
  assertCompanyAccess(scope, existing.companyId);
  await db.$transaction(async (tx) => {
    await tx.ipAddress.delete({ where: { id } });
    await recordAudit(
      { ...scope.audit, companyId: existing.companyId },
      { module: MODULE, eventType: "ip.deleted", action: `Released ${existing.address}`, targetType: "ip_address", targetId: id, targetLabel: existing.address },
      tx,
    );
  });
}

// ---------------------------------------------------------------------------
// Reading the plan
// ---------------------------------------------------------------------------

export interface SubnetSummary {
  id: string;
  companyId: string;
  cidr: string;
  network: string;
  prefix: number;
  gateway: string | null;
  dhcpRelay: string | null;
  status: string;
  purpose: string | null;
  overlapsWith: string[];
}

/** Every VLAN and subnet in scope, and which subnets overlap. */
export async function loadPlan(scope: Scope, companyId?: string) {
  const where = { ...companyFilter(scope), ...(companyId && scope.isGlobalAdmin ? { companyId } : {}) };
  const [vlans, subnets] = await Promise.all([
    db.vlan.findMany({ where, orderBy: [{ companyId: "asc" }, { number: "asc" }], include: { company: { select: { name: true } } } }),
    db.subnet.findMany({ where, orderBy: [{ rangeStart: "asc" }, { prefix: "asc" }], include: { company: { select: { name: true } } } }),
  ]);

  const summaries = new Map<string, SubnetSummary>();
  const ranges = subnets.map((s) => ({ s, start: Number(s.rangeStart), end: Number(s.rangeEnd) }));
  for (const { s } of ranges) {
    summaries.set(s.id, {
      id: s.id,
      companyId: s.companyId,
      cidr: cidrText(s),
      network: s.network,
      prefix: s.prefix,
      gateway: s.gateway,
      dhcpRelay: s.dhcpRelay,
      status: s.status,
      purpose: s.purpose,
      overlapsWith: [],
    });
  }
  // Sorted by start, so only ranges that begin before this one ends can overlap it.
  for (let i = 0; i < ranges.length; i += 1) {
    for (let j = i + 1; j < ranges.length && ranges[j]!.start <= ranges[i]!.end; j += 1) {
      const a = ranges[i]!;
      const b = ranges[j]!;
      if (a.s.companyId !== b.s.companyId || !overlaps(a, b)) continue;
      summaries.get(a.s.id)!.overlapsWith.push(cidrText(b.s));
      summaries.get(b.s.id)!.overlapsWith.push(cidrText(a.s));
    }
  }

  const byVlan = new Map<string, SubnetSummary[]>();
  const loose: (SubnetSummary & { companyName: string })[] = [];
  for (const s of subnets) {
    const summary = summaries.get(s.id)!;
    if (s.vlanId) byVlan.set(s.vlanId, [...(byVlan.get(s.vlanId) ?? []), summary]);
    else loose.push({ ...summary, companyName: s.company.name });
  }
  return {
    vlans: vlans.map((v) => ({
      id: v.id,
      companyId: v.companyId,
      companyName: v.company.name,
      number: v.number,
      name: v.name,
      purpose: v.purpose,
      status: v.status,
      notes: v.notes,
      subnets: byVlan.get(v.id) ?? [],
    })),
    looseSubnets: loose,
    counts: {
      vlans: vlans.length,
      subnets: subnets.length,
      overlapping: [...summaries.values()].filter((s) => s.overlapsWith.length > 0).length,
    },
  };
}

/** One subnet: its facts, every address recorded in it and the devices in it. */
export async function loadSubnet(scope: Scope, id: string) {
  const subnet = await db.subnet.findUnique({
    where: { id },
    include: { vlan: true, company: { select: { name: true } }, location: { select: { name: true } } },
  });
  if (!subnet) throw new NotFoundError("Subnet not found.");
  assertCompanyAccess(scope, subnet.companyId);
  const range = { gte: subnet.rangeStart, lte: subnet.rangeEnd };
  const [addresses, devices, overlapping] = await Promise.all([
    db.ipAddress.findMany({
      where: { companyId: subnet.companyId, addressNum: range },
      orderBy: { addressNum: "asc" },
      include: { device: { select: { id: true, name: true, deletedAt: true } } },
    }),
    db.infraDevice.findMany({
      where: { companyId: subnet.companyId, deletedAt: null, ipAddress: { not: null } },
      select: { id: true, name: true, ipAddress: true, kind: true, status: true },
    }),
    db.subnet.findMany({
      where: { companyId: subnet.companyId, id: { not: id }, rangeStart: { lte: subnet.rangeEnd }, rangeEnd: { gte: subnet.rangeStart } },
      select: { id: true, network: true, prefix: true, vlan: { select: { number: true, name: true } } },
    }),
  ]);
  const cidr = cidrFromParts(subnet.network, subnet.prefix);
  const inside = devices.filter((d) => {
    const n = ipToNumber(d.ipAddress!);
    return n !== null && contains(cidr, n);
  });
  return {
    subnet,
    facts: subnetFacts(subnet.network, subnet.prefix),
    addresses: addresses.map((a) => ({ ...a, addressNum: Number(a.addressNum) })),
    devices: inside,
    overlapping,
  };
}

/** Where an address lives: the subnets holding it, its record, and devices using it. */
export async function lookupIp(scope: Scope, address: string) {
  const n = ipToNumber(address);
  if (n === null) return null;
  const where = companyFilter(scope);
  const [subnets, records, devices] = await Promise.all([
    db.subnet.findMany({
      where: { ...where, rangeStart: { lte: BigInt(n) }, rangeEnd: { gte: BigInt(n) } },
      orderBy: { prefix: "desc" },
      include: { vlan: { select: { number: true, name: true } }, company: { select: { name: true } } },
    }),
    db.ipAddress.findMany({ where: { ...where, address }, include: { device: { select: { id: true, name: true } }, company: { select: { name: true } } } }),
    db.infraDevice.findMany({ where: { ...where, deletedAt: null, ipAddress: address }, select: { id: true, name: true } }),
  ]);
  return { address, subnets, records, devices };
}

/** The most specific subnet of the device's company that holds its address, for the device page. */
export async function subnetForAddress(companyId: string, address: string | null) {
  const n = address ? ipToNumber(address) : null;
  if (n === null) return null;
  return db.subnet.findFirst({
    where: { companyId, rangeStart: { lte: BigInt(n) }, rangeEnd: { gte: BigInt(n) } },
    orderBy: { prefix: "desc" },
    select: { id: true, network: true, prefix: true, vlan: { select: { number: true, name: true } } },
  });
}

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

export interface IpamImportPreview {
  plan: null | {
    sheet: string;
    rows: number;
    vlansNew: number;
    vlansSame: number;
    vlansRenamed: { company: string; number: number; from: string; to: string }[];
    subnetsNew: number;
    subnetsSame: number;
    subnetsChanged: { company: string; cidr: string; change: string }[];
    problems: { row: number; error: string }[];
    unmatched: { text: string; rows: number }[];
  };
  addresses: null | {
    sheet: string;
    rows: number;
    new: number;
    updated: number;
    noSubnet: number;
    devicesLinked: number;
  };
}

interface Analysis {
  preview: IpamImportPreview;
  planRows: (PlanRow & { companyId: string })[];
  addressRows: (AddressRow & { companyId: string })[];
}

async function analyse(scope: Scope, file: File): Promise<Analysis> {
  const sheets = await readSheets(file);
  const planSheet = pickPlanSheet(sheets);
  const addressSheet = pickAddressSheet(sheets);
  if (!planSheet && !addressSheet) {
    throw new ValidationError(undefined, {
      file: "No sheet has a VLAN column with a name or subnet, or an IP column. Use the discovery workbooks, or headings like VLAN, Name, Subnet, Gateway.",
    });
  }
  const total = (planSheet?.rows.length ?? 0) + (addressSheet?.rows.length ?? 0);
  if (total > MAX_ROWS) throw new ValidationError(undefined, { file: `Import at most ${MAX_ROWS} rows at a time.` });

  const companies = await db.company.findMany({
    where: { deletedAt: null, isActive: true, ...(scope.isGlobalAdmin ? {} : { id: scope.companyId }) },
    select: { id: true, name: true },
  });
  const companyName = new Map(companies.map((c) => [c.id, c.name]));
  const resolveCompany = (text: string) => (text ? suggestCompany(text, companies) : companies.length === 1 ? companies[0]!.id : null);

  const preview: IpamImportPreview = { plan: null, addresses: null };
  const planRows: Analysis["planRows"] = [];
  // Subnets as they will be after the plan part: existing plus new ones.
  const subnetRanges: { companyId: string; start: number; end: number; prefix: number }[] = (
    await db.subnet.findMany({ where: companyFilter(scope), select: { companyId: true, rangeStart: true, rangeEnd: true, prefix: true } })
  ).map((s) => ({ companyId: s.companyId, start: Number(s.rangeStart), end: Number(s.rangeEnd), prefix: s.prefix }));

  if (planSheet) {
    const problems: { row: number; error: string }[] = [];
    const unmatched = new Map<string, number>();
    const seen = new Set<string>();
    const seenSubnets = new Map<string, number>();
    for (const entry of planSheet.rows) {
      const parsed = parsePlanRow(planSheet, entry);
      if (!parsed.ok) {
        problems.push({ row: parsed.row, error: parsed.error });
        continue;
      }
      const companyId = resolveCompany(parsed.row.companyText);
      if (!companyId) {
        const key = parsed.row.companyText || "(no company)";
        unmatched.set(key, (unmatched.get(key) ?? 0) + 1);
        continue;
      }
      const key = `${companyId}|${parsed.row.number}`;
      if (seen.has(key)) {
        problems.push({ row: parsed.row.row, error: `VLAN ${parsed.row.number} appears twice for ${companyName.get(companyId)}; the first row is used.` });
        continue;
      }
      seen.add(key);
      // A subnet listed under two VLANs: the first row keeps it, the others
      // still bring their VLAN in but leave the subnet to be sorted out.
      if (parsed.row.cidr) {
        const subnetKey = `${companyId}|${cidrText(parsed.row.cidr)}`;
        const first = seenSubnets.get(subnetKey);
        if (first !== undefined) {
          problems.push({
            row: parsed.row.row,
            error: `${cidrText(parsed.row.cidr)} is also listed under VLAN ${first}; it stays with VLAN ${first}, and VLAN ${parsed.row.number} is added without it.`,
          });
          parsed.row.cidr = null;
        } else {
          seenSubnets.set(subnetKey, parsed.row.number);
        }
      }
      planRows.push({ ...parsed.row, companyId });
    }

    const companyIds = [...new Set(planRows.map((r) => r.companyId))];
    const [vlans, subnets] = await Promise.all([
      db.vlan.findMany({ where: { companyId: { in: companyIds } } }),
      db.subnet.findMany({ where: { companyId: { in: companyIds } }, include: { vlan: { select: { number: true } } } }),
    ]);
    const vlanByKey = new Map(vlans.map((v) => [`${v.companyId}|${v.number}`, v]));
    const subnetByKey = new Map(subnets.map((s) => [`${s.companyId}|${cidrText(s)}`, s]));
    let vlansNew = 0;
    let vlansSame = 0;
    let subnetsNew = 0;
    let subnetsSame = 0;
    const vlansRenamed: NonNullable<IpamImportPreview["plan"]>["vlansRenamed"] = [];
    const subnetsChanged: NonNullable<IpamImportPreview["plan"]>["subnetsChanged"] = [];
    for (const row of planRows) {
      const vlan = vlanByKey.get(`${row.companyId}|${row.number}`);
      if (!vlan) vlansNew += 1;
      else if (vlan.name !== row.name) vlansRenamed.push({ company: companyName.get(row.companyId)!, number: row.number, from: vlan.name, to: row.name });
      else vlansSame += 1;
      if (!row.cidr) continue;
      const subnet = subnetByKey.get(`${row.companyId}|${cidrText(row.cidr)}`);
      if (!subnet) {
        subnetsNew += 1;
        subnetRanges.push({ companyId: row.companyId, start: row.cidr.start, end: row.cidr.end, prefix: row.cidr.prefix });
        continue;
      }
      const changes = [
        subnet.vlan?.number !== row.number ? `VLAN ${subnet.vlan?.number ?? "none"} → ${row.number}` : null,
        row.gateway && subnet.gateway !== row.gateway ? `gateway ${subnet.gateway ?? "none"} → ${row.gateway}` : null,
        row.dhcpRelay && subnet.dhcpRelay !== row.dhcpRelay ? `DHCP relay ${subnet.dhcpRelay ?? "none"} → ${row.dhcpRelay}` : null,
      ].filter(Boolean);
      if (changes.length > 0) subnetsChanged.push({ company: companyName.get(row.companyId)!, cidr: cidrText(row.cidr), change: changes.join(", ") });
      else subnetsSame += 1;
    }
    preview.plan = {
      sheet: planSheet.name,
      rows: planSheet.rows.length,
      vlansNew,
      vlansSame,
      vlansRenamed,
      subnetsNew,
      subnetsSame,
      subnetsChanged,
      problems,
      unmatched: [...unmatched].map(([text, rows]) => ({ text, rows })),
    };
  }

  const addressRows: Analysis["addressRows"] = [];
  if (addressSheet) {
    // The most specific subnet first decides the company an address belongs to.
    subnetRanges.sort((a, b) => b.prefix - a.prefix);
    let noSubnet = 0;
    const seen = new Set<string>();
    for (const entry of addressSheet.rows) {
      const row = parseAddressRow(addressSheet, entry);
      if (!row) continue;
      const holder = subnetRanges.find((r) => contains(r, row.addressNum));
      const companyId = holder?.companyId ?? null;
      if (!companyId) {
        noSubnet += 1;
        continue;
      }
      const key = `${companyId}|${row.address}`;
      if (seen.has(key)) continue;
      seen.add(key);
      addressRows.push({ ...row, companyId });
    }
    const companyIds = [...new Set(addressRows.map((r) => r.companyId))];
    const [existing, devices] = await Promise.all([
      db.ipAddress.findMany({ where: { companyId: { in: companyIds } }, select: { companyId: true, address: true } }),
      db.infraDevice.findMany({ where: { companyId: { in: companyIds }, deletedAt: null, ipAddress: { not: null } }, select: { companyId: true, ipAddress: true } }),
    ]);
    const known = new Set(existing.map((a) => `${a.companyId}|${a.address}`));
    const deviceIps = new Set(devices.map((d) => `${d.companyId}|${d.ipAddress}`));
    const updated = addressRows.filter((r) => known.has(`${r.companyId}|${r.address}`)).length;
    preview.addresses = {
      sheet: addressSheet.name,
      rows: addressSheet.rows.length,
      new: addressRows.length - updated,
      updated,
      noSubnet,
      devicesLinked: addressRows.filter((r) => deviceIps.has(`${r.companyId}|${r.address}`)).length,
    };
  }
  return { preview, planRows, addressRows };
}

export async function previewIpamImport(scope: Scope, file: File): Promise<IpamImportPreview> {
  return (await analyse(scope, file)).preview;
}

export interface IpamImportResult {
  vlansCreated: number;
  vlansRenamed: number;
  subnetsCreated: number;
  subnetsUpdated: number;
  addressesCreated: number;
  addressesUpdated: number;
}

/**
 * Apply the import in one transaction. VLAN names, subnets, gateways and DHCP
 * relays follow the file; addresses take what discovery saw (name, MAC,
 * switch and port, last seen) but keep their status and description.
 */
export async function commitIpamImport(scope: Scope, file: File): Promise<IpamImportResult> {
  const { planRows, addressRows } = await analyse(scope, file);
  const actor = scope.audit.actorUserId ?? null;
  const now = new Date();
  const result: IpamImportResult = { vlansCreated: 0, vlansRenamed: 0, subnetsCreated: 0, subnetsUpdated: 0, addressesCreated: 0, addressesUpdated: 0 };

  await db.$transaction(
    async (tx) => {
      const companyIds = [...new Set([...planRows, ...addressRows].map((r) => r.companyId))];
      const vlans = await tx.vlan.findMany({ where: { companyId: { in: companyIds } } });
      const vlanByKey = new Map(vlans.map((v) => [`${v.companyId}|${v.number}`, v]));
      for (const row of planRows) {
        const key = `${row.companyId}|${row.number}`;
        const vlan = vlanByKey.get(key);
        if (!vlan) {
          const created = await tx.vlan.create({
            data: { companyId: row.companyId, number: row.number, name: row.name, purpose: row.purpose, status: row.status, notes: row.notes, createdById: actor },
          });
          vlanByKey.set(key, created);
          result.vlansCreated += 1;
        } else if (vlan.name !== row.name || vlan.status !== row.status) {
          vlanByKey.set(key, await tx.vlan.update({ where: { id: vlan.id }, data: { name: row.name, status: row.status, updatedById: actor } }));
          result.vlansRenamed += 1;
        }
      }

      const subnets = await tx.subnet.findMany({ where: { companyId: { in: companyIds } } });
      const subnetByKey = new Map(subnets.map((s) => [`${s.companyId}|${cidrText(s)}`, s]));
      for (const row of planRows) {
        if (!row.cidr) continue;
        const vlanId = vlanByKey.get(`${row.companyId}|${row.number}`)!.id;
        const subnet = subnetByKey.get(`${row.companyId}|${cidrText(row.cidr)}`);
        if (!subnet) {
          await tx.subnet.create({
            data: {
              companyId: row.companyId,
              vlanId,
              network: row.cidr.network,
              prefix: row.cidr.prefix,
              rangeStart: BigInt(row.cidr.start),
              rangeEnd: BigInt(row.cidr.end),
              gateway: row.gateway,
              dhcpRelay: row.dhcpRelay,
              status: row.status,
              source: "DISCOVERY",
              createdById: actor,
            },
          });
          result.subnetsCreated += 1;
        } else if (subnet.vlanId !== vlanId || (row.gateway && subnet.gateway !== row.gateway) || (row.dhcpRelay && subnet.dhcpRelay !== row.dhcpRelay)) {
          await tx.subnet.update({
            where: { id: subnet.id },
            data: { vlanId, gateway: row.gateway ?? subnet.gateway, dhcpRelay: row.dhcpRelay ?? subnet.dhcpRelay, updatedById: actor },
          });
          result.subnetsUpdated += 1;
        }
      }

      if (addressRows.length > 0) {
        const [existing, devices] = await Promise.all([
          tx.ipAddress.findMany({ where: { companyId: { in: companyIds } } }),
          tx.infraDevice.findMany({ where: { companyId: { in: companyIds }, deletedAt: null, ipAddress: { not: null } }, select: { id: true, companyId: true, ipAddress: true } }),
        ]);
        const byKey = new Map(existing.map((a) => [`${a.companyId}|${a.address}`, a]));
        const deviceByIp = new Map(devices.map((d) => [`${d.companyId}|${d.ipAddress}`, d.id]));
        const create = [];
        for (const row of addressRows) {
          const key = `${row.companyId}|${row.address}`;
          const record = byKey.get(key);
          const facts = {
            hostname: row.hostname,
            macAddress: row.mac,
            macVendor: row.vendor,
            switchName: row.switchName,
            switchPort: row.switchPort,
            lastSeenAt: now,
          };
          if (!record) {
            create.push({
              companyId: row.companyId,
              address: row.address,
              addressNum: BigInt(row.addressNum),
              status: row.reserved ? ("RESERVED" as const) : ("USED" as const),
              description: row.description,
              deviceId: deviceByIp.get(key) ?? null,
              source: "DISCOVERY" as const,
              createdById: actor,
              ...facts,
            });
            continue;
          }
          await tx.ipAddress.update({
            where: { id: record.id },
            data: {
              ...facts,
              hostname: row.hostname ?? record.hostname,
              macAddress: row.mac ?? record.macAddress,
              macVendor: row.vendor ?? record.macVendor,
              description: record.description ?? row.description,
              deviceId: record.deviceId ?? deviceByIp.get(key) ?? null,
            },
          });
          result.addressesUpdated += 1;
        }
        if (create.length > 0) await tx.ipAddress.createMany({ data: create });
        result.addressesCreated = create.length;
      }

      await recordAudit(
        scope.audit,
        {
          module: MODULE,
          eventType: "ipam.imported",
          action: `Imported "${file.name}": ${result.vlansCreated} VLANs added, ${result.vlansRenamed} renamed, ${result.subnetsCreated} subnets added, ${result.subnetsUpdated} updated, ${result.addressesCreated} addresses added, ${result.addressesUpdated} updated`,
          targetType: "ipam",
        },
        tx,
      );
    },
    { timeout: 180_000 },
  );
  return result;
}

// ---------------------------------------------------------------------------
// ARP reading
// ---------------------------------------------------------------------------

/**
 * The switch that routes a subnet: the one chosen on the subnet, else the
 * network device whose saved configuration has an interface address inside
 * it (its gateway), the closest prefix first.
 */
export async function routingSwitch(subnet: { companyId: string; rangeStart: bigint; rangeEnd: bigint; prefix: number; arpDeviceId: string | null }) {
  if (subnet.arpDeviceId) {
    const chosen = await db.infraDevice.findFirst({ where: { id: subnet.arpDeviceId, deletedAt: null }, select: { id: true, name: true } });
    if (chosen) return { ...chosen, how: "chosen" as const };
  }
  const devices = await db.infraDevice.findMany({
    where: { companyId: subnet.companyId, kind: "NETWORK", deletedAt: null, routedNetworks: { not: Prisma.DbNull } },
    select: { id: true, name: true, routedNetworks: true },
  });
  const start = Number(subnet.rangeStart);
  const end = Number(subnet.rangeEnd);
  let best: { id: string; name: string; distance: number } | null = null;
  for (const device of devices) {
    for (const net of (device.routedNetworks as { address: string; prefix: number }[] | null) ?? []) {
      const n = ipToNumber(net.address);
      if (n === null || n < start || n > end) continue;
      const distance = Math.abs(net.prefix - subnet.prefix);
      if (!best || distance < best.distance) best = { id: device.id, name: device.name, distance };
    }
  }
  return best ? { id: best.id, name: best.name, how: "config" as const } : null;
}

export async function setArpScan(scope: Scope, subnetId: string, input: { enabled: boolean; deviceId: string | null }) {
  const subnet = await db.subnet.findUnique({ where: { id: subnetId } });
  if (!subnet) throw new NotFoundError("Subnet not found.");
  assertCompanyAccess(scope, subnet.companyId);
  if (input.deviceId) {
    const device = await db.infraDevice.findFirst({ where: { id: input.deviceId, companyId: subnet.companyId, kind: "NETWORK", deletedAt: null } });
    if (!device) throw new ValidationError(undefined, { deviceId: "Choose a network device of this company." });
  }
  if (subnet.arpScan === input.enabled && subnet.arpDeviceId === input.deviceId) return;
  await db.$transaction(async (tx) => {
    await tx.subnet.update({ where: { id: subnetId }, data: { arpScan: input.enabled, arpDeviceId: input.deviceId, updatedById: scope.audit.actorUserId ?? null } });
    await recordAudit(
      { ...scope.audit, companyId: subnet.companyId },
      {
        module: MODULE,
        eventType: "subnet.arp_changed",
        action: `${input.enabled ? "Turned on" : "Turned off"} the nightly ARP read of ${cidrText(subnet)}`,
        targetType: "subnet",
        targetId: subnetId,
        targetLabel: cidrText(subnet),
      },
      tx,
    );
  });
}

/** Ask the worker to read this subnet's ARP table now. */
export async function requestArpScan(scope: Scope, subnetId: string) {
  const subnet = await db.subnet.findUnique({ where: { id: subnetId } });
  if (!subnet) throw new NotFoundError("Subnet not found.");
  assertCompanyAccess(scope, subnet.companyId);
  if (!(await routingSwitch(subnet))) {
    throw new BusinessRuleError("No switch is known to route this subnet yet. Choose one, or back up the core switch first.");
  }
  await enqueueConfigBackup({ trigger: "MANUAL", arpSubnetIds: [subnetId], actorUserId: scope.audit.actorUserId ?? null, actorLabel: scope.audit.actorLabel });
}
