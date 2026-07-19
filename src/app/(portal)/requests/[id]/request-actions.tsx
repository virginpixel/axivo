"use client";

import { useState } from "react";
import { Send, UserRoundPen } from "lucide-react";
import { cancelRequestAction, completeImplementationAction } from "@/modules/requests/actions";
import {
  resendApprovalNotificationsAction,
  transferStepApproverAction,
} from "@/modules/workflow/actions";
import { useAction } from "@/shared/ui/use-action";
import { Button } from "@/shared/ui/button";
import { Input, Textarea, Select, Label, FieldError, HelperText } from "@/shared/ui/input";
import { Dialog, DialogContent, DialogTrigger } from "@/shared/ui/dialog";

/** Resend + transfer controls shown next to an active approval step. */
export function StepAdminControls({
  stepInstanceId,
  people,
}: {
  stepInstanceId: string;
  people: { id: string; name: string }[];
}) {
  const { run, loading } = useAction();
  const [transferOpen, setTransferOpen] = useState(false);
  const [personId, setPersonId] = useState("");

  return (
    <span className="flex items-center gap-0.5">
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7"
        loading={loading}
        aria-label="Resend approval email"
        title="Resend approval email"
        onClick={() =>
          run(() => resendApprovalNotificationsAction(stepInstanceId), {
            successMessage: "Approval notification resent.",
          })
        }
      >
        <Send className="h-3.5 w-3.5" />
      </Button>
      <Dialog open={transferOpen} onOpenChange={setTransferOpen}>
        <DialogTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            aria-label="Transfer to another approver"
            title="Transfer to another approver"
          >
            <UserRoundPen className="h-3.5 w-3.5" />
          </Button>
        </DialogTrigger>
        <DialogContent
          title="Transfer approval step"
          description="Pending approvers are replaced; the new approver receives a fresh secure approval email. Completed decisions remain in the history."
        >
          <Label htmlFor={`transfer-person-${stepInstanceId}`} required>New approver</Label>
          <Select
            id={`transfer-person-${stepInstanceId}`}
            value={personId}
            onChange={(event) => setPersonId(event.target.value)}
          >
            <option value="">Select a person…</option>
            {people.map((person) => (
              <option key={person.id} value={person.id}>{person.name}</option>
            ))}
          </Select>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setTransferOpen(false)}>Cancel</Button>
            <Button
              loading={loading}
              disabled={!personId}
              onClick={() =>
                run(() => transferStepApproverAction(stepInstanceId, personId), {
                  successMessage: "Step transferred; approval email sent.",
                  onSuccess: () => setTransferOpen(false),
                })
              }
            >
              Transfer step
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </span>
  );
}

