"use client";

import { useState } from "react";

/**
 * The "Holds" column on the application-access table. Each request field the
 * person holds (cost centres, outlets, …) is a compact chip; the values show on
 * hover (native tooltip) and on click (an inline popover), so a long list no
 * longer crowds the row.
 */
export function HeldValues({ entries }: { entries: { label: string; value: string }[] }) {
  const [openLabel, setOpenLabel] = useState<string | null>(null);

  if (entries.length === 0) return <span className="text-muted-foreground">-</span>;

  return (
    <div className="flex flex-wrap gap-1">
      {entries.map((entry) => {
        const values = entry.value.split(", ").filter(Boolean);
        const isOpen = openLabel === entry.label;
        return (
          <div key={entry.label} className="relative">
            <button
              type="button"
              title={`${entry.label}: ${entry.value}`}
              onClick={() => setOpenLabel(isOpen ? null : entry.label)}
              className="inline-flex items-center gap-1 rounded-full border bg-muted/40 px-2 py-0.5 text-xs hover:bg-accent"
            >
              {entry.label}
              {values.length > 1 ? <span className="text-muted-foreground">({values.length})</span> : null}
            </button>
            {isOpen ? (
              <div className="absolute left-0 top-full z-20 mt-1 min-w-40 max-w-64 rounded-md border bg-popover p-2 shadow-pop">
                <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  {entry.label}
                </p>
                <ul className="space-y-0.5 text-xs">
                  {values.map((value) => (
                    <li key={value} className="truncate">{value}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
