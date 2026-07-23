"use client";

import * as React from "react";
import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp, ChevronsUpDown } from "lucide-react";
import { cn } from "@/shared/utils";
import { Table, THead, TBody, TR, TH, TD } from "./table";

/**
 * Client-side sortable data table (SDS Doc 03 Ch6). Server components pass
 * pre-rendered cell nodes plus a primitive `sortValue`; clicking a header
 * toggles ascending/descending sort without a round-trip.
 */

export interface SortableColumn {
  key: string;
  label: React.ReactNode;
  /** Set false for columns like "Actions" that should not be sortable. */
  sortable?: boolean;
  align?: "left" | "right";
  className?: string;
}

export interface SortableRow {
  key: string;
  cells: Record<
    string,
    { sortValue?: string | number | null; node: React.ReactNode; className?: string }
  >;
}

export function SortableTable({
  columns,
  rows,
  initialSort,
  className,
}: {
  columns: SortableColumn[];
  rows: SortableRow[];
  initialSort?: { key: string; dir: "asc" | "desc" };
  className?: string;
}) {
  const [sort, setSort] = useState<{ key: string; dir: "asc" | "desc" } | null>(initialSort ?? null);

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const arr = [...rows];
    arr.sort((a, b) => {
      const av = a.cells[sort.key]?.sortValue ?? "";
      const bv = b.cells[sort.key]?.sortValue ?? "";
      let cmp: number;
      if (typeof av === "number" && typeof bv === "number") {
        cmp = av - bv;
      } else {
        cmp = String(av).localeCompare(String(bv), undefined, { numeric: true, sensitivity: "base" });
      }
      return sort.dir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [rows, sort]);

  function toggle(key: string) {
    setSort((current) => {
      if (current?.key !== key) return { key, dir: "asc" };
      if (current.dir === "asc") return { key, dir: "desc" };
      return null;
    });
  }

  return (
    <Table className={className}>
      <THead>
        <TR>
          {columns.map((column) => {
            const sortable = column.sortable !== false;
            const active = sort?.key === column.key;
            return (
              <TH key={column.key} className={cn(column.align === "right" && "text-right", column.className)}>
                {sortable ? (
                  <button
                    type="button"
                    onClick={() => toggle(column.key)}
                    className={cn(
                      "inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wide hover:text-foreground",
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
        {sorted.map((row) => (
          <TR key={row.key}>
            {columns.map((column) => {
              const cell = row.cells[column.key];
              return (
                <TD key={column.key} className={cn(column.align === "right" && "text-right", cell?.className)}>
                  {cell?.node ?? null}
                </TD>
              );
            })}
          </TR>
        ))}
      </TBody>
    </Table>
  );
}
