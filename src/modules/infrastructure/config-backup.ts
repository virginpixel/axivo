import { db } from "@/shared/db";
import { decryptSecret } from "@/shared/crypto/encryption";
import { recordAudit } from "@/shared/audit/audit";
import { getSetting, setSetting, SETTING_KEYS } from "@/shared/settings/settings";
import { enqueueConfigBackup } from "@/shared/queue/queue";
import { BusinessRuleError, NotFoundError } from "@/shared/errors";
import { assertCompanyAccess, companyFilter, type Scope } from "./service";
import { diffLines, comparable, type DiffLine } from "./config-parse";

/**
 * Configuration backups, the web side (SDS Doc 24): what the backups page and
 * the device page show, reading a saved version (audited, since a
 * configuration holds keys and password hashes), and asking the worker for a
 * run. The logging in itself happens only in the worker (config-runner.ts).
 */

const MODULE = "infrastructure";

export interface BackupSettings {
  enabled: boolean;
  /** Hour of the day, organisation time. */
  hour: number;
}

export async function getBackupSettings(): Promise<BackupSettings> {
  const value = await getSetting<Partial<BackupSettings>>(SETTING_KEYS.CONFIG_BACKUP);
  return { enabled: value?.enabled ?? true, hour: Number.isInteger(value?.hour) ? value!.hour! : 2 };
}

export async function saveBackupSettings(scope: Scope, settings: BackupSettings) {
  await setSetting(scope.audit, {
    key: SETTING_KEYS.CONFIG_BACKUP,
    value: { enabled: settings.enabled, hour: settings.hour },
    category: "infrastructure",
    description: "Nightly configuration backup of network devices",
  });
}

/** True when a run started in the last two hours has not finished. */
async function runInProgress() {
  const recent = await db.infraBackupRun.findFirst({
    where: { finishedAt: null, startedAt: { gt: new Date(Date.now() - 2 * 3_600_000) } },
    select: { id: true },
  });
  return !!recent;
}

/** Ask the worker to back up now: every included device, or the ones given. */
export async function requestBackup(scope: Scope, deviceIds?: string[]) {
  let ids = deviceIds;
  if (ids) {
    const devices = await db.infraDevice.findMany({
      where: { id: { in: ids }, deletedAt: null, kind: "NETWORK" },
      select: { id: true, companyId: true },
    });
    if (devices.length !== ids.length) throw new NotFoundError("Device not found.");
    for (const device of devices) assertCompanyAccess(scope, device.companyId);
  } else {
    if (await runInProgress()) throw new BusinessRuleError("A backup is already running. It will show here when it finishes.");
    if (!scope.isGlobalAdmin) {
      // Only this company's devices; another company's switches are not theirs to log in to.
      const own = await db.infraDevice.findMany({
        where: { deletedAt: null, kind: "NETWORK", status: "ACTIVE", configBackup: true, companyId: scope.companyId },
        select: { id: true },
      });
      ids = own.map((device) => device.id);
    }
  }
  await enqueueConfigBackup({
    trigger: "MANUAL",
    deviceIds: ids,
    actorUserId: scope.audit.actorUserId ?? null,
    actorLabel: scope.audit.actorLabel,
  });
}

export async function setBackupIncluded(scope: Scope, deviceId: string, included: boolean) {
  const device = await db.infraDevice.findFirst({ where: { id: deviceId, deletedAt: null } });
  if (!device) throw new NotFoundError("Device not found.");
  assertCompanyAccess(scope, device.companyId);
  if (device.configBackup === included) return;
  await db.$transaction(async (tx) => {
    await tx.infraDevice.update({ where: { id: deviceId }, data: { configBackup: included } });
    await recordAudit(
      { ...scope.audit, companyId: device.companyId },
      {
        module: MODULE,
        eventType: "config.backup_included",
        action: `${included ? "Included" : "Left out"} "${device.name}" ${included ? "in" : "of"} the nightly configuration backup`,
        targetType: "infra_device",
        targetId: deviceId,
        targetLabel: device.name,
        fieldChanges: [{ field: "configBackup", previousValue: device.configBackup ? "yes" : "no", newValue: included ? "yes" : "no" }],
      },
      tx,
    );
  });
}

export interface BackupRow {
  id: string;
  name: string;
  ipAddress: string | null;
  companyName: string;
  included: boolean;
  status: string | null;
  error: string | null;
  checkedAt: Date | null;
  lastChangeAt: Date | null;
  versions: number;
  hasLogin: boolean;
}

