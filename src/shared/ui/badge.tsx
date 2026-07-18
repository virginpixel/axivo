import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/shared/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
  {
    variants: {
      variant: {
        default: "bg-muted text-muted-foreground",
        primary: "bg-primary/10 text-primary",
        success: "bg-success/10 text-success",
        warning: "bg-warning/10 text-warning",
        destructive: "bg-destructive/10 text-destructive",
        info: "bg-info/10 text-info",
        outline: "border text-foreground",
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
  SUSPENDED: "warning",
  REMOVED: "default",
  EXPIRED: "destructive",
  EXPIRING: "warning",
  RENEWED: "success",
  TERMINATED: "default",
  ARCHIVED: "default",
  DISCARDED: "default",
  DRAFT: "default",
  PUBLISHED: "success",
  UNDER_REPAIR: "warning",
  OUT_OF_ORDER: "destructive",
  RESERVED: "info",
  RETIRED: "default",
  ON_LEAVE: "warning",
  RESIGNED: "default",
  QUEUED: "info",
  SENDING: "info",
  FAILED: "destructive",
  REVOKED: "destructive",
  MISSING: "destructive",
  DAMAGED: "warning",
  RECEIVED: "success",
  SCHEDULED: "info",
};

export function StatusBadge({ status }: { status: string }) {
  const variant = STATUS_VARIANTS[status] ?? "default";
  const label = status
    .toLowerCase()
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
  return <Badge variant={variant}>{label}</Badge>;
}
