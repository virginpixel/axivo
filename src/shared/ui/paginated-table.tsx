"use client";

import * as React from "react";
import { useMemo, useState } from "react";
import { Table, THead, TBody, TR, TH } from "./table";
import { Button } from "./button";

/**
 * Client-side paged table for detail-page history cards (SDS Doc 03 Ch6).
 * Server components pass pre-rendered rows; paging happens locally so a long
 * history never turns the page into an endless scroll.
 */
export function PaginatedTable({
  headers,
  rows,
  emptyMessage,
  pageSize = 5,
}: {
  headers: React.ReactNode;
  rows: { key: string; node: React.ReactNode }[];
  emptyMessage: string;
  pageSize?: number;
}) {
  const [page, setPage] = useState(1);
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const current = Math.min(page, pageCount);
  const visible = useMemo(
    () => rows.slice((current - 1) * pageSize, current * pageSize),
    [rows, current, pageSize],
  );

  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyMessage}</p>;
  }

  return (
    <div>
      <Table>
        <THead>
          <TR>{headers}</TR>
        </THead>
        <TBody>
          {visible.map((row) => (
            <React.Fragment key={row.key}>{row.node}</React.Fragment>
          ))}
        </TBody>
      </Table>
      {pageCount > 1 ? (
        <div className="mt-3 flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            {(current - 1) * pageSize + 1} to {Math.min(current * pageSize, rows.length)} of {rows.length}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={current === 1} onClick={() => setPage(current - 1)}>
              Previous
            </Button>
            <Button variant="outline" size="sm" disabled={current === pageCount} onClick={() => setPage(current + 1)}>
              Next
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** Header cell re-export so callers do not need a second import. */
export { TH as PaginatedTH };
