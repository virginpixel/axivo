"use client";

import { CheckCheck } from "lucide-react";
import { markInAppReadAction } from "@/modules/notifications/actions";
import { useAction } from "@/shared/ui/use-action";
import { Button } from "@/shared/ui/button";

export function MarkAllReadButton() {
  const { run, loading } = useAction();
  return (
    <Button
      variant="outline"
      size="sm"
      loading={loading}
      onClick={() => run(() => markInAppReadAction(), { successMessage: "All notifications marked as read." })}
    >
      <CheckCheck className="h-4 w-4" /> Mark all read
    </Button>
  );
}
