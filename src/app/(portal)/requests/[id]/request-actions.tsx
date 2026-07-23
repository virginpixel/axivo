"use client";

import { useState } from "react";
import { Send, UserRoundPen, UserPlus, CircleAlert } from "lucide-react";
import {
  cancelRequestAction,
  completeImplementationAction,
  createRequestedForPersonAction,
} from "@/modules/requests/actions";
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
            {/* A seat is taken from the application's linked license on its own.
                Only an app with several linked licenses needs a choice here. */}
            {requiresLicense ? (
              <div>
                {licenses.length === 1 ? (
                  <>
                    <Label>License to assign</Label>
                    <p className="text-sm">
                      A seat is assigned automatically from <strong>{licenses[0]?.name}</strong>.
                    </p>
                    <FieldError message={fieldErrors.licenseId} />
                  </>
                ) : licenses.length === 0 ? (
                  <>
                    <Label>License to assign</Label>
                    <p className="text-sm text-destructive">
                      This application requires a license but none is linked to it in this company.
                      Link one on the application page before implementing.
                    </p>
                  </>
                ) : (
                  <>
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
                    <HelperText>This application has more than one license linked.</HelperText>
                    <FieldError message={fieldErrors.licenseId} />
                  </>
                )}
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

/**
 * Shows which employee an approved item will be assigned to at implementation.
 * The People record is resolved from the requested-for company + employee ID;
 * when it does not exist yet it can be created straight from the request.
 */
export function RequestedForResolution({
  requestId,
  personId,
  personName,
  requestedForName,
  requestedForEmployeeId,
  companyName,
  requestedForEmail,
  requestedForPosition,
  requestedForDepartmentId,
  departments,
}: {
  requestId: string;
  personId: string | null;
  personName: string | null;
  requestedForName: string;
  requestedForEmployeeId: string | null;
  companyName: string | null;
  requestedForEmail: string;
  requestedForPosition: string | null;
  requestedForDepartmentId: string | null;
  departments: { id: string; name: string }[];
}) {
  const { run, loading } = useAction();
  const [confirming, setConfirming] = useState(false);
  const [submittedFirst, ...submittedRest] = (requestedForName ?? "").trim().split(/\s+/);
  const [draft, setDraft] = useState({
    firstName: submittedFirst ?? "",
    lastName: submittedRest.join(" "),
    email: requestedForEmail ?? "",
    employeeId: requestedForEmployeeId ?? "",
    departmentId: requestedForDepartmentId ?? "",
    positionTitle: requestedForPosition ?? "",
  });

  if (personId) {
    return (
      <div className="mb-4 rounded-lg border bg-muted/30 p-3 text-sm">
        <span className="text-muted-foreground">Will be assigned to </span>
        <a href={`/people/${personId}`} className="font-medium text-primary hover:underline">
          {personName}
        </a>
        {requestedForEmployeeId ? (
          <span className="text-muted-foreground"> ({requestedForEmployeeId}{companyName ? `, ${companyName}` : ""})</span>
        ) : null}
      </div>
    );
  }

  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-warning/40 bg-warning/5 p-3 text-sm">
      <div className="flex items-start gap-2">
        <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden />
        <div>
          <p className="font-medium">No employee record for {requestedForName}</p>
          <p className="text-muted-foreground">
            Nothing matched employee ID {requestedForEmployeeId ?? "(none)"}
            {companyName ? ` in ${companyName}` : ""}. Create the record to continue with implementation.
          </p>
        </div>
      </div>
      <Button size="sm" onClick={() => setConfirming(true)}>
        <UserPlus className="h-4 w-4" /> Create employee record
      </Button>

      {/* IT confirms the submitted details before the profile exists. The
          position was typed freely on the form, so it is corrected here and
          added to the catalogue on save. */}
      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent
          title={`Create employee record for ${requestedForName}`}
          description="Check the details submitted on the request. Correct anything wrong before the profile is created."
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="cp-first" required>First name</Label>
              <Input id="cp-first" value={draft.firstName}
                onChange={(event) => setDraft({ ...draft, firstName: event.target.value })} />
            </div>
            <div>
              <Label htmlFor="cp-last" required>Last name</Label>
              <Input id="cp-last" value={draft.lastName}
                onChange={(event) => setDraft({ ...draft, lastName: event.target.value })} />
            </div>
            <div>
              <Label htmlFor="cp-email" required>Work email</Label>
              <Input id="cp-email" type="email" value={draft.email}
                onChange={(event) => setDraft({ ...draft, email: event.target.value })} />
            </div>
            <div>
              <Label htmlFor="cp-employee" required>Employee ID</Label>
              <Input id="cp-employee" value={draft.employeeId}
                onChange={(event) => setDraft({ ...draft, employeeId: event.target.value })} />
            </div>
            <div>
              <Label htmlFor="cp-department">Department</Label>
              <Select id="cp-department" value={draft.departmentId}
                onChange={(event) => setDraft({ ...draft, departmentId: event.target.value })}>
                <option value="">None</option>
                {departments.map((department) => (
                  <option key={department.id} value={department.id}>{department.name}</option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="cp-position">Position</Label>
              <Input id="cp-position" value={draft.positionTitle}
                onChange={(event) => setDraft({ ...draft, positionTitle: event.target.value })} />
              <HelperText>Typed by the requester. It is added to the catalogue if it is new.</HelperText>
            </div>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">Company: {companyName ?? "Unknown"}</p>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setConfirming(false)}>Cancel</Button>
            <Button
              loading={loading}
              disabled={!draft.firstName.trim() || !draft.email.trim() || !draft.employeeId.trim()}
              onClick={() =>
                run(
                  () =>
                    createRequestedForPersonAction(requestId, {
                      firstName: draft.firstName,
                      lastName: draft.lastName,
                      email: draft.email,
                      employeeId: draft.employeeId,
                      departmentId: draft.departmentId || undefined,
                      positionTitle: draft.positionTitle || undefined,
                    }),
                  {
                    successMessage: "Employee record created and linked.",
                    onSuccess: () => setConfirming(false),
                  },
                )
              }
            >
              Create employee record
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
