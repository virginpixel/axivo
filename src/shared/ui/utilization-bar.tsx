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
    return (
      <div className={cn("min-w-32", className)}>
        <div className="h-1.5 w-full rounded-full bg-muted" />
        <p className="mt-1 text-micro text-muted-foreground">No seats purchased</p>
      </div>
    );
  }

  const percent = (used / total) * 100;
  const remaining = total - used;
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
        aria-label={`${used} of ${total} seats assigned`}
      >
        <div
          className={cn("h-full rounded-full transition-[width]", barClass)}
          // Over-allocation would otherwise draw past the end of the track.
          style={{ width: `${Math.min(100, percent)}%` }}
        />
      </div>
      <p className={cn("mt-1 text-micro font-medium tabular-nums", textClass)}>
        {percent.toFixed(1)}%
        {remaining <= 0
          ? " · no seats left"
          : remaining <= Math.max(2, total * 0.05)
            ? ` · ${remaining} left`
            : ""}
      </p>
    </div>
  );
}
