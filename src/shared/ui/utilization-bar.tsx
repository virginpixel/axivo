import { cn } from "@/shared/utils";

/**
 * Seat utilisation meter (SDS Doc 10 Ch5). A number alone makes you do the
 * arithmetic; the bar answers "is this licence nearly full?" at a glance, and
 * the tone answers "do I need to buy more?" without reading anything at all.
 *
 * Tone is driven by seats left rather than by percentage: a 40-seat licence
 * with two seats free is the same problem as a 400-seat licence with two free,
 * even though the percentages look nothing alike.
 */
export function UtilizationBar({
  used,
  total,
  className,
}: {
  used: number;
  total: number;
  className?: string;
}) {
  if (total <= 0) {
    // Nothing paid for, but seats can still be held: a lapsed licence keeps its
    // assignments until somebody takes them off. Saying only "no seats
    // purchased" would hide the people still holding one.
    const stranded = used > 0;
    return (
      <div className={cn("min-w-32", className)}>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          {stranded ? <div className="h-full w-full rounded-full bg-destructive" /> : null}
        </div>
        <p
          className={cn(
            "mt-1 text-micro font-medium",
            stranded ? "text-destructive" : "text-muted-foreground",
          )}
        >
          {stranded ? `${used} assigned · no seats in force` : "No seats purchased"}
        </p>
      </div>
    );
  }

  const percent = (used / total) * 100;
  const remaining = total - used;
  // Over-allocation happens without anybody doing anything: a term ends, the
  // seats it paid for drop away, and assignments that were fine yesterday are
  // suddenly beyond what is owned. "No seats left" understated that badly, so
  // the number says how far over.
  const over = used - total;
  const tone =
    remaining <= 0 ? "destructive" : remaining <= Math.max(2, total * 0.05) ? "warning" : "primary";

  const barClass = {
    primary: "bg-primary",
    warning: "bg-warning",
    destructive: "bg-destructive",
  }[tone];
  const textClass = {
    primary: "text-muted-foreground",
    warning: "text-warning",
    destructive: "text-destructive",
  }[tone];

  return (
    <div className={cn("min-w-32", className)}>
      <div
        className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
        role="meter"
        aria-valuenow={Math.round(percent)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${used} of ${total} seats assigned${over > 0 ? `, ${over} over` : ""}`}
      >
        <div
          className={cn("h-full rounded-full transition-[width]", barClass)}
          // Over-allocation would otherwise draw past the end of the track.
          style={{ width: `${Math.min(100, percent)}%` }}
        />
      </div>
      <p className={cn("mt-1 text-micro font-medium tabular-nums", textClass)}>
        {percent.toFixed(1)}%
        {over > 0
          ? ` · ${over} over`
          : remaining === 0
            ? " · no seats left"
            : remaining <= Math.max(2, total * 0.05)
              ? ` · ${remaining} left`
              : ""}
      </p>
    </div>
  );
}
