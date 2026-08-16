import * as React from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/shared/utils";

/** Standard page structure per SDS Doc 03 Ch3: title, back link, actions, filters, content, pagination. */

export function PageHeader({
  title,
  description,
  breadcrumbs,
  backHref,
  backLabel,
  actions,
}: {
  title: string;
  description?: string;
  /**
   * Legacy trail. Detail pages passed a parent-then-self crumb list; we now
   * render a single "Back to {parent}" link derived from the nearest linked
   * crumb, so those call sites keep working without change.
   */
  breadcrumbs?: { label: string; href?: string }[];
  /** Explicit back target; overrides anything derived from breadcrumbs. */
  backHref?: string;
  backLabel?: string;
  actions?: React.ReactNode;
}) {
  const derived = (() => {
    if (backHref) return { href: backHref, label: backLabel ?? "Back" };
    const linked = (breadcrumbs ?? []).filter((crumb) => crumb.href);
    const parent = linked[linked.length - 1];
    return parent?.href ? { href: parent.href, label: parent.label } : null;
  })();

  return (
    <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {derived ? (
          <Link
            href={derived.href}
            className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-primary"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden /> Back to {derived.label}
          </Link>
        ) : null}
        <h1 className="font-display text-4xl font-normal tracking-tight">{title}</h1>
        {description ? (
          <p className="mt-2 max-w-[72ch] text-base leading-relaxed text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function Pagination({
  page,
  pageCount,
  total,
  buildHref,
}: {
  page: number;
  pageCount: number;
  total: number;
  buildHref: (page: number) => string;
}) {
  if (pageCount <= 1) {
    return <p className="mt-3 text-xs tabular-nums text-muted-foreground">{total} record(s)</p>;
  }
  return (
    <div className="mt-3 flex items-center justify-between text-sm">
      <p className="text-xs tabular-nums text-muted-foreground">
        Page {page} of {pageCount} · {total} record(s)
      </p>
      <div className="flex gap-1">
        <PaginationLink href={buildHref(page - 1)} disabled={page <= 1}>
          Previous
        </PaginationLink>
        <PaginationLink href={buildHref(page + 1)} disabled={page >= pageCount}>
          Next
        </PaginationLink>
      </div>
    </div>
  );
}

function PaginationLink({
  href,
  disabled,
  children,
}: {
  href: string;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  if (disabled) {
    return (
      <span className="cursor-not-allowed rounded-full border border-input px-4 py-1.5 text-xs text-muted-foreground opacity-45">
        {children}
      </span>
    );
  }
  return (
    <Link
      href={href}
      className="rounded-full border border-input bg-card px-4 py-1.5 text-xs font-medium transition-colors hover:border-primary/40 hover:bg-accent hover:text-accent-foreground"
    >
      {children}
    </Link>
  );
}

export function StatCard({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  tone?: "default" | "success" | "warning" | "destructive" | "info";
}) {
  // Tone colors the figure only. The tile itself stays quiet, so a wall of
  // them still reads as one row and the one that matters stands out.
  const toneClass = {
    default: "text-foreground",
    success: "text-success",
    warning: "text-warning",
    destructive: "text-destructive",
    info: "text-info",
  }[tone];
  return (
    <div className="group h-full rounded-2xl border bg-card px-5 py-4 transition-colors hover:border-primary/40">
      <p className="label-caps text-muted-foreground transition-colors group-hover:text-foreground">{label}</p>
      <p className={cn("mt-2 font-display text-4xl font-normal tabular-nums leading-none", toneClass)}>
        {value}
      </p>
      {hint ? <p className="mt-1.5 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
