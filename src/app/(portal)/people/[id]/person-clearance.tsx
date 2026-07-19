"use client";

import { ClipboardCheck, Undo2 } from "lucide-react";
import { startClearanceAction, returnAssetAction } from "@/modules/assets/actions";
import { useAction } from "@/shared/ui/use-action";
import { Button } from "@/shared/ui/button";

/** Clearance entry point on the employee profile (SDS Doc 11 Ch7). */
export function StartClearanceButton({ personId }: { personId: string }) {
  const { run, loading } = useAction();
  return (
    <Button
      variant="outline"
      size="sm"
      loading={loading}
      onClick={() =>
        run(() => startClearanceAction(personId), {
          successMessage: "Clearance started — verify each assignment below.",
        })
      }
    >
      <ClipboardCheck className="h-4 w-4" /> Start clearance
    </Button>
  );
}

export function ReturnAssetButton({ assignmentId }: { assignmentId: string }) {
  const { run, loading } = useAction();
  return (
    <Button
      variant="ghost"
      size="icon"
      loading={loading}
      aria-label="Return asset"
      title="Return asset"
      onClick={() => run(() => returnAssetAction(assignmentId), { successMessage: "Asset returned." })}
    >
      <Undo2 className="h-4 w-4" />
    </Button>
  );
}