export function RequestAdminActions({ requestId }: { requestId: string }) {
  const { run, loading } = useAction();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="destructive" size="sm">
          Cancel request
        </Button>
      </DialogTrigger>
      <DialogContent
        title="Cancel request"
        description="All pending items and their workflows will be cancelled. Completed items and history remain unchanged."
      >
        <Label htmlFor="cancel-reason" required>
          Cancellation reason
        </Label>
        <Textarea id="cancel-reason" value={reason} onChange={(event) => setReason(event.target.value)} />
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setOpen(false)}>
            Keep request
          </Button>
          <Button
            variant="destructive"
            loading={loading}
            disabled={!reason.trim()}
            onClick={() =>
              run(() => cancelRequestAction(requestId, reason), {
                successMessage: "Request cancelled.",
                onSuccess: () => setOpen(false),
              })
            }
          >
            Cancel request
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function ImplementationPanel({
  requestItemId,
  itemType,
  applicationName,
  requiresLicense,
  credentialFields,
  licenses,
  assets,
}: {
  requestItemId: string;
  itemType: string;
  applicationName: string | null;
  requiresLicense: boolean;
  credentialFields: { fieldName: string; isRequired: boolean; helpText: string | null }[];
  licenses: { id: string; name: string }[];
  assets: { id: string; label: string }[];
}) {
  const { run, loading, fieldErrors } = useAction();
  const [username, setUsername] = useState("");
  const [temporaryPassword, setTemporaryPassword] = useState("");
  const [licenseId, setLicenseId] = useState("");
  const [customValues, setCustomValues] = useState<Record<string, string>>({});
  const [selectedAssets, setSelectedAssets] = useState<string[]>([]);
  const [notes, setNotes] = useState("");

  async function submit() {
    await run(
      () =>
        completeImplementationAction({
          requestItemId,
          username: username || undefined,
          temporaryPassword: temporaryPassword || undefined,
          credentialFields: credentialFields
            .map((field) => ({ fieldName: field.fieldName, fieldValue: customValues[field.fieldName] ?? "" }))
            .filter((field) => field.fieldValue !== ""),
          licenseId: licenseId || undefined,
          assetIds: selectedAssets,
          notes: notes || undefined,
        }),
      { successMessage: "Implementation completed." },
    );
  }

  return (
    <div className="rounded-md border-2 border-primary/30 bg-primary/5 p-4">
      <h4 className="mb-3 text-sm font-semibold">Complete IT implementation</h4>
      <div className="space-y-3">
        {itemType === "APPLICATION" ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor={`impl-username-${requestItemId}`} required>
                  Username created in {applicationName}
                </Label>
                <Input
                  id={`impl-username-${requestItemId}`}
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                />
                <FieldError message={fieldErrors.username} />
              </div>
              <div>
                <Label htmlFor={`impl-password-${requestItemId}`}>Temporary password</Label>
                <Input
                  id={`impl-password-${requestItemId}`}
                  type="password"
                  value={temporaryPassword}
                  onChange={(event) => setTemporaryPassword(event.target.value)}
                  autoComplete="new-password"
                />
                <HelperText>
                  Delivered through a secure one-time link, never by email. Leave blank if no
                  credentials are delivered.
                </HelperText>
              </div>
            </div>
            {requiresLicense ? (
              <div>
                <Label htmlFor={`impl-license-${requestItemId}`} required>
                  License to assign
                </Label>
                <Select
                  id={`impl-license-${requestItemId}`}
                  value={licenseId}
                  onChange={(event) => setLicenseId(event.target.value)}
                >
                  <option value="">Select a license…</option>
                  {licenses.map((license) => (
                    <option key={license.id} value={license.id}>
                      {license.name}
                    </option>
                  ))}
                </Select>
                <FieldError message={fieldErrors.licenseId} />
              </div>
            ) : null}
            {credentialFields.length > 0 ? (
              <div className="grid gap-3 sm:grid-cols-2">
                {credentialFields.map((field) => (
                  <div key={field.fieldName}>
                    <Label htmlFor={`impl-cf-${requestItemId}-${field.fieldName}`} required={field.isRequired}>
                      {field.fieldName}
                    </Label>
                    <Input
                      id={`impl-cf-${requestItemId}-${field.fieldName}`}
                      value={customValues[field.fieldName] ?? ""}
                      onChange={(event) =>
                        setCustomValues((current) => ({ ...current, [field.fieldName]: event.target.value }))
                      }
                    />
                    <HelperText>{field.helpText}</HelperText>
                  </div>
                ))}
              </div>
            ) : null}
          </>
        ) : itemType === "ASSET" ? (
          <div>
            <Label required>Assets to assign</Label>
            {assets.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No available assets in this category. Add or free up assets first.
              </p>
            ) : (
              <div className="mt-1 grid max-h-48 gap-1.5 overflow-y-auto rounded-md border bg-card p-3 sm:grid-cols-2">
                {assets.map((asset) => (
                  <label key={asset.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={selectedAssets.includes(asset.id)}
                      onChange={(event) =>
                        setSelectedAssets((current) =>
                          event.target.checked
                            ? [...current, asset.id]
                            : current.filter((id) => id !== asset.id),
                        )
                      }
                      className="h-4 w-4 accent-[hsl(var(--primary))]"
                    />
                    {asset.label}
                  </label>
                ))}
              </div>
            )}
            <FieldError message={fieldErrors.assetIds} />
          </div>
        ) : null}

        <div>
          <Label htmlFor={`impl-notes-${requestItemId}`}>Implementation notes</Label>
          <Textarea
            id={`impl-notes-${requestItemId}`}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
          />
        </div>
        <Button onClick={submit} loading={loading}>
          Mark implementation complete
        </Button>
      </div>
    </div>
  );
}
