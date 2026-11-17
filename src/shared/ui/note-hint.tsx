"use client";

import * as Tooltip from "@radix-ui/react-tooltip";
import { StickyNote } from "lucide-react";
import { cn } from "@/shared/utils";

/**
 * A note icon in a row's actions: pointing at it (or focusing it) shows the
 * record's note, or says there is none. Rendered above the page, so a table's
 * scrolling edge never cuts it off.
 */
export function NoteHint({ note, label }: { note: string | null | undefined; label?: string }) {
  const text = note?.trim();
  return (
    <Tooltip.Provider delayDuration={0}>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>
          <button
            type="button"
            aria-label={text ? `Note${label ? ` for ${label}` : ""}: ${text}` : "No notes added"}
            className={cn(
              "inline-flex h-9 w-9 items-center justify-center rounded-full transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              text ? "text-foreground" : "text-muted-foreground/50",
            )}
          >
            <StickyNote className="h-4 w-4" />
          </button>
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content
            side="left"
            sideOffset={6}
            className="z-50 max-w-80 whitespace-pre-wrap rounded-lg border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md"
          >
            {text ?? <span className="text-muted-foreground">No notes added</span>}
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
}
