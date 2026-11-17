import type { Prisma } from "@prisma/client";
import { db } from "@/shared/db";
import { decryptSecret, encryptSecret, sha256 } from "@/shared/crypto/encryption";
import { recordAudit, SYSTEM_ACTOR, type AuditContext } from "@/shared/audit/audit";
import type { ConfigBackupJobPayload } from "@/shared/queue/queue";
import { collectConfig, CollectError, type CollectInput, type CollectResult } from "./config-ssh";
import { comparable, diffCounts, looksLikeConfig, parseIdentity, type DeviceIdentity } from "./config-parse";
import { routedNetworks } from "./arp-parse";

/**
 * The configuration backup pass (SDS Doc 24). Worker-only: it is the one
 * place that decrypts a stored login for a machine rather than a person.
 *
 * For each network device it logs in, reads the running configuration and
 * what the device says about itself, then:
 *  - saves a new version only when the configuration changed;
 *  - brings model, serial number and firmware in the register up to date;
 *  - fills the linked asset's model and serial if they are blank.
 * One bad device never stops the others; each one's result is kept on the
 * device so the backups page can say what went wrong.
 */

const MODULE = "infrastructure";
const CONCURRENCY = 6;

export type Collector = (input: CollectInput) => Promise<CollectResult>;

type Outcome = "unchanged" | "changed" | "failed" | "skipped";

interface Credential {
  purpose: string | null;
  credentialSet: { username: string | null; secretCiphertext: string | null; deletedAt: Date | null };
}

/** The SSH login, and the enable password if one is linked. */
export function pickLogins(credentials: Credential[]) {
  const live = credentials.filter((c) => !c.credentialSet.deletedAt && c.credentialSet.secretCiphertext);
  const enable = live.find((c) => /enable/i.test(c.purpose ?? ""));
  const logins = live.filter((c) => c.credentialSet.username && !/enable/i.test(c.purpose ?? ""));
  const login =
    logins.find((c) => /ssh/i.test(c.purpose ?? "")) ??
    logins.find((c) => !/web|ilo|idrac|snmp|os admin/i.test(c.purpose ?? ""));
  return { login, enable };
}

const IDENTITY_LABELS: Record<keyof DeviceIdentity, string> = {
  operatingSystem: "operatingSystem",
  model: "model",
  serialNumber: "serialNumber",
  version: "version",
};

async function backupOne(
  deviceId: string,
  trigger: ConfigBackupJobPayload["trigger"],
  actor: AuditContext,
  collect: Collector,
): Promise<Outcome> {
  const device = await db.infraDevice.findUnique({
    where: { id: deviceId },
    include: {
      manufacturer: { select: { name: true } },
      credentials: { include: { credentialSet: { select: { username: true, secretCiphertext: true, deletedAt: true } } } },
      asset: { select: { id: true, model: true, serialNumber: true, deletedAt: true } },
    },
  });
  if (!device || device.deletedAt) return "skipped";

  const record = (status: "OK" | "FAILED" | "SKIPPED", error: string | null) =>
    db.infraDevice.update({
      where: { id: device.id },
      data: { configCheckedAt: new Date(), configStatus: status, configError: error },
    });

  if (!device.ipAddress) {
    await record("SKIPPED", "No IP address recorded.");
    return "skipped";
  }
  const { login, enable } = pickLogins(device.credentials);
  if (!login) {
    await record("SKIPPED", "No SSH login linked. Link one from the credential vault.");
    return "skipped";
  }

  let result: CollectResult;
  try {
    result = await collect({
      host: device.ipAddress,
      username: login.credentialSet.username!,
      password: decryptSecret(login.credentialSet.secretCiphertext!),
      enablePassword: enable ? decryptSecret(enable.credentialSet.secretCiphertext!) : null,
      manufacturer: device.manufacturer?.name ?? null,
    });
  } catch (error) {
    const message = error instanceof CollectError ? error.message : `Failed: ${(error as Error).message}`;
    await record("FAILED", message.slice(0, 500));
    return "failed";
  }

  if (!looksLikeConfig(result.config)) {
    await record("FAILED", "The device did not print a configuration. The login may not have enough rights.");
    return "failed";
  }

  const companyActor = { ...actor, companyId: device.companyId };
  const identity = parseIdentity(result.family, result.outputs);
  const hash = sha256(comparable(result.config));
  const latest = await db.infraConfigBackup.findFirst({
    where: { deviceId: device.id },
    orderBy: { takenAt: "desc" },
  });
  const changed = !latest || latest.contentHash !== hash;

  await db.$transaction(async (tx) => {
    if (changed) {
      const previous = latest ? decryptSecret(latest.contentCiphertext) : "";
      const counts = latest ? diffCounts(comparable(previous), comparable(result.config)) : { added: 0, removed: 0 };
      await tx.infraConfigBackup.create({
        data: {
          deviceId: device.id,
          contentCiphertext: encryptSecret(result.config),
          contentHash: hash,
          lineCount: result.config.split("\n").length,
          linesAdded: counts.added,
          linesRemoved: counts.removed,
          firmware: identity.version,
          createdById: trigger === "MANUAL" ? (actor.actorUserId ?? null) : null,
        },
      });
      await recordAudit(
        companyActor,
        {
          module: MODULE,
          eventType: latest ? "config.changed" : "config.saved",
          action: latest
            ? `Configuration of "${device.name}" changed (${counts.added} line${counts.added === 1 ? "" : "s"} added, ${counts.removed} removed)`
            : `First configuration backup of "${device.name}"`,
          targetType: "infra_device",
          targetId: device.id,
          targetLabel: device.name,
        },
        tx,
      );
    }

    // What the device says about itself wins over what was typed in.
    const fieldChanges: { field: string; previousValue: string | null; newValue: string }[] = [];
    const data: Partial<Record<keyof DeviceIdentity, string>> = {};
    for (const key of Object.keys(IDENTITY_LABELS) as (keyof DeviceIdentity)[]) {
      const reported = identity[key];
      if (reported && reported !== device[key]) {
        data[key] = reported;
        fieldChanges.push({ field: IDENTITY_LABELS[key], previousValue: device[key], newValue: reported });
      }
    }
    await tx.infraDevice.update({
      where: { id: device.id },
      data: {
        ...data,
        configCheckedAt: new Date(),
        configStatus: "OK",
        configError: null,
        // The addresses it routes: tells the ARP reading which switch to ask for a subnet.
        routedNetworks: routedNetworks(result.config) as unknown as Prisma.InputJsonValue,
      },
    });
    if (fieldChanges.length > 0) {
      const serial = fieldChanges.find((change) => change.field === "serialNumber" && change.previousValue);
      await recordAudit(
        companyActor,
        {
          module: MODULE,
          eventType: "device.updated_from_device",
          action: serial
            ? `Serial number of "${device.name}" changed from ${serial.previousValue} to ${serial.newValue}: the hardware may have been replaced`
            : `Updated "${device.name}" from what the device reports`,
          targetType: "infra_device",
          targetId: device.id,
          targetLabel: device.name,
          fieldChanges,
        },
        tx,
      );
    }

    // The asset keeps what people typed; only blanks are filled in.
    const asset = device.asset && !device.asset.deletedAt ? device.asset : null;
    if (asset) {
      const fill: { model?: string; serialNumber?: string } = {};
      if (!asset.model && identity.model) fill.model = identity.model;
      if (!asset.serialNumber && identity.serialNumber) {
        const taken = await tx.asset.findFirst({
          where: {
            companyId: device.companyId,
            deletedAt: null,
            id: { not: asset.id },
            serialNumber: { equals: identity.serialNumber, mode: "insensitive" },
          },
          select: { id: true },
        });
        if (!taken) fill.serialNumber = identity.serialNumber;
      }
      if (Object.keys(fill).length > 0) {
        await tx.asset.update({ where: { id: asset.id }, data: fill });
      }
    }
  });
  return changed ? "changed" : "unchanged";
}

