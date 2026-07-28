import * as React from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "@/shared/utils";

/** Standard page structure per SDS Doc 03 Ch3: title, breadcrumb, actions, filters, content, pagination. */

export function PageHeader({
  title,
  description,
  breadcrumbs,
  actions,
}: {
  title: string;
  description?: string;
  breadcrumbs?: { label: string; href?: string }[];
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-3 border-b pb-5 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {breadcrumbs && breadcrumbs.length > 0 ? (
          <nav aria-label="Breadcrumb" className="mb-1.5 flex items-center gap-1 text-xs text-muted-foreground">
            {breadcrumbs.map((crumb, index) => (
              <React.Fragment key={`${crumb.label}-${index}`}>
                {index > 0 ? <ChevronRight className="h-3 w-3 opacity-50" aria-hidden /> : null}
                {crumb.href ? (
                  <Link href={crumb.href} className="transition-colors hover:text-primary">
                    {crumb.label}
                  </Link>
                ) : (
                  <span>{crumb.label}</span>
                )}
              </React.Fragment>
            ))}
          </nav>
        ) : null}
        <h1 className="text-3xl font-semibold tracking-[-0.015em]">{title}</h1>
        {description ? (
          <p className="mt-1.5 max-w-[70ch] text-sm leading-relaxed text-muted-foreground">{description}</p>
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
      <span className="cursor-not-allowed rounded-md border border-input px-3 py-1.5 text-xs text-muted-foreground opacity-45">
        {children}
      </span>
    );
  }
  return (
    <Link
      href={href}
      className="rounded-md border border-input bg-card px-3 py-1.5 text-xs font-medium transition-colors hover:border-primary/40 hover:bg-accent hover:text-accent-foreground"
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
    <div className="group h-full rounded-lg border bg-card px-4 py-3.5 transition-colors hover:border-primary/40">
      <p className="label-caps text-muted-foreground transition-colors group-hover:text-foreground">{label}</p>
      <p className={cn("mt-1.5 font-display text-3xl font-semibold tabular-nums leading-none", toneClass)}>
        {value}
      </p>
      {hint ? <p className="mt-1.5 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
