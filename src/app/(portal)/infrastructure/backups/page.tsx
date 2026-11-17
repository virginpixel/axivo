import Link from "next/link";
import { requirePermission } from "@/shared/auth/guard";
import { PageHeader, StatCard } from "@/shared/ui/page";
import { Table, THead, TBody, TR, TH, TD, EmptyState } from "@/shared/ui/table";
import { Badge } from "@/shared/ui/badge";
import { CompanyPill } from "@/shared/ui/filter-pill";
import { AutoRefresh } from "@/shared/ui/auto-refresh";
import { formatDateTime } from "@/shared/utils";
import { appTimeZone } from "@/shared/settings/runtime";
import { loadBackupOverview, type BackupRow } from "@/modules/infrastructure/config-backup";
import { BackupNowButton, BackupScheduleDialog } from "../backup-controls";

export const dynamic = "force-dynamic";
export const metadata = { title: "Config backups" };

const FILTERS = [
  { value: "", label: "All" },
  { value: "failed", label: "Failed" },
  { value: "setup", label: "Not set up" },
  { value: "saved", label: "Saved" },
  { value: "out", label: "Left out" },
] as const;

function bucket(row: BackupRow): "failed" | "setup" | "saved" | "out" | "waiting" {
  if (!row.included) return "out";
  if (!row.hasLogin || row.status === "SKIPPED") return "setup";
  if (row.status === "FAILED") return "failed";
  if (row.status === "OK") return "saved";
  return "waiting";
}

/** Nightly configuration backups of network devices (SDS Doc 24). */
export default async function ConfigBackupsPage({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  const context = await requirePermission("infrastructure.view");
  const { user } = context;
  const show = (await searchParams).show ?? "";
  const isGlobalAdmin = user.systemRoleKey === "SYSTEM_ADMINISTRATOR";
  const canManage = user.permissions.has("infrastructure.manage");
  const canSchedule = user.permissions.has("settings.manage");
  const [{ settings, runs, rows, running }, timeZone] = await Promise.all([
    loadBackupOverview({ audit: context.audit, companyId: user.companyId, isGlobalAdmin }),
    appTimeZone(),
  ]);

  const counts = { failed: 0, setup: 0, saved: 0, out: 0, waiting: 0 };
  for (const row of rows) counts[bucket(row)] += 1;
  const shown = show ? rows.filter((row) => bucket(row) === show) : rows;
  const last = runs[0];
  const hour = `${String(settings.hour).padStart(2, "0")}:00`;

  return (
    <div>
      {running ? <AutoRefresh intervalMs={10_000} /> : null}
      <PageHeader
        title="Config backups"
        description="Each night Axivo logs in to every network device with an SSH login linked, reads its running configuration and keeps a copy whenever it changes. Model, serial number and firmware are updated from what the device reports."
        actions={
          canManage || canSchedule ? (
            <div className="flex flex-wrap items-center gap-2">
              {canSchedule ? <BackupScheduleDialog enabled={settings.enabled} hour={settings.hour} timeZone={timeZone} /> : null}
              {canManage ? <BackupNowButton label="Back up all now" /> : null}
            </div>
          ) : undefined
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Schedule" value={settings.enabled ? hour : "Off"} hint={settings.enabled ? `Every night, ${timeZone} time` : "Only when started by hand"} />
        <StatCard label="Saved" value={counts.saved} tone="success" hint="Last attempt worked" />
        <StatCard label="Failed" value={counts.failed} tone={counts.failed > 0 ? "destructive" : "default"} hint="Could not log in or read" />
        <StatCard label="Not set up" value={counts.setup} tone={counts.setup > 0 ? "warning" : "default"} hint="No IP or no SSH login linked" />
      </div>

      <div className="mb-5 rounded-2xl border bg-card px-5 py-3 text-sm">
        {running ? (
          <p><span className="font-medium">A backup is running.</span> <span className="text-muted-foreground">This page refreshes itself until it finishes.</span></p>
        ) : last ? (
          <p>
            <span className="font-medium">Last run</span>{" "}
            <span className="text-muted-foreground">
              {formatDateTime(last.startedAt)} ({last.trigger === "SCHEDULED" ? "nightly" : "started by hand"}):{" "}
              {last.unchanged + last.changed} saved, {last.changed} changed, {last.failed} failed, {last.skipped} not set up.
            </span>
          </p>
        ) : (
          <p className="text-muted-foreground">No backup has run yet.{settings.enabled ? ` The first runs tonight at ${hour}.` : ""}</p>
        )}
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {FILTERS.map((filter) => (
          <CompanyPill
            key={filter.value}
            href={filter.value ? `/infrastructure/backups?show=${filter.value}` : "/infrastructure/backups"}
            label={filter.value ? `${filter.label} (${counts[filter.value]})` : `${filter.label} (${rows.length})`}
            active={show === filter.value}
          />
        ))}
      </div>

      {shown.length === 0 ? (
        <EmptyState
          title={rows.length === 0 ? "No active network devices" : "Nothing here"}
          description={rows.length === 0 ? "Add switches under Network devices first." : "No device is in this group right now."}
        />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Device</TH>
              <TH>IP address</TH>
              {isGlobalAdmin ? <TH>Company</TH> : null}
              <TH>Result</TH>
              <TH>Last change</TH>
              <TH>Copies</TH>
              <TH>Last tried</TH>
            </TR>
          </THead>
          <TBody>
            {shown.map((row) => {
              const state = bucket(row);
              return (
                <TR key={row.id}>
                  <TD>
                    <Link href={`/infrastructure/devices/${row.id}`} className="font-medium hover:underline">{row.name}</Link>
                  </TD>
                  <TD className="font-mono text-xs tabular-nums">{row.ipAddress ?? "None"}</TD>
                  {isGlobalAdmin ? <TD className="text-xs">{row.companyName}</TD> : null}
                  <TD className="max-w-80">
                    {state === "saved" ? <Badge variant="success">Saved</Badge> : null}
                    {state === "failed" ? <Badge variant="destructive">Failed</Badge> : null}
                    {state === "setup" ? <Badge variant="warning">Not set up</Badge> : null}
                    {state === "out" ? <Badge>Left out</Badge> : null}
                    {state === "waiting" ? <Badge variant="info">Waiting</Badge> : null}
                    {state === "setup" && !row.error ? (
                      <p className="mt-1 text-xs text-muted-foreground">{row.ipAddress ? "No SSH login linked." : "No IP address recorded."}</p>
                    ) : row.error && state !== "saved" ? (
                      <p className="mt-1 text-xs text-muted-foreground">{row.error}</p>
                    ) : null}
                  </TD>
                  <TD className="text-xs">{row.lastChangeAt ? formatDateTime(row.lastChangeAt) : "None"}</TD>
                  <TD className="text-xs tabular-nums">{row.versions || "None"}</TD>
                  <TD className="text-xs text-muted-foreground">{row.checkedAt ? formatDateTime(row.checkedAt) : "Never"}</TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
      )}
    </div>
  );
}
