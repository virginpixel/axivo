import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, ChevronRight, Download } from "lucide-react";
import { requirePermission } from "@/shared/auth/guard";
import { PageHeader } from "@/shared/ui/page";
import { formatDateTime, cn } from "@/shared/utils";
import { NotFoundError } from "@/shared/errors";
import { readBackup } from "@/modules/infrastructure/config-backup";
import type { DiffLine } from "@/modules/infrastructure/config-parse";
import { CopyConfigButton } from "../../../../backup-controls";

export const dynamic = "force-dynamic";
export const metadata = { title: "Saved configuration" };

/**
 * One saved configuration: the whole text, ready to copy onto a replacement
 * switch, or what changed since the copy before it (SDS Doc 24). Every
 * opening is audited.
 */
export default async function ConfigVersionPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; backupId: string }>;
  searchParams: Promise<{ compare?: string }>;
}) {
  const context = await requirePermission("infrastructure.configs.view");
  const { id, backupId } = await params;
  const compare = (await searchParams).compare === "1";
  const scope = {
    audit: context.audit,
    companyId: context.user.companyId,
    isGlobalAdmin: context.user.systemRoleKey === "SYSTEM_ADMINISTRATOR",
  };

  let result: Awaited<ReturnType<typeof readBackup>>;
  try {
    result = await readBackup(scope, id, backupId, compare ? "compare" : "view");
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }
  const { device, backup, previousId, nextId, content, diff } = result;
  const base = `/infrastructure/devices/${device.id}/config`;
  const lines = content.split("\n");

  return (
    <div>
      <PageHeader
        title={`${device.name} configuration`}
        backHref={`/infrastructure/devices/${device.id}`}
        backLabel={device.name}
        description={[
          `Saved ${formatDateTime(backup.takenAt)}`,
          backup.firmware ? `firmware ${backup.firmware}` : null,
          `${backup.lineCount} lines`,
        ].filter(Boolean).join(" · ")}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <CopyConfigButton text={content} />
            <a
              href={`/api/infrastructure/configs/${backup.id}/download`}
              className="inline-flex h-9 items-center gap-1.5 rounded-full border px-4 text-sm font-medium transition-colors hover:border-primary/40 hover:bg-accent"
            >
              <Download className="h-4 w-4" /> Download
            </a>
          </div>
        }
      />

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex rounded-full border bg-card p-0.5 text-sm" role="group" aria-label="Show">
          <Link
            href={`${base}/${backup.id}`}
            aria-current={!compare ? "page" : undefined}
            className={cn("rounded-full px-3 py-1", !compare ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}
          >
            Full configuration
          </Link>
          {previousId ? (
            <Link
              href={`${base}/${backup.id}?compare=1`}
              aria-current={compare ? "page" : undefined}
              className={cn("rounded-full px-3 py-1", compare ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}
            >
              Changes since the copy before
            </Link>
          ) : (
            <span className="px-3 py-1 text-muted-foreground/60">First copy: nothing to compare</span>
          )}
        </div>
        <div className="flex items-center gap-1 text-sm">
          {previousId ? (
            <Link href={`${base}/${previousId}${compare ? "?compare=1" : ""}`} className="inline-flex items-center gap-1 rounded-full px-3 py-1 text-muted-foreground hover:bg-accent hover:text-foreground">
              <ChevronLeft className="h-4 w-4" /> Older
            </Link>
          ) : null}
          {nextId ? (
            <Link href={`${base}/${nextId}${compare ? "?compare=1" : ""}`} className="inline-flex items-center gap-1 rounded-full px-3 py-1 text-muted-foreground hover:bg-accent hover:text-foreground">
              Newer <ChevronRight className="h-4 w-4" />
            </Link>
          ) : null}
        </div>
      </div>

      {compare && diff ? (
        <DiffView diff={diff} />
      ) : (
        <div className="overflow-hidden rounded-2xl border bg-card">
          <pre className="max-h-[calc(100dvh-16rem)] min-h-64 overflow-auto py-3 font-mono text-[12px] leading-[1.55]">
            {lines.map((line, index) => (
              <div key={index} className="flex hover:bg-muted/50">
                <span className="w-14 shrink-0 select-none pr-3 text-right text-muted-foreground/60 tabular-nums">{index + 1}</span>
                <span className="whitespace-pre pr-4">{line || " "}</span>
              </div>
            ))}
          </pre>
        </div>
      )}
      <p className="mt-3 text-xs text-muted-foreground">
        This text holds the device&apos;s keys and password hashes. Opening it is recorded in the device&apos;s history.
      </p>
    </div>
  );
}

const CONTEXT = 3;

/** Changed lines with a few lines either side; long unchanged runs are folded. */
function DiffView({ diff }: { diff: DiffLine[] }) {
  const changed = diff.map((line) => line.kind !== "same");
  if (!changed.includes(true)) {
    return (
      <p className="rounded-2xl border bg-card px-4 py-6 text-sm text-muted-foreground">
        Only timestamps differ from the copy before.
      </p>
    );
  }
  const keep = diff.map((_, index) => {
    for (let k = Math.max(0, index - CONTEXT); k <= Math.min(diff.length - 1, index + CONTEXT); k += 1) {
      if (changed[k]) return true;
    }
    return false;
  });
  const blocks: ({ type: "line"; line: DiffLine } | { type: "fold"; count: number })[] = [];
  diff.forEach((line, index) => {
    if (keep[index]) {
      blocks.push({ type: "line", line });
      return;
    }
    const last = blocks[blocks.length - 1];
    if (last?.type === "fold") last.count += 1;
    else blocks.push({ type: "fold", count: 1 });
  });
  const added = diff.filter((line) => line.kind === "added").length;
  const removed = diff.filter((line) => line.kind === "removed").length;

  return (
    <div className="overflow-hidden rounded-2xl border bg-card">
      <p className="border-b px-4 py-2 text-sm">
        <span className="font-medium text-success">{added} added</span>
        <span className="text-muted-foreground"> · </span>
        <span className="font-medium text-destructive">{removed} removed</span>
      </p>
      <pre className="max-h-[calc(100dvh-18rem)] min-h-64 overflow-auto py-2 font-mono text-[12px] leading-[1.55]">
        {blocks.map((block, index) =>
          block.type === "fold" ? (
            <div key={index} className="my-1 bg-muted/50 px-4 py-0.5 text-[11px] text-muted-foreground">
              {block.count} unchanged line{block.count === 1 ? "" : "s"}
            </div>
          ) : (
            <div
              key={index}
              className={cn(
                "flex",
                block.line.kind === "added" && "bg-success/10",
                block.line.kind === "removed" && "bg-destructive/10",
              )}
            >
              <span className="w-12 shrink-0 select-none pr-2 text-right text-muted-foreground/60 tabular-nums">{block.line.oldNo ?? ""}</span>
              <span className="w-12 shrink-0 select-none pr-2 text-right text-muted-foreground/60 tabular-nums">{block.line.newNo ?? ""}</span>
              <span
                className={cn(
                  "w-5 shrink-0 select-none text-center",
                  block.line.kind === "added" && "text-success",
                  block.line.kind === "removed" && "text-destructive",
                )}
              >
                {block.line.kind === "added" ? "+" : block.line.kind === "removed" ? "-" : ""}
              </span>
              <span className="whitespace-pre pr-4">{block.line.text || " "}</span>
            </div>
          ),
        )}
      </pre>
    </div>
  );
}