/** The backups page: the schedule, the last runs and every network device. */
export async function loadBackupOverview(scope: Scope) {
  const [settings, runs, devices] = await Promise.all([
    getBackupSettings(),
    db.infraBackupRun.findMany({ orderBy: { startedAt: "desc" }, take: 5 }),
    db.infraDevice.findMany({
      where: { deletedAt: null, kind: "NETWORK", status: "ACTIVE", ...companyFilter(scope) },
      orderBy: { name: "asc" },
      select: {
        id: true, name: true, ipAddress: true, configBackup: true, configStatus: true, configError: true, configCheckedAt: true,
        company: { select: { name: true } },
        credentials: { select: { purpose: true, credentialSet: { select: { username: true, deletedAt: true, secretCiphertext: true } } } },
        configs: { orderBy: { takenAt: "desc" }, take: 1, select: { takenAt: true } },
        _count: { select: { configs: true } },
      },
    }),
  ]);
  const rows: BackupRow[] = devices.map((device) => ({
    id: device.id,
    name: device.name,
    ipAddress: device.ipAddress,
    companyName: device.company.name,
    included: device.configBackup,
    status: device.configStatus,
    error: device.configError,
    checkedAt: device.configCheckedAt,
    lastChangeAt: device.configs[0]?.takenAt ?? null,
    versions: device._count.configs,
    // Same rule as the worker: a login with a username and a password that is not only for enable.
    hasLogin: device.credentials.some(
      (c) => !c.credentialSet.deletedAt && c.credentialSet.username && c.credentialSet.secretCiphertext && !/enable/i.test(c.purpose ?? ""),
    ),
  }));
  return { settings, runs, rows, running: await runInProgress() };
}

/** A device's saved versions, newest first. */
export async function listDeviceBackups(scope: Scope, deviceId: string) {
  const device = await db.infraDevice.findFirst({ where: { id: deviceId, deletedAt: null }, select: { companyId: true } });
  if (!device) throw new NotFoundError("Device not found.");
  assertCompanyAccess(scope, device.companyId);
  return db.infraConfigBackup.findMany({
    where: { deviceId },
    orderBy: { takenAt: "desc" },
    select: { id: true, takenAt: true, lineCount: true, linesAdded: true, linesRemoved: true, firmware: true },
  });
}

/**
 * One saved version in full, with the version before it. Every read is
 * audited: the text holds the device's keys and password hashes.
 */
export async function readBackup(scope: Scope, deviceId: string, backupId: string, purpose: "view" | "download" | "compare") {
  const backup = await db.infraConfigBackup.findFirst({
    where: { id: backupId, deviceId },
    include: { device: { select: { id: true, name: true, hostname: true, companyId: true, deletedAt: true } } },
  });
  if (!backup || backup.device.deletedAt) throw new NotFoundError("Saved configuration not found.");
  assertCompanyAccess(scope, backup.device.companyId);
  const previous = await db.infraConfigBackup.findFirst({
    where: { deviceId, takenAt: { lt: backup.takenAt } },
    orderBy: { takenAt: "desc" },
  });
  const next = await db.infraConfigBackup.findFirst({
    where: { deviceId, takenAt: { gt: backup.takenAt } },
    orderBy: { takenAt: "asc" },
    select: { id: true },
  });
  const content = decryptSecret(backup.contentCiphertext);
  let diff: DiffLine[] | null = null;
  if (purpose === "compare" && previous) {
    diff = diffLines(comparable(decryptSecret(previous.contentCiphertext)), comparable(content));
  }
  const verb = purpose === "download" ? "Downloaded" : purpose === "compare" ? "Compared" : "Viewed";
  await recordAudit(
    { ...scope.audit, companyId: backup.device.companyId },
    {
      module: MODULE,
      eventType: `config.${purpose === "download" ? "downloaded" : "viewed"}`,
      action: `${verb} the configuration of "${backup.device.name}" saved ${backup.takenAt.toISOString().slice(0, 16).replace("T", " ")} UTC`,
      targetType: "infra_device",
      targetId: backup.device.id,
      targetLabel: backup.device.name,
    },
  );
  return {
    device: backup.device,
    backup: {
      id: backup.id,
      takenAt: backup.takenAt,
      lineCount: backup.lineCount,
      linesAdded: backup.linesAdded,
      linesRemoved: backup.linesRemoved,
      firmware: backup.firmware,
    },
    previousId: previous?.id ?? null,
    nextId: next?.id ?? null,
    content,
    diff,
  };
}
