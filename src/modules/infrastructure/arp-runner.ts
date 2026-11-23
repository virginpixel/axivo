import { db } from "@/shared/db";
import { decryptSecret } from "@/shared/crypto/encryption";
import { recordAudit, SYSTEM_ACTOR, type AuditContext } from "@/shared/audit/audit";
import { collectArp, type CollectInput, type CollectResult } from "./config-ssh";
import { pickLogins, tryLogins } from "./config-runner";
import { parseArp } from "./arp-parse";
import { ipToNumber } from "./ip-math";
import { routingSwitch } from "./ipam";

/**
 * Reading subnets' ARP tables (SDS Doc 24, IP & VLAN plan). Worker-only.
 *
 * For each subnet it asks the switch that routes it for its ARP table, with
 * the same read-only login as the configuration backup: nothing is sent to
 * the devices themselves. Each address found is recorded, or its MAC and
 * "last seen" refreshed. Nothing is ever removed: an address not seen for a
 * while is shown faded, since a PC switched off at night is still in use.
 */

const MODULE = "infrastructure";

export type ArpCollector = (input: CollectInput) => Promise<CollectResult>;

const cidr = (s: { network: string; prefix: number }) => `${s.network}/${s.prefix}`;

/** Read the subnets given, or every subnet with the nightly read on. */
export async function runArpScan(
  options: { subnetIds?: string[]; actorUserId?: string | null; actorLabel?: string },
  collect: ArpCollector = collectArp,
) {
  const actor: AuditContext = options.actorUserId
    ? { actorUserId: options.actorUserId, actorLabel: options.actorLabel ?? "user" }
    : { ...SYSTEM_ACTOR, actorLabel: "ARP read" };
  const subnets = await db.subnet.findMany({
    where: options.subnetIds ? { id: { in: options.subnetIds } } : { arpScan: true },
    orderBy: { rangeStart: "asc" },
  });

  // One login per switch, however many of its subnets are read.
  const bySwitch = new Map<string, typeof subnets>();
  for (const subnet of subnets) {
    const device = await routingSwitch(subnet);
    if (!device) {
      await db.subnet.update({
        where: { id: subnet.id },
        data: { arpCheckedAt: new Date(), arpStatus: "SKIPPED", arpMessage: "No switch is known to route this subnet. Choose one on this page." },
      });
      continue;
    }
    bySwitch.set(device.id, [...(bySwitch.get(device.id) ?? []), subnet]);
  }

  const totals = { subnets: 0, found: 0, added: 0, failed: 0 };
  for (const [deviceId, group] of bySwitch) {
    const device = await db.infraDevice.findUniqueOrThrow({
      where: { id: deviceId },
      include: {
        manufacturer: { select: { name: true } },
        credentials: { include: { credentialSet: { select: { name: true, username: true, secretCiphertext: true, deletedAt: true } } } },
      },
    });
    const fail = async (message: string) => {
      totals.failed += group.length;
      await db.subnet.updateMany({
        where: { id: { in: group.map((s) => s.id) } },
        data: { arpCheckedAt: new Date(), arpStatus: "FAILED", arpMessage: `${device.name}: ${message}`.slice(0, 500) },
      });
    };
    const { logins, enable } = pickLogins(device.credentials);
    if (!device.ipAddress) {
      await fail("no IP address recorded.");
      continue;
    }
    if (logins.length === 0) {
      await fail("no SSH login linked. Link one from the credential vault.");
      continue;
    }
    let entries;
    try {
      const host = device.ipAddress;
      const { result } = await tryLogins(logins, (login) =>
        collect({
          host,
          username: login.credentialSet.username!,
          password: decryptSecret(login.credentialSet.secretCiphertext!),
          enablePassword: enable ? decryptSecret(enable.credentialSet.secretCiphertext!) : null,
          manufacturer: device.manufacturer?.name ?? null,
        }),
      );
      entries = parseArp(result.outputs.arp ?? "");
    } catch (error) {
      await fail((error as Error).message);
      continue;
    }

    const now = new Date();
    for (const subnet of group) {
      const start = Number(subnet.rangeStart);
      const end = Number(subnet.rangeEnd);
      const inside = entries
        .map((e) => ({ ...e, n: ipToNumber(e.address)! }))
        .filter((e) => e.n >= start && e.n <= end && e.address !== subnet.gateway);
      let added = 0;
      await db.$transaction(
        async (tx) => {
          const existing = await tx.ipAddress.findMany({
            where: { companyId: subnet.companyId, addressNum: { gte: subnet.rangeStart, lte: subnet.rangeEnd } },
            select: { id: true, address: true },
          });
          const known = new Map(existing.map((a) => [a.address, a.id]));
          const fresh = inside.filter((e) => !known.has(e.address));
          if (fresh.length > 0) {
            await tx.ipAddress.createMany({
              data: fresh.map((e) => ({
                companyId: subnet.companyId,
                address: e.address,
                addressNum: BigInt(e.n),
                status: "USED" as const,
                macAddress: e.mac,
                source: "DISCOVERY" as const,
                lastSeenAt: now,
              })),
              skipDuplicates: true,
            });
          }
          added = fresh.length;
          for (const e of inside) {
            const id = known.get(e.address);
            if (id) await tx.ipAddress.update({ where: { id }, data: { macAddress: e.mac, lastSeenAt: now } });
          }
          const message = `Read from ${device.name}: ${inside.length} address${inside.length === 1 ? "" : "es"}, ${added} new.`;
          await tx.subnet.update({ where: { id: subnet.id }, data: { arpCheckedAt: now, arpStatus: "OK", arpMessage: message } });
          if (options.subnetIds || added > 0) {
            await recordAudit(
              { ...actor, companyId: subnet.companyId },
              { module: MODULE, eventType: "subnet.arp_read", action: `ARP read of ${cidr(subnet)}: ${message}`, targetType: "subnet", targetId: subnet.id, targetLabel: cidr(subnet) },
              tx,
            );
          }
        },
        { timeout: 60_000 },
      );
      totals.subnets += 1;
      totals.found += inside.length;
      totals.added += added;
    }
  }
  return totals;
}
