"use client";

import { useState } from "react";
import { numberToIp } from "@/modules/infrastructure/ip-math";
import { cn } from "@/shared/utils";

export interface MapEntry {
  n: number;
  name: string | null;
  mac: string | null;
  reserved: boolean;
  /** Found by an ARP read or import but not seen for 30 days. */
  stale: boolean;
  /** "Seen 18 Nov 2026", formatted on the server. */
  seen: string | null;
}

/**
 * One square per address: used, reserved, gateway, network/broadcast, not
 * seen lately, or free. Pointing at a square (or tapping it) shows its IP and
 * what is known about it straight away.
 */
export function AddressMap({
  start, size, prefix, gateway, entries,
}: {
  start: number;
  size: number;
  prefix: number;
  gateway: number | null;
  entries: MapEntry[];
}) {
  const byNumber = new Map(entries.map((e) => [e.n, e]));
  const [hover, setHover] = useState<{ n: number; x: number; y: number } | null>(null);
  const perRow = size >= 256 ? 32 : Math.min(size, 16);
  const rows = Math.ceil(size / perRow);

  const describe = (n: number) => {
    if (prefix < 31 && n === start) return "Network address";
    if (prefix < 31 && n === start + size - 1) return "Broadcast address";
    if (n === gateway) return "Gateway";
    const entry = byNumber.get(n);
    if (!entry) return "Free";
    return entry.reserved ? "Reserved" : entry.stale ? "Not seen for 30 days" : "Used";
  };
  const shown = hover ? byNumber.get(hover.n) : null;

  return (
    <div data-map className="relative" onMouseLeave={() => setHover(null)}>
      <div className="space-y-[3px]">
        {Array.from({ length: rows }, (_, r) => (
          <div key={r} className="flex items-center gap-2">
            <span className="w-20 shrink-0 font-mono text-[10px] text-muted-foreground tabular-nums sm:w-24">{numberToIp(start + r * perRow)}</span>
            {/* Squares shrink to fit the card, up to 18px each. */}
            <div className="grid min-w-0 flex-1 gap-[3px]" style={{ gridTemplateColumns: `repeat(${perRow}, minmax(0, 18px))` }}>
              {Array.from({ length: Math.min(perRow, size - r * perRow) }, (_, c) => {
                const n = start + r * perRow + c;
                const edge = prefix < 31 && (n === start || n === start + size - 1);
                const entry = byNumber.get(n);
                const state = edge ? "edge" : n === gateway ? "gateway" : entry ? (entry.reserved ? "reserved" : entry.stale ? "stale" : "used") : "free";
                const show = (event: React.SyntheticEvent<HTMLButtonElement>) => {
                  const cell = event.currentTarget.getBoundingClientRect();
                  const box = event.currentTarget.closest("[data-map]")!.getBoundingClientRect();
                  setHover({ n, x: cell.left - box.left + cell.width / 2, y: cell.top - box.top });
                };
                return (
                  <button
                    key={c}
                    type="button"
                    aria-label={`${numberToIp(n)}: ${describe(n)}`}
                    onMouseEnter={show}
                    onFocus={show}
                    onClick={show}
                    className={cn(
                      "aspect-square w-full rounded-[3px] outline-none ring-offset-1 ring-offset-card focus-visible:ring-2 focus-visible:ring-ring",
                      hover?.n === n && "ring-2 ring-foreground/60",
                      state === "edge" && "bg-muted-foreground/25",
                      state === "gateway" && "bg-warning",
                      state === "used" && "bg-primary",
                      state === "stale" && "bg-primary/30",
                      state === "reserved" && "border-2 border-info bg-info/20",
                      state === "free" && "border border-border bg-muted/40",
                    )}
                  />
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <div className="pointer-events-none absolute inset-0">
        {hover ? (
          <div
            role="status"
            className="absolute z-10 w-max max-w-64 -translate-x-1/2 -translate-y-full rounded-lg border bg-popover px-2.5 py-1.5 text-xs text-popover-foreground shadow-md"
            style={{ left: hover.x, top: hover.y - 6 }}
          >
            <p className="font-mono text-[13px] font-semibold">{numberToIp(hover.n)}</p>
            <p className="text-muted-foreground">{describe(hover.n)}</p>
            {shown?.name ? <p className="font-medium">{shown.name}</p> : null}
            {shown?.mac ? <p className="font-mono text-[11px] text-muted-foreground">{shown.mac}</p> : null}
            {shown?.seen ? <p className="text-[11px] text-muted-foreground">{shown.seen}</p> : null}
          </div>
        ) : null}
      </div>
      <div className="mt-3 flex flex-wrap gap-4 text-xs text-muted-foreground">
        <Legend className="bg-primary" label="Used" />
        <Legend className="bg-primary/30" label="Not seen for 30 days" />
        <Legend className="border-2 border-info bg-info/20" label="Reserved" />
        <Legend className="bg-warning" label="Gateway" />
        <Legend className="border border-border bg-muted/40" label="Free" />
        <Legend className="bg-muted-foreground/25" label="Network / broadcast" />
      </div>
    </div>
  );
}

function Legend({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn("h-3 w-3 rounded-[3px]", className)} /> {label}
    </span>
  );
}
