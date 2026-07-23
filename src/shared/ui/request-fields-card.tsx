"use client";

import { useState } from "react";
import { Pencil, Plus, Power, Trash2, X } from "lucide-react";
import {
  createRequestFieldAction,
  updateRequestFieldAction,
  setRequestFieldActiveAction,
  deleteRequestFieldAction,
} from "@/modules/request-fields/actions";
import { isChoiceType, isMultiValueType } from "@/modules/request-fields/validators";
import { useAction } from "@/shared/ui/use-action";
import { Button } from "@/shared/ui/button";
import { Input, Select, Label, FieldError, HelperText } from "@/shared/ui/input";
import { Dialog, DialogContent, DialogTrigger } from "@/shared/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";

/**
 * Manage the extra questions asked when this application or asset category is
 * requested (SDS Doc 08/11). The same card serves both owners so the two pages
 * stay consistent.
 */

export interface RequestFieldRecord {
  id: string;
  label: string;
  fieldType: string;
  placeholder: string | null;
  helpText: string | null;
  isRequired: boolean;
  options: string[];
  displayOrder: number;
  isActive: boolean;
}

export interface RequestFieldOwner {
  applicationId?: string;
  assetCategoryId?: string;
}

const FIELD_TYPES: { value: string; label: string }[] = [
  { value: "TEXT", label: "Short text" },
  { value: "PARAGRAPH", label: "Long text" },
  { value: "NUMBER", label: "Number" },
  { value: "EMAIL", label: "Email" },
  { value: "PHONE", label: "Phone" },
  { value: "DATE", label: "Date" },
  { value: "DROPDOWN", label: "Dropdown (choose one)" },
  { value: "RADIO", label: "Radio buttons (choose one)" },
  { value: "MULTI_SELECT", label: "Multi-select (choose several)" },
  { value: "CHECKBOX", label: "Checkboxes (choose several)" },
  { value: "YES_NO", label: "Yes / No" },
];

function typeLabel(value: string) {
  return FIELD_TYPES.find((type) => type.value === value)?.label ?? value;
}

