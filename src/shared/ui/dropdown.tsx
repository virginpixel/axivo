"use client";

import { useEffect, useRef, useState } from "react";
import { MoreHorizontal } from "lucide-react";
import { cn } from "@/shared/utils";

/**
 * A small "kebab" (three-dot) actions menu. Consolidates a row's actions into
 * one control so tables stay clean. Closes on outside click, Escape, or when
 * any item inside is activated.
 */
export function ActionMenu({
  label = "Actions",
  align = "right",
  children,
}: {
  label?: string;
  align?: "left" | "right";
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative inline-block text-left">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        onClick={() => setOpen((value) => !value)}
        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/25"
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>
      {open ? (
        <div
          role="menu"
          className={cn(
            "absolute z-50 mt-1 min-w-[11rem] rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md",
            align === "right" ? "right-0" : "left-0",
          )}
          // Any activation inside bubbles here and dismisses the menu.
          onClick={() => setOpen(false)}
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}

/** A single item inside an {@link ActionMenu}. */
export function ActionMenuItem({
  onClick,
  icon,
  tone = "default",
  children,
}: {
  onClick: () => void;
  icon?: React.ReactNode;
  tone?: "default" | "destructive";
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-sm px-2.5 py-1.5 text-left text-sm transition-colors",
        tone === "destructive"
          ? "text-destructive hover:bg-destructive/10"
          : "hover:bg-accent hover:text-accent-foreground",
      )}
    >
      {icon ? <span className="shrink-0 opacity-80">{icon}</span> : null}
      {children}
    </button>
  );
}
