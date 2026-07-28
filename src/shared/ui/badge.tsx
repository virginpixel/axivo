import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/shared/utils";

/*
 * Status chip. A tinted ground plus a hairline in the same hue reads as a
 * discrete piece of state at a glance, where flat colored text does not.
 */
const badgeVariants = cva(
  "inline-flex items-center whitespace-nowrap rounded-full border px-2 py-px text-xs font-medium leading-5",
  {
    variants: {
      variant: {
        default: "border-border bg-muted text-muted-foreground",
        primary: "border-primary/25 bg-primary/10 text-primary",
        success: "border-success/25 bg-success/10 text-success",
        warning: "border-warning/30 bg-warning/10 text-warning",
        destructive: "border-destructive/25 bg-destructive/10 text-destructive",
        info: "border-info/25 bg-info/10 text-info",
        outline: "border-input text-foreground",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export function Badge({
  className,
  variant,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

/** Standardized status badge colors (SDS Doc 03 Ch8). */
const STATUS_VARIANTS: Record<string, VariantProps<typeof badgeVariants>["variant"]> = {
  // Generic
  NEW: "info",
  PENDING: "warning",
  PENDING_APPROVAL: "warning",
  WAITING_APPROVAL: "warning",
  IN_PROGRESS: "info",
  SUBMITTED: "info",
  APPROVED: "success",
  ACTIVE: "success",
  COMPLETED: "success",
  IMPLEMENTED: "success",
  ACKNOWLEDGED: "success",
  DELIVERED: "info",
  AVAILABLE: "success",
  ASSIGNED: "primary",
  RETURNED: "default",
  REJECTED: "destructive",
  CANCELLED: "default",
  CORRECTION_REQUESTED: "warning",
  IMPLEMENTATION_PENDING: "info",
  PENDING_ACKNOWLEDGEMENT: "warning",
  SUSPENDED: "warning",
  REMOVED: "default",
  EXPIRED: "destructive",
  EXPIRING: "warning",
  RENEWED: "success",
  TERMINATED: "destructive",
  ARCHIVED: "default",
  DISCARDED: "default",
  DRAFT: "default",
  PUBLISHED: "success",
  UNDER_REPAIR: "warning",
  OUT_OF_ORDER: "destructive",
  RESERVED: "info",
  RETIRED: "default",
  ON_LEAVE: "warning",
  RESIGNED: "destructive",
  QUEUED: "info",
  SENDING: "info",
  FAILED: "destructive",
  REVOKED: "destructive",
  MISSING: "destructive",
  DAMAGED: "warning",
  RECEIVED: "success",
  SCHEDULED: "info",
};

export function StatusBadge({ status, label }: { status: string; label?: string }) {
  const variant = STATUS_VARIANTS[status] ?? "default";
  const text =
    label ??
    status
      .toLowerCase()
      .split("_")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  return <Badge variant={variant}>{text}</Badge>;
}
