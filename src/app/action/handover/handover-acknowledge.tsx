"use client";

import { useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { acknowledgeHandoverAction } from "@/modules/requests/actions";
import { Button } from "@/shared/ui/button";
import { Input, Label } from "@/shared/ui/input";

export function HandoverAcknowledge({ token, signerName }: { token: string; signerName: string }) {
  const [loading, setLoading] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [employeeId, setEmployeeId] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ready = confirmed && employeeId.trim().length > 0;

  async function acknowledge() {
    setLoading(true);
    setError(null);
    try {
      const result = await acknowledgeHandoverAction(token, employeeId.trim());
      if (result.ok) setDone(true);
      else setError(result.error);
    } catch {
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <div className="rounded-md bg-success/10 p-6 text-center">
        <CheckCircle2 className="mx-auto h-8 w-8 text-success" aria-hidden />
        <p className="mt-2 text-sm font-medium">
          Handover acknowledged. A copy is stored in your employee record.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(event) => setConfirmed(event.target.checked)}
          className="mt-0.5 h-4 w-4 accent-[hsl(var(--primary))]"
        />
        {/* One span, so the sentence stays a single flowing text block: as bare
            children of the flex label, each text node and <strong> became its
            own column and the name broke out of the sentence. */}
        <span>
          I confirm that I, <strong className="font-semibold">{signerName}</strong>, have received
          the assets listed above and accept the terms of responsibility. Entering my employee ID
          below and acknowledging serves as my electronic signature for this receipt.
        </span>
      </label>
      <div>
        <Label htmlFor="ack-employee-id" required>Enter your employee ID to confirm your identity</Label>
        <Input
          id="ack-employee-id"
          value={employeeId}
          onChange={(event) => setEmployeeId(event.target.value)}
          autoComplete="off"
          placeholder="Your employee ID"
        />
      </div>
      {error ? (
        <p className="rounded-md bg-destructive/10 px-4 py-2 text-sm text-destructive">{error}</p>
      ) : null}
      <Button className="w-full" size="lg" disabled={!ready} loading={loading} onClick={acknowledge}>
        Acknowledge receipt
      </Button>
    </div>
  );
}
