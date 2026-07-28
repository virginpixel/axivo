"use client";

import { useState } from "react";
import { PencilLine, ClipboardPaste } from "lucide-react";
import { changeAssignmentAccessAction } from "@/modules/applications/actions";
import { useAction } from "@/shared/ui/use-action";
import { Button } from "@/shared/ui/button";
import { Combobox } from "@/shared/ui/combobox";
import { Dialog, DialogContent, DialogTrigger } from "@/shared/ui/dialog";
import { Input, Label, FieldError, HelperText, Textarea } from "@/shared/ui/input";

interface RequestField {
  fieldKey: string;
  label: string;
  fieldType: string;
  options: string[];
}

/**
 * Change the role or request-field values on access somebody already holds.
 *
 * The evidence is the point of this dialog. Such a change happens outside the
 * request workflow, so there is no approval trail behind it; the attached email
 * or signed form is what an auditor is shown instead, and the change is refused
 * without one. Pasting is supported because the evidence is nearly always a
 * screenshot of an email the operator already has on screen, and making them
 * save it to disk first is friction for no gain.
 */
export function ChangeAccessDialog({
  assignmentId,
  applicationName,
  currentRoleId,
  currentRoleName,
  roles,
  fields,
  currentValues,
}: {
  assignmentId: string;
  applicationName: string;
  currentRoleId: string | null;
  currentRoleName: string | null;
  roles: { id: string; name: string }[];
  fields: RequestField[];
  currentValues: Record<string, string | string[]>;
}) {
  const { run, loading, fieldErrors } = useAction();
  const [open, setOpen] = useState(false);
  const [roleId, setRoleId] = useState(currentRoleId ?? "");
  const [values, setValues] = useState<Record<string, string | string[]>>(currentValues);
  const [reason, setReason] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [pastedPreview, setPastedPreview] = useState<string | null>(null);

  /** Accept an image straight from the clipboard. */
  function handlePaste(event: React.ClipboardEvent) {
    const item = Array.from(event.clipboardData.items).find((entry) => entry.type.startsWith("image/"));
    if (!item) return;
    const blob = item.getAsFile();
    if (!blob) return;
    event.preventDefault();
    const named = new File([blob], `pasted-screenshot-${Date.now()}.png`, { type: blob.type });
    setFile(named);
    setPastedPreview(URL.createObjectURL(named));
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Change role or fields" title="Change role or fields">
          <PencilLine className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent
        title={`Change access to ${applicationName}`}
        description="Records what the access was, what it becomes, and the approval behind it."
        wide
      >
        <div className="space-y-3" onPaste={handlePaste}>
          {roles.length > 0 ? (
            <div>
              <Label htmlFor="ca-role">Access role</Label>
              <Combobox
                id="ca-role"
                value={roleId}
                onChange={setRoleId}
                options={roles.map((role) => ({ value: role.id, label: role.name }))}
                placeholder="Select a role"
              />
              <HelperText>Currently {currentRoleName ?? "no role"}.</HelperText>
            </div>
          ) : null}

          {fields.map((field) => {
            const value = values[field.fieldKey];
            const isMulti = field.fieldType === "MULTI_SELECT" || field.fieldType === "CHECKBOX";
            return (
              <div key={field.fieldKey}>
                <Label htmlFor={`ca-${field.fieldKey}`}>{field.label}</Label>
                {isMulti ? (
                  <div className="mt-1 grid gap-1.5 sm:grid-cols-2">
                    {field.options.map((option) => {
                      const selected = Array.isArray(value) ? value : [];
                      return (
                        <label key={option} className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded border-input"
                            checked={selected.includes(option)}
                            onChange={(event) =>
                              setValues((current) => {
                                const list = Array.isArray(current[field.fieldKey])
                                  ? (current[field.fieldKey] as string[])
                                  : [];
                                return {
                                  ...current,
                                  [field.fieldKey]: event.target.checked
                                    ? [...list, option]
                                    : list.filter((entry) => entry !== option),
                                };
                              })
                            }
                          />
                          {option}
                        </label>
                      );
                    })}
                  </div>
                ) : field.options.length > 0 ? (
                  <Combobox
                    id={`ca-${field.fieldKey}`}
                    value={(value as string) ?? ""}
                    onChange={(next) => setValues((current) => ({ ...current, [field.fieldKey]: next }))}
                    options={field.options.map((option) => ({ value: option, label: option }))}
                  />
                ) : (
                  <Input
                    id={`ca-${field.fieldKey}`}
                    value={Array.isArray(value) ? value.join(", ") : ((value as string) ?? "")}
                    onChange={(event) =>
                      setValues((current) => ({ ...current, [field.fieldKey]: event.target.value }))
                    }
                  />
                )}
              </div>
            );
          })}

          <div>
            <Label htmlFor="ca-reason">Reason</Label>
            <Textarea
              id="ca-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Why this changed, in a line"
            />
          </div>

          <div>
            <Label htmlFor="ca-file" required>Approval evidence</Label>
            <Input
              id="ca-file"
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,.webp,.eml,.msg,.doc,.docx"
              onChange={(event) => {
                setFile(event.target.files?.[0] ?? null);
                setPastedPreview(null);
              }}
            />
            <FieldError message={fieldErrors.file} />
            <HelperText>
              A PDF, an email file or a screenshot. You can also paste a screenshot straight into
              this dialog.
            </HelperText>
            {pastedPreview ? (
              <p className="mt-2 flex items-center gap-2 text-xs text-success">
                <ClipboardPaste className="h-3.5 w-3.5" /> Screenshot pasted and attached.
              </p>
            ) : null}
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              loading={loading}
              disabled={!file}
              onClick={() => {
                const formData = new FormData();
                formData.set("assignmentId", assignmentId);
                if (roleId) formData.set("applicationRoleId", roleId);
                formData.set("fieldData", JSON.stringify(values));
                if (reason.trim()) formData.set("reason", reason.trim());
                if (file) formData.set("file", file);
                return run(() => changeAssignmentAccessAction(formData), {
                  successMessage: "Access changed and the evidence filed.",
                  onSuccess: () => setOpen(false),
                });
              }}
            >
              Save change
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
