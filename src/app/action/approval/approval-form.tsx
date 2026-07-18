"use client";

import { useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { tokenApprovalAction } from "@/modules/workflow/actions";
import { Button } from "@/shared/ui/button";
import { Textarea, Label, FieldError } from "@/shared/ui/input";
import { useToast } from "@/shared/ui/toast";

type Decision = "APPROVED" | "REJECTED" | "CORRECTION_REQUESTED";

export function ApprovalActionForm({ token }: { token: string }) {
  const { toast } = useToast();
  const [decision, setDecision] = useState<Decision | null>(null);
  const [comments, setComments] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);
  const [completed, setCompleted] = useState<Decision | null>(null);

  async function submit() {
    if (!decision) return;
    if ((decision === "REJECTED" || decision === "CORRECTION_REQUESTED") && !comments.trim()) {
      setError("Comments are required when rejecting or requesting a correction.");
      return;
    }
    setError(undefined);
    setLoading(true);
    try {
      const result = await tokenApprovalAction(token, {
        action: decision,
        comments: comments.trim() || undefined,
      });
      if (result.ok) {
        setCompleted(decision);
      } else {
        toast("error", result.error);
        setError(result.fieldErrors?.comments);
      }
    } catch {
      toast("error", "An unexpected error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (completed) {
    const message =
      completed === "APPROVED"
        ? "Your approval has been recorded. The request moves to the next step automatically."
        : completed === "REJECTED"
          ? "Your rejection has been recorded. The requester will be notified."
          : "Your correction request has been recorded. The requester will be asked to correct this item.";
    return (
      <div className="rounded-md bg-success/10 p-6 text-center">
        <CheckCircle2 className="mx-auto h-8 w-8 text-success" aria-hidden />
        <p className="mt-2 text-sm font-medium">{message}</p>
        <p className="mt-1 text-xs text-muted-foreground">You may close this page.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 border-t pt-4">
      <div role="radiogroup" aria-label="Decision" className="grid gap-2 sm:grid-cols-3">
        <DecisionButton
          current={decision}
          value="APPROVED"
          label="Approve"
          tone="success"
          onSelect={setDecision}
        />
        <DecisionButton
          current={decision}
          value="CORRECTION_REQUESTED"
          label="Request correction"
          tone="warning"
          onSelect={setDecision}
        />
        <DecisionButton
          current={decision}
          value="REJECTED"
          label="Reject"
          tone="destructive"
          onSelect={setDecision}
        />
      </div>
      <div>
        <Label htmlFor="comments" required={decision === "REJECTED" || decision === "CORRECTION_REQUESTED"}>
          Comments
        </Label>
        <Textarea
          id="comments"
          value={comments}
          onChange={(event) => setComments(event.target.value)}
          placeholder={
            decision === "APPROVED"
              ? "Optional comments"
              : "Explain your decision (required for rejection and correction requests)"
          }
        />
        <FieldError message={error} />
      </div>
      <Button onClick={submit} disabled={!decision} loading={loading} className="w-full">
        Submit decision
      </Button>
    </div>
  );
}

function DecisionButton({
  current,
  value,
  label,
  tone,
  onSelect,
}: {
  current: Decision | null;
  value: Decision;
  label: string;
  tone: "success" | "warning" | "destructive";
  onSelect: (decision: Decision) => void;
}) {
  const selected = current === value;
  const toneClasses = {
    success: selected ? "border-success bg-success/10 text-success" : "hover:border-success/60",
    warning: selected ? "border-warning bg-warning/10 text-warning" : "hover:border-warning/60",
    destructive: selected ? "border-destructive bg-destructive/10 text-destructive" : "hover:border-destructive/60",
  }[tone];
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={() => onSelect(value)}
      className={`rounded-md border-2 px-4 py-3 text-sm font-medium transition-colors ${toneClasses}`}
    >
      {label}
    </button>
  );
}
