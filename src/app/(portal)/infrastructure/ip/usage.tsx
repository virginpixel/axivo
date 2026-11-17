import { cn } from "@/shared/utils";

/** How full a subnet is: recorded addresses against usable ones. */
export function SubnetUsage({ used, usable, className }: { used: number; usable: number; className?: string }) {
  const share = usable > 0 ? Math.min(1, used / usable) : 0;
  const tone = share >= 0.9 ? "bg-destructive" : share >= 0.75 ? "bg-warning" : "bg-primary";
  return (
    <div className={cn("min-w-28", className)}>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted" aria-hidden>
        <div className={cn("h-full rounded-full", tone)} style={{ width: `${Math.max(share * 100, used > 0 ? 2 : 0)}%` }} />
      </div>
      <p className="mt-1 text-[11px] tabular-nums text-muted-foreground">
        {used.toLocaleString()} of {usable.toLocaleString()} used
      </p>
    </div>
  );
}
