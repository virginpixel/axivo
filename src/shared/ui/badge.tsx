import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/shared/utils";

/*
 * Status chip. A tinted ground plus a hairline in the same hue reads as a
 * discrete piece of state at a glance, where flat colored text does not.
 */
const badgeVariants = cva(
  "inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold leading-5",
  {
    variants: {
      variant: {
        default: "bg-muted text-muted-foreground",
        primary: "bg-primary/15 text-primary",
        success: "bg-success/20 text-success",
        warning: "bg-warning/20 text-warning",
        destructive: "bg-destructive/15 text-destructive",
        info: "bg-info/20 text-info",
        outline: "border border-input text-foreground",
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
