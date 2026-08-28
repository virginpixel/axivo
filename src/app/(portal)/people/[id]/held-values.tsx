"use client";

import { useState } from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";

/**
 * The "Holds" column on the application-access table. Each request field the
 * person holds (cost centres, outlets, …) is a compact chip; the values show on
 * hover (native tooltip) and on click, so a long list never crowds the row.
 *
 * The panel is portalled rather than absolutely positioned inside the cell: the
 * table scrolls horizontally, and an in-cell panel was clipped by that overflow,
 * turning the card into a scrolling box instead of floating above it.
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
          <PopoverPrimitive.Root
            key={entry.label}
            open={isOpen}
            onOpenChange={(next) => setOpenLabel(next ? entry.label : null)}
          >
            <PopoverPrimitive.Trigger asChild>
              <button
                type="button"
                title={`${entry.label}: ${entry.value}`}
                className="inline-flex items-center gap-1 rounded-full border bg-muted/40 px-2 py-0.5 text-xs hover:bg-accent"
              >
                {entry.label}
                {values.length > 1 ? <span className="text-muted-foreground">({values.length})</span> : null}
              </button>
            </PopoverPrimitive.Trigger>
            <PopoverPrimitive.Portal>
              <PopoverPrimitive.Content
                align="start"
                sideOffset={6}
                collisionPadding={8}
                className="z-[200] min-w-40 max-w-72 rounded-md border bg-popover p-2 shadow-pop"
              >
                <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  {entry.label}
                </p>
                <ul className="max-h-60 space-y-0.5 overflow-y-auto text-xs scrollbar-thin">
                  {values.map((value) => (
                    <li key={value}>{value}</li>
                  ))}
                </ul>
              </PopoverPrimitive.Content>
            </PopoverPrimitive.Portal>
          </PopoverPrimitive.Root>
        );
      })}
    </div>
  );
}
