"use client";

import { useState } from "react";
import { ShieldCheck } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/shared/ui/dialog";

export interface HandoverSignature {
  signerName: string;
  employeeId: string;
  acknowledgedAt: string | null;
  ip: string | null;
  userAgent: string | null;
  termsVersion: string | null;
  hash: string | null;
}

/**
 * Evidence behind an electronic acknowledgement: who signed, when, from where,
 * which version of the terms they saw, and the hash of the exact signed content.
 * Re-hashing that content and comparing it to this value proves the record has
 * not changed since it was signed.
 */
export function SignatureDetails({ signature }: { signature: HandoverSignature }) {
  const [open, setOpen] = useState(false);

  const rows: { label: string; value: string; mono?: boolean }[] = [
    { label: "Signed by", value: `${signature.signerName} (${signature.employeeId})` },
    { label: "Identity confirmed with", value: "Employee ID entered by signer" },
    { label: "Signed on", value: signature.acknowledgedAt ?? "Not recorded" },
    { label: "IP address", value: signature.ip ?? "Not recorded", mono: true },
    { label: "Device", value: signature.userAgent ?? "Not recorded" },
    { label: "Terms version", value: signature.termsVersion ?? "Not recorded" },
    { label: "Verification hash (SHA-256)", value: signature.hash ?? "Not recorded", mono: true },
  ];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Signature details" title="Signature details">
          <ShieldCheck className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent
        title="Signature details"
        description="Recorded when the employee acknowledged this handover."
      >
        <dl className="space-y-3 text-sm">
          {rows.map((row) => (
            <div key={row.label}>
              <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {row.label}
              </dt>
              <dd className={`mt-0.5 break-all ${row.mono ? "font-register text-xs" : ""}`}>
                {row.value}
              </dd>
            </div>
          ))}
        </dl>
      </DialogContent>
    </Dialog>
  );
}
