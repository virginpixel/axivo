"use client";

import { useState } from "react";
import { Download, Eye, FileArchive } from "lucide-react";
import { Table, THead, TBody, TR, TH, TD } from "@/shared/ui/table";
import { Button } from "@/shared/ui/button";

/**
 * Report results with per-row view/download and multi-select bulk download.
 * Client-side because the tick boxes are transient selection state, not
 * something worth putting in the URL.
 */
export function ReportTable({
  reportKey,
  headers,
  rows,
  rowLinks,
  rowIds,
  canExport,
}: {
  reportKey: string;
  headers: string[];
  rows: string[][];
  rowLinks?: (string | null)[];
  rowIds?: (string | null)[];
  canExport: boolean;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const selectable = canExport && rowIds !== undefined;
  const selectableIds = selectable ? rowIds!.filter((id): id is string => id !== null) : [];
  const uniqueIds = Array.from(new Set(selectableIds));
  const allSelected = uniqueIds.length > 0 && selected.length === uniqueIds.length;

  function toggle(id: string) {
    setSelected((current) => (current.includes(id) ? current.filter((value) => value !== id) : [...current, id]));
  }

  return (
    <div>
      {selectable ? (
        <div className="mb-3 flex items-center gap-3">
          <Button
            size="sm"
            variant="outline"
            disabled={selected.length === 0}
            onClick={() => {
              window.location.href = `/api/reports/${reportKey}/bundle?ids=${selected.join(",")}`;
            }}
          >
            <FileArchive className="h-3.5 w-3.5" /> Download selected
          </Button>
          <span className="text-xs text-muted-foreground">
            {selected.length > 0 ? `${selected.length} selected` : "Tick rows to download them as one ZIP."}
          </span>
        </div>
      ) : null}
      <Table>
        <THead>
          <TR>
            {selectable ? (
              <TH className="w-8">
                <input
                  type="checkbox"
                  aria-label="Select all rows"
                  checked={allSelected}
                  onChange={() => setSelected(allSelected ? [] : uniqueIds)}
                  className="h-4 w-4 rounded border-input"
                />
              </TH>
            ) : null}
            {headers.map((header) => (
              <TH key={header}>{header}</TH>
            ))}
            {rowLinks ? <TH className="text-right">Form</TH> : null}
          </TR>
        </THead>
        <TBody>
          {rows.map((row, rowIndex) => {
            const link = rowLinks?.[rowIndex] ?? null;
            const id = rowIds?.[rowIndex] ?? null;
            return (
              <TR key={rowIndex}>
                {selectable ? (
                  <TD>
                    {id ? (
                      <input
                        type="checkbox"
                        aria-label={`Select ${row[0]}`}
                        checked={selected.includes(id)}
                        onChange={() => toggle(id)}
                        className="h-4 w-4 rounded border-input"
                      />
                    ) : null}
                  </TD>
                ) : null}
                {row.map((cell, cellIndex) => (
                  <TD key={cellIndex} className="max-w-64 truncate" title={cell}>
                    {cell}
                  </TD>
                ))}
                {rowLinks ? (
                  <TD className="text-right">
                    {link ? (
                      <span className="inline-flex items-center justify-end gap-1">
                        <a
                          href={`${link}${link.includes("?") ? "&" : "?"}inline=1`}
                          target="_blank"
                          rel="noreferrer"
                          title="View"
                          aria-label="View form"
                          className="inline-flex h-7 w-7 items-center justify-center rounded-md hover:bg-accent"
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </a>
                        <a
                          href={link}
                          title="Download"
                          aria-label="Download form"
                          className="inline-flex h-7 w-7 items-center justify-center rounded-md hover:bg-accent"
                        >
                          <Download className="h-3.5 w-3.5" />
                        </a>
                      </span>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TD>
                ) : null}
              </TR>
            );
          })}
        </TBody>
      </Table>
    </div>
  );
}
