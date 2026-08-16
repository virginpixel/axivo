import Link from "next/link";
import { cn } from "@/shared/utils";

/**
 * A single filter chip rendered as a link. Selecting a value is a navigation,
 * not a form submit, so the whole "pick from a dropdown then press Filter"
 * step collapses into one tap on the value itself.
 */
export function CompanyPill({
  href,
  label,
  active,
}: {
  href: string;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "true" : undefined}
      className={cn(
        "inline-flex items-center rounded-full border px-4 py-1.5 text-sm font-medium transition-colors",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-input bg-card text-foreground hover:border-primary/40 hover:bg-accent hover:text-accent-foreground",
      )}
    >
      {label}
    </Link>
  );
}
