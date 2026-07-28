"use client";

import { useState } from "react";
import { KeyRound, Send } from "lucide-react";
import { resendCredentialDeliveryAction } from "@/modules/requests/actions";
import { sendHandoverAction } from "@/modules/assets/actions";
import { useAction } from "@/shared/ui/use-action";
import { Button } from "@/shared/ui/button";
import { Input, Label, HelperText, FieldError } from "@/shared/ui/input";
import { Dialog, DialogContent } from "@/shared/ui/dialog";

/**
 * Resend a credential or handover acknowledgement email after implementation,
 * optionally to a one-off address (the employee profile is left unchanged).
 *
 * For credentials the stored temporary password can only be re-sent while it is
 * still encrypted, unexpired and unviewed (SDS 08 Ch6). Once the employee has
 * opened the link, or the window lapsed, the secret is gone, so the dialog
 * switches to asking IT for a fresh temporary password instead. secretResendable
 * tells the button which of the two cases it is in.
 */
export function ResendAckButton({
  kind,
  targetId,
  defaultEmail,
  label = "Resend email",
  secretResendable = true,
}: {
  kind: "credential" | "handover";
  targetId: string;
  defaultEmail: string;
  label?: string;
  secretResendable?: boolean;
}) {
  const { run, loading, fieldErrors } = useAction();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [secret, setSecret] = useState("");

  const needsNewSecret = kind === "credential" && !secretResendable;
  const buttonLabel = needsNewSecret && label ? "Send new password" : label;
  const Icon = needsNewSecret ? KeyRound : Send;

  return (
    <>
      <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs" onClick={() => setOpen(true)}>
        <Icon className="h-3.5 w-3.5" /> {buttonLabel}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          title={needsNewSecret ? "Send a new temporary password" : "Resend acknowledgement email"}
          description={
            needsNewSecret
              ? "The stored temporary password has expired or was already viewed, so it cannot be sent again. Reset the password in the application, then enter the new one here."
              : "Sends a fresh secure link with the stored temporary password. Leave the address blank to use the employee's profile email."
          }
        >
          <div className="space-y-3">
            {needsNewSecret ? (
              <div>
                <Label htmlFor={`resend-secret-${targetId}`}>New temporary password</Label>
                <Input
                  id={`resend-secret-${targetId}`}
                  type="text"
                  value={secret}
                  autoComplete="off"
                  onChange={(event) => setSecret(event.target.value)}
                />
                <FieldError message={fieldErrors.newSecret} />
                <HelperText>
                  Encrypted and shown once through the secure link, then discarded. Axivo never keeps it in readable form.
                </HelperText>
              </div>
            ) : null}
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
                disabled={needsNewSecret && secret.trim().length === 0}
                onClick={() =>
                  run(
                    () =>
                      kind === "credential"
                        ? resendCredentialDeliveryAction(
                            targetId,
                            needsNewSecret ? secret : undefined,
                            email.trim() || undefined,
                          )
                        : sendHandoverAction(targetId, email.trim() || undefined),
                    {
                      successMessage: email.trim() ? `Email sent to ${email.trim()}.` : "Email resent.",
                      onSuccess: () => {
                        setEmail("");
                        setSecret("");
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
