"use client";

import * as React from "react";
import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp, ChevronsUpDown } from "lucide-react";
import { cn } from "@/shared/utils";
import { Table, THead, TBody, TR, TH, TD } from "./table";
import { Button } from "./button";

/**
 * Client-side sortable data table (SDS Doc 03 Ch6). Server components pass
 * pre-rendered cell nodes plus a primitive `sortValue`; clicking a header
 * toggles ascending/descending sort without a round-trip. With `pageSize`
 * the sorted rows are paged locally, so sorting always covers every row,
 * not only the page on screen.
 */

export interface SortableColumn {
  key: string;
  label: React.ReactNode;
  /** Set false for columns like "Actions" that should not be sortable. */
  sortable?: boolean;
  align?: "left" | "right";
  className?: string;
}

export type SortValue = string | number | null | undefined;

export interface SortableRow {
  key: string;
  className?: string;
  cells: Record<string, { sortValue?: SortValue; node: React.ReactNode; className?: string }>;
}

type Sort = { key: string; dir: "asc" | "desc" };

const empty = (value: SortValue) => value === null || value === undefined || value === "";

/** Empty values always sink to the bottom, whichever way the column is sorted. */
export function compareSortValues(a: SortValue, b: SortValue, dir: "asc" | "desc"): number {
  if (empty(a) || empty(b)) return empty(a) && empty(b) ? 0 : empty(a) ? 1 : -1;
  const cmp =
    typeof a === "number" && typeof b === "number"
      ? a - b
      : String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });
  return dir === "asc" ? cmp : -cmp;
}

export function SortableTable({
  columns,
  rows,
  initialSort,
  className,
  pageSize,
  resetKey,
  emptyMessage,
  noun = "record",
}: {
  columns: SortableColumn[];
  rows: SortableRow[];
  initialSort?: Sort;
  className?: string;
  /** Rows per page; leave out to show every row. */
  pageSize?: number;
  /** Back to page 1 when this changes (a new search, say). */
  resetKey?: string;
  /** Shown inside the table when there are no rows. */
  emptyMessage?: string;
  /** What the count under the table calls a row. */
  noun?: string;
}) {
  const [sort, setSort] = useState<Sort | null>(initialSort ?? null);
  const [page, setPage] = useState(1);

  useEffect(() => setPage(1), [resetKey]);

  const sorted = useMemo(() => {
    if (!sort) return rows;
    return [...rows].sort((a, b) => compareSortValues(a.cells[sort.key]?.sortValue, b.cells[sort.key]?.sortValue, sort.dir));
  }, [rows, sort]);

  const pageCount = pageSize ? Math.max(1, Math.ceil(sorted.length / pageSize)) : 1;
  // A refresh can shrink the list under the reader: stay on the last real page.
  const current = Math.min(page, pageCount);
  const visible = pageSize ? sorted.slice((current - 1) * pageSize, current * pageSize) : sorted;

  function toggle(key: string) {
    setPage(1);
    setSort((now) => {
      if (now?.key !== key) return { key, dir: "asc" };
      if (now.dir === "asc") return { key, dir: "desc" };
      return null;
    });
  }

  return (
    <div>
      <Table className={className}>
        <THead>
          <TR>
            {columns.map((column) => {
              const sortable = column.sortable !== false;
              const active = sort?.key === column.key;
              return (
                <TH
                  key={column.key}
                  className={cn(column.align === "right" && "text-right", column.className)}
                  aria-sort={active ? (sort!.dir === "asc" ? "ascending" : "descending") : undefined}
                >
                  {sortable ? (
                    <button
                      type="button"
                      onClick={() => toggle(column.key)}
                      className={cn(
                        "inline-flex items-center gap-1 font-semibold uppercase tracking-[0.07em] hover:text-foreground",
                        column.align === "right" && "flex-row-reverse",
                        active ? "text-foreground" : "text-muted-foreground",
                      )}
                    >
                      {column.label}
                      {active ? (
                        sort!.dir === "asc" ? (
                          <ChevronUp className="h-3.5 w-3.5" aria-hidden />
                        ) : (
                          <ChevronDown className="h-3.5 w-3.5" aria-hidden />
                        )
                      ) : (
                        <ChevronsUpDown className="h-3.5 w-3.5 opacity-50" aria-hidden />
                      )}
                    </button>
                  ) : (
                    column.label
                  )}
                </TH>
              );
            })}
          </TR>
        </THead>
        <TBody>
          {visible.length === 0 && emptyMessage ? (
            <TR>
              <TD colSpan={columns.length} className="py-8 text-center text-muted-foreground">{emptyMessage}</TD>
            </TR>
          ) : (
            visible.map((row) => (
              <TR key={row.key} className={row.className}>
                {columns.map((column) => {
                  const cell = row.cells[column.key];
                  return (
                    <TD key={column.key} className={cn(column.align === "right" && "text-right", cell?.className)}>
                      {cell?.node ?? null}
                    </TD>
                  );
                })}
              </TR>
            ))
          )}
        </TBody>
      </Table>
      {pageSize && sorted.length > 0 ? (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm">
          <p className="text-xs tabular-nums text-muted-foreground">
            {pageCount > 1
              ? `${(current - 1) * pageSize + 1} to ${Math.min(current * pageSize, sorted.length)} of ${sorted.length}`
              : `${sorted.length} ${sorted.length === 1 ? noun : noun.endsWith("s") ? `${noun}es` : `${noun}s`}`}
          </p>
          {pageCount > 1 ? (
            <div className="flex items-center gap-2">
              <span className="text-xs tabular-nums text-muted-foreground">Page {current} of {pageCount}</span>
              <Button variant="outline" size="sm" disabled={current === 1} onClick={() => setPage(current - 1)}>
                Previous
              </Button>
              <Button variant="outline" size="sm" disabled={current === pageCount} onClick={() => setPage(current + 1)}>
                Next
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
