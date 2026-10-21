"use client";

import { useState } from "react";
import Link from "next/link";
import { Table, THead, TBody, TR, TH, TD } from "@/shared/ui/table";
import { StatusBadge } from "@/shared/ui/badge";
import { cn } from "@/shared/utils";
import { ReturnAssetButton } from "./person-clearance";

export interface PersonAssetRow {
  assignmentId: string;
  assetId: string;
  name: string;
  reference: string | null;
  /** Set when the holder is a department this person heads, not the person. */
  heldBy: string | null;
  assignedAt: string;
  assignedBy: string;
  returnedAt: string | null;
  status: string;
}

/**
 * What this employee holds, with returned equipment kept out of the way. The
 * list people actually work from is the current one; the returned rows are
 * history, so they sit behind a toggle in the same card rather than padding the
 * list every time an employee swaps a laptop.
 *
 * Dates arrive pre-formatted: the organization timezone is resolved on the
 * server, so formatting here would render in the browser's zone instead.
 */
export function PersonAssets({
  current,
  history,
  canManage,
}: {
  current: PersonAssetRow[];
  history: PersonAssetRow[];
  canManage: boolean;
}) {
  const [view, setView] = useState<"current" | "history">("current");
  const rows = view === "current" ? current : history;

  return (
    <div>
      <div className="mb-3 inline-flex rounded-full border bg-muted/40 p-0.5 text-sm">
        {([
          ["current", "Current", current.length],
          ["history", "Returned", history.length],
        ] as const).map(([key, label, count]) => (
          <button
            key={key}
            type="button"
            onClick={() => setView(key)}
            aria-pressed={view === key}
            className={cn(
              "rounded-full px-3 py-1 transition-colors",
              view === key ? "bg-card font-medium shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {label} ({count})
          </button>
        ))}
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {view === "current" ? "No assets currently assigned." : "No returned assets."}
        </p>
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Asset</TH>
              <TH>Assigned</TH>
              <TH>Assigned by</TH>
              {view === "history" ? <TH>Returned</TH> : null}
              <TH>Status</TH>
              {canManage && view === "current" ? <TH /> : null}
            </TR>
          </THead>
          <TBody>
            {rows.map((row) => (
              <TR key={row.assignmentId}>
                <TD>
                  <Link href={`/assets/${row.assetId}`} className="font-medium text-foreground hover:underline">
                    {row.name}
                  </Link>
                  {row.heldBy ? (
                    <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                      {row.heldBy} · Dept
                    </span>
                  ) : null}
                  {row.reference ? <p className="text-xs text-muted-foreground">{row.reference}</p> : null}
                </TD>
                <TD>{row.assignedAt}</TD>
                <TD>{row.assignedBy}</TD>
                {view === "history" ? <TD>{row.returnedAt ?? "-"}</TD> : null}
                <TD><StatusBadge status={row.status} /></TD>
                {canManage && view === "current" ? (
                  <TD className="text-right">
                    <ReturnAssetButton assignmentId={row.assignmentId} />
                  </TD>
                ) : null}
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </div>
  );
}
