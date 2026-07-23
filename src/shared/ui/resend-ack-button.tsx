"use client";

import { useState } from "react";
import { Send } from "lucide-react";
import { resendCredentialDeliveryAction } from "@/modules/requests/actions";
import { sendHandoverAction } from "@/modules/assets/actions";
import { useAction } from "@/shared/ui/use-action";
import { Button } from "@/shared/ui/button";
import { Input, Label, HelperText } from "@/shared/ui/input";
import { Dialog, DialogContent } from "@/shared/ui/dialog";

/**
 * Resend a credential or handover acknowledgement email after implementation,
 * optionally to a one-off address (the employee profile is left unchanged).
 */
export function ResendAckButton({
  kind,
  targetId,
  defaultEmail,
  label = "Resend email",
}: {
  kind: "credential" | "handover";
  targetId: string;
  defaultEmail: string;
  label?: string;
}) {
  const { run, loading } = useAction();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");

  return (
    <>
      <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs" onClick={() => setOpen(true)}>
        <Send className="h-3.5 w-3.5" /> {label}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          title="Resend acknowledgement email"
          description="Sends a fresh secure link. Leave the address blank to use the employee's profile email."
        >
          <div className="space-y-3">
            <div>
              <Label htmlFor={`resend-email-${targetId}`}>Send to</Label>
              <Input
                id={`resend-email-${targetId}`}
                type="email"
                value={email}
                placeholder={defaultEmail}
                onChange={(event) => setEmail(event.target.value)}
              />
              <HelperText>A different address is used just for this email; the profile keeps {defaultEmail}.</HelperText>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button
                loading={loading}
                onClick={() =>
                  run(
                    () =>
                      kind === "credential"
                        ? resendCredentialDeliveryAction(targetId, undefined, email.trim() || undefined)
                        : sendHandoverAction(targetId, email.trim() || undefined),
                    {
                      successMessage: email.trim() ? `Email sent to ${email.trim()}.` : "Email resent.",
                      onSuccess: () => {
                        setEmail("");
                        setOpen(false);
                      },
                    },
                  )
                }
              >
                Send
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