/** Run up to `limit` jobs at once. */
async function pool<T>(items: T[], limit: number, job: (item: T) => Promise<void>) {
  let next = 0;
  const lanes = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const item = items[next++]!;
      await job(item);
    }
  });
  await Promise.all(lanes);
}

/** One backup pass. Returns the run's id. */
export async function runConfigBackup(payload: ConfigBackupJobPayload, collect: Collector = collectConfig): Promise<string> {
  const actor: AuditContext = payload.actorUserId
    ? { actorUserId: payload.actorUserId, actorLabel: payload.actorLabel ?? "user" }
    : { ...SYSTEM_ACTOR, actorLabel: "configuration backup" };

  const devices = await db.infraDevice.findMany({
    where: {
      deletedAt: null,
      kind: "NETWORK",
      ...(payload.deviceIds ? { id: { in: payload.deviceIds } } : { status: "ACTIVE", configBackup: true }),
    },
    select: { id: true },
    orderBy: { name: "asc" },
  });
  const run = await db.infraBackupRun.create({
    data: { trigger: payload.trigger, devices: devices.length, createdById: payload.actorUserId ?? null },
  });

  const totals: Record<Outcome, number> = { unchanged: 0, changed: 0, failed: 0, skipped: 0 };
  await pool(devices, CONCURRENCY, async ({ id }) => {
    let outcome: Outcome;
    try {
      outcome = await backupOne(id, payload.trigger, actor, collect);
    } catch (error) {
      // Our own fault (a database hiccup, a bad stored secret): note it on the
      // device and carry on with the rest.
      console.error(`[axivo-worker] Config backup of ${id} failed:`, error);
      await db.infraDevice
        .update({ where: { id }, data: { configCheckedAt: new Date(), configStatus: "FAILED", configError: "Backup failed inside Axivo. See the worker log." } })
        .catch(() => undefined);
      outcome = "failed";
    }
    totals[outcome] += 1;
  });

  await db.infraBackupRun.update({
    where: { id: run.id },
    data: { finishedAt: new Date(), ...totals },
  });
  const parts = [
    `${totals.unchanged + totals.changed} saved`,
    totals.changed > 0 ? `${totals.changed} changed` : null,
    totals.failed > 0 ? `${totals.failed} failed` : null,
    totals.skipped > 0 ? `${totals.skipped} not set up` : null,
  ].filter(Boolean);
  await recordAudit(actor, {
    module: MODULE,
    eventType: "config.backup_run",
    action: `${payload.trigger === "SCHEDULED" ? "Nightly" : "Manual"} configuration backup of ${devices.length} device${devices.length === 1 ? "" : "s"}: ${parts.join(", ")}`,
    targetType: "infra_backup_run",
    targetId: run.id,
  });
  return run.id;
}
