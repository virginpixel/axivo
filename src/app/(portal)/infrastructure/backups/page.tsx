import Link from "next/link";
import { requirePermission } from "@/shared/auth/guard";
import { PageHeader, StatCard } from "@/shared/ui/page";
import { EmptyState } from "@/shared/ui/table";
import { SortableTable } from "@/shared/ui/sortable-table";
import { LiveSearch } from "@/shared/ui/live-search";
import { Badge } from "@/shared/ui/badge";
import { CompanyPill } from "@/shared/ui/filter-pill";
import { AutoRefresh } from "@/shared/ui/auto-refresh";
import { formatDateTime } from "@/shared/utils";
import { appTimeZone } from "@/shared/settings/runtime";
import { loadBackupOverview, type BackupRow } from "@/modules/infrastructure/config-backup";
import { ipToNumber } from "@/modules/infrastructure/ip-math";
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

const BUCKET_LABEL = { saved: "Saved", failed: "Failed", setup: "Not set up", out: "Left out", waiting: "Waiting" } as const;

/** The line under the result badge. A device left out says so, not why its last try failed. */
function resultNote(row: BackupRow, state: ReturnType<typeof bucket>): string | null {
  if (state === "out") return "Backup is switched off for this device.";
  if (state === "setup" && !row.error) return row.ipAddress ? "No SSH login linked." : "No IP address recorded.";
  // A saved device may carry a note: which login got in after another failed.
  return row.error;
}

function bucket(row: BackupRow): "failed" | "setup" | "saved" | "out" | "waiting" {
  if (!row.included) return "out";
  if (!row.hasLogin || row.status === "SKIPPED") return "setup";
  if (row.status === "FAILED") return "failed";
  if (row.status === "OK") return "saved";
  return "waiting";
}

/** Nightly configuration backups of network devices (SDS Doc 24). */
export default async function ConfigBackupsPage({ searchParams }: { searchParams: Promise<{ show?: string; q?: string }> }) {
  const context = await requirePermission("infrastructure.view");
  const { user } = context;
  const params = await searchParams;
  const show = params.show ?? "";
  const q = params.q?.trim() ?? "";
  const isGlobalAdmin = user.systemRoleKey === "SYSTEM_ADMINISTRATOR";
  const canManage = user.permissions.has("infrastructure.manage");
  const canSchedule = user.permissions.has("settings.manage");
  const [{ settings, runs, rows, running }, timeZone] = await Promise.all([
    loadBackupOverview({ audit: context.audit, companyId: user.companyId, isGlobalAdmin }),
    appTimeZone(),
  ]);

  const counts = { failed: 0, setup: 0, saved: 0, out: 0, waiting: 0 };
  for (const row of rows) counts[bucket(row)] += 1;
  const text = q.toLowerCase();
  const matches = (row: BackupRow) =>
    !text ||
    [row.name, row.ipAddress, row.companyName, row.error, BUCKET_LABEL[bucket(row)]].some((value) => value?.toLowerCase().includes(text));
  const shown = rows.filter((row) => (!show || bucket(row) === show) && matches(row));
  const filterHref = (value: string) => {
    const search = new URLSearchParams();
    if (value) search.set("show", value);
    if (q) search.set("q", q);
    const query = search.toString();
    return `/infrastructure/backups${query ? `?${query}` : ""}`;
  };
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

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <LiveSearch placeholder="Search device, IP or message" className="w-full sm:w-72" />
        {FILTERS.map((filter) => (
          <CompanyPill
            key={filter.value}
            href={filterHref(filter.value)}
            label={filter.value ? `${filter.label} (${counts[filter.value]})` : `${filter.label} (${rows.length})`}
            active={show === filter.value}
          />
        ))}
      </div>

      {shown.length === 0 ? (
        <EmptyState
          title={rows.length === 0 ? "No active network devices" : "Nothing here"}
          description={rows.length === 0 ? "Add switches under Network devices first." : q ? "No device matches the search." : "No device is in this group right now."}
        />
      ) : (
        <SortableTable
          pageSize={50}
          resetKey={`${show}|${q}`}
          noun="device"
          initialSort={{ key: "device", dir: "asc" }}
          columns={[
            { key: "device", label: "Device" },
            { key: "ip", label: "IP address" },
            ...(isGlobalAdmin ? [{ key: "company", label: "Company" }] : []),
            { key: "result", label: "Result" },
            { key: "lastChange", label: "Last change" },
            { key: "copies", label: "Copies" },
            { key: "lastTried", label: "Last tried" },
          ]}
          rows={shown.map((row) => {
            const state = bucket(row);
            const note = resultNote(row, state);
            return {
              key: row.id,
              cells: {
                device: {
                  sortValue: row.name,
                  node: <Link href={`/infrastructure/devices/${row.id}`} className="font-medium hover:underline">{row.name}</Link>,
                },
                ip: {
                  sortValue: row.ipAddress ? ipToNumber(row.ipAddress) ?? row.ipAddress : null,
                  node: row.ipAddress ?? "None",
                  className: "font-mono text-xs tabular-nums",
                },
                company: { sortValue: row.companyName, node: row.companyName, className: "text-xs" },
                result: {
                  sortValue: BUCKET_LABEL[state],
                  className: "max-w-80",
                  node: (
                    <>
                      {state === "saved" ? <Badge variant="success">Saved</Badge> : null}
                      {state === "failed" ? <Badge variant="destructive">Failed</Badge> : null}
                      {state === "setup" ? <Badge variant="warning">Not set up</Badge> : null}
                      {state === "out" ? <Badge>Left out</Badge> : null}
                      {state === "waiting" ? <Badge variant="info">Waiting</Badge> : null}
                      {note ? <p className="mt-1 text-xs text-muted-foreground">{note}</p> : null}
                    </>
                  ),
                },
                lastChange: {
                  sortValue: row.lastChangeAt ? new Date(row.lastChangeAt).getTime() : null,
                  node: row.lastChangeAt ? formatDateTime(row.lastChangeAt) : "None",
                  className: "text-xs",
                },
                copies: { sortValue: row.versions || null, node: row.versions || "None", className: "text-xs tabular-nums" },
                lastTried: {
                  sortValue: row.checkedAt ? new Date(row.checkedAt).getTime() : null,
                  node: row.checkedAt ? formatDateTime(row.checkedAt) : "Never",
                  className: "text-xs text-muted-foreground",
                },
              },
            };
          })}
        />
      )}
    </div>
  );
}
