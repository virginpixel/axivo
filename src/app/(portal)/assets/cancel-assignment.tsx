"use client";

import { useState } from "react";
import { Ban } from "lucide-react";
import { cancelAssignmentAction } from "@/modules/assets/actions";
import { useAction } from "@/shared/ui/use-action";
import { Button } from "@/shared/ui/button";
import { Input, Label, FieldError, HelperText } from "@/shared/ui/input";
import { Dialog, DialogContent } from "@/shared/ui/dialog";

/**
 * Undo an assignment made against the wrong person. Separate from a return
 * because nothing was ever handed over: a return says somebody held the
 * equipment and gave it back, which would be untrue of them.
 */
export function CancelAssignmentDialog({
  assignmentId,
  assetName,
  open,
  onOpenChange,
}: {
  assignmentId: string;
  assetName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { run, loading, fieldErrors } = useAction();
  const [reason, setReason] = useState("");

  function submit() {
    run(() => cancelAssignmentAction(assignmentId, reason), {
      successMessage: "Assignment cancelled.",
      onSuccess: () => {
        setReason("");
        onOpenChange(false);
      },
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={`Cancel assignment of ${assetName}`}
        description="For an assignment made against the wrong person, where the equipment never changed hands. It is removed from their record; the asset keeps the correction in its own history."
      >
        <div className="space-y-3">
          <div>
            <Label htmlFor={`cancel-reason-${assignmentId}`} required>Reason</Label>
            <Input
              id={`cancel-reason-${assignmentId}`}
              value={reason}
              placeholder="e.g. assigned to the wrong employee"
              onChange={(event) => setReason(event.target.value)}
            />
            <FieldError message={fieldErrors.reason} />
            <HelperText>
              Recorded in the audit trail. If an acknowledgement form was already sent for this
              assignment, it is cancelled too and its link stops working.
            </HelperText>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Keep assignment</Button>
            <Button variant="destructive" loading={loading} disabled={!reason.trim()} onClick={submit}>
              Cancel assignment
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Icon trigger + dialog, for tables that list assignments directly. */
export function CancelAssignmentButton({
  assignmentId,
  assetName,
}: {
  assignmentId: string;
  assetName: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        aria-label="Cancel assignment"
        title="Cancel assignment (assigned in error)"
        onClick={() => setOpen(true)}
      >
        <Ban className="h-4 w-4" />
      </Button>
      <CancelAssignmentDialog
        assignmentId={assignmentId}
        assetName={assetName}
        open={open}
        onOpenChange={setOpen}
      />
    </>
  );
}