export function RequestFieldsCard({
  owner,
  fields,
  canManage,
  description,
}: {
  owner: RequestFieldOwner;
  fields: RequestFieldRecord[];
  canManage: boolean;
  description: string;
}) {
  const { run, loading } = useAction();

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Request fields</CardTitle>
          {canManage ? <RequestFieldDialog owner={owner} /> : null}
        </div>
      </CardHeader>
      <CardContent>
        {fields.length === 0 ? (
          <p className="text-sm text-muted-foreground">{description}</p>
        ) : (
          <ul className="space-y-2">
            {fields.map((field) => (
              <li
                key={field.id}
                className={`flex items-start justify-between gap-3 rounded-md border px-3 py-2 text-sm ${field.isActive ? "" : "opacity-50"}`}
              >
                <div className="min-w-0">
                  <p className="font-medium">
                    {field.label}
                    {field.isRequired ? <span className="text-destructive"> *</span> : null}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {typeLabel(field.fieldType)}
                    {isMultiValueType(field.fieldType) ? " · several allowed" : ""}
                    {field.options.length > 0 ? ` · ${field.options.length} options` : ""}
                  </p>
                  {field.options.length > 0 ? (
                    <p className="mt-1 truncate text-xs text-muted-foreground">{field.options.join(", ")}</p>
                  ) : null}
                </div>
                {canManage ? (
                  <span className="flex shrink-0 items-center gap-1">
                    <RequestFieldDialog owner={owner} field={field} />
                    <Button
                      variant="ghost"
                      size="icon"
                      loading={loading}
                      aria-label={field.isActive ? "Disable field" : "Enable field"}
                      title={field.isActive ? "Disable" : "Enable"}
                      onClick={() =>
                        run(() => setRequestFieldActiveAction(field.id, !field.isActive, owner), {
                          successMessage: field.isActive ? "Field disabled." : "Field enabled.",
                        })
                      }
                    >
                      <Power className={`h-4 w-4 ${field.isActive ? "text-success" : "text-muted-foreground"}`} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      loading={loading}
                      aria-label="Remove field"
                      title="Remove"
                      onClick={() =>
                        run(() => deleteRequestFieldAction(field.id, owner), {
                          successMessage: "Field removed.",
                        })
                      }
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function RequestFieldDialog({ owner, field }: { owner: RequestFieldOwner; field?: RequestFieldRecord }) {
  const { run, loading, fieldErrors } = useAction();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    label: field?.label ?? "",
    fieldType: field?.fieldType ?? "TEXT",
    placeholder: field?.placeholder ?? "",
    helpText: field?.helpText ?? "",
    isRequired: field?.isRequired ?? false,
    displayOrder: field?.displayOrder ?? 0,
  });
  const [options, setOptions] = useState<string[]>(field?.options ?? []);
  const [optionDraft, setOptionDraft] = useState("");
  const needsOptions = isChoiceType(form.fieldType);

  function addOption() {
    const value = optionDraft.trim();
    if (!value) return;
    if (options.some((option) => option.toLowerCase() === value.toLowerCase())) {
      setOptionDraft("");
      return;
    }
    setOptions((current) => [...current, value]);
    setOptionDraft("");
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {field ? (
          <Button variant="ghost" size="icon" aria-label={`Edit ${field.label}`} title="Edit">
            <Pencil className="h-4 w-4" />
          </Button>
        ) : (
          <Button variant="outline" size="sm">
            <Plus className="h-4 w-4" /> Add field
          </Button>
        )}
      </DialogTrigger>
      <DialogContent title={field ? `Edit ${field.label}` : "New request field"}>
        <div className="space-y-3">
          <div>
            <Label htmlFor="rf-label" required>Question</Label>
            <Input
              id="rf-label"
              value={form.label}
              onChange={(event) => setForm({ ...form, label: event.target.value })}
              placeholder="e.g. Cost centres"
            />
            <FieldError message={fieldErrors.label} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="rf-type" required>Answer type</Label>
              <Select
                id="rf-type"
                value={form.fieldType}
                onChange={(event) => setForm({ ...form, fieldType: event.target.value })}
              >
                {FIELD_TYPES.map((type) => (
                  <option key={type.value} value={type.value}>{type.label}</option>
                ))}
              </Select>
              {isMultiValueType(form.fieldType) ? (
                <HelperText>The requester can pick more than one value.</HelperText>
              ) : null}
            </div>
            <div>
              <Label htmlFor="rf-order">Display order</Label>
              <Input
                id="rf-order"
                type="number"
                min="0"
                value={form.displayOrder}
                onChange={(event) => setForm({ ...form, displayOrder: Number(event.target.value) || 0 })}
              />
            </div>
          </div>

          {needsOptions ? (
            <div>
              <Label htmlFor="rf-option" required>Options</Label>
              <div className="flex gap-2">
                <Input
                  id="rf-option"
                  value={optionDraft}
                  onChange={(event) => setOptionDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      addOption();
                    }
                  }}
                  placeholder="Type a value and press Enter"
                />
                <Button variant="outline" onClick={addOption}>Add</Button>
              </div>
              <FieldError message={fieldErrors.options} />
              {options.length > 0 ? (
                <ul className="mt-2 flex flex-wrap gap-1">
                  {options.map((option) => (
                    <li
                      key={option}
                      className="flex items-center gap-1 rounded-full border bg-muted/40 py-1 pl-3 pr-1 text-xs"
                    >
                      {option}
                      <button
                        type="button"
                        aria-label={`Remove ${option}`}
                        className="rounded-full p-0.5 hover:bg-accent"
                        onClick={() => setOptions((current) => current.filter((entry) => entry !== option))}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : (
            <div>
              <Label htmlFor="rf-placeholder">Placeholder</Label>
              <Input
                id="rf-placeholder"
                value={form.placeholder}
                onChange={(event) => setForm({ ...form, placeholder: event.target.value })}
              />
            </div>
          )}

          <div>
            <Label htmlFor="rf-help">Help text</Label>
            <Input
              id="rf-help"
              value={form.helpText}
              onChange={(event) => setForm({ ...form, helpText: event.target.value })}
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={form.isRequired}
              onChange={(event) => setForm({ ...form, isRequired: event.target.checked })}
            />
            Required
          </label>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              loading={loading}
              disabled={!form.label.trim() || (needsOptions && options.length === 0)}
              onClick={() => {
                const payload = {
                  ...owner,
                  label: form.label,
                  fieldType: form.fieldType,
                  placeholder: form.placeholder || undefined,
                  helpText: form.helpText || undefined,
                  isRequired: form.isRequired,
                  options: needsOptions ? options : [],
                  displayOrder: form.displayOrder,
                };
                return run(
                  () => (field ? updateRequestFieldAction(field.id, payload) : createRequestFieldAction(payload)),
                  {
                    successMessage: field ? "Field updated." : "Field added.",
                    onSuccess: () => setOpen(false),
                  },
                );
              }}
            >
              {field ? "Save field" : "Add field"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
