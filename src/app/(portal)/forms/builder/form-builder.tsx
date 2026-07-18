"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { createFormAction, updateFormAction } from "@/modules/forms/actions";
import type { VisibilityRule } from "@/modules/forms/validators";
import { useAction } from "@/shared/ui/use-action";
import { Button } from "@/shared/ui/button";
import { Input, Textarea, Select, Label, FieldError, HelperText } from "@/shared/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";

/** Client-side form builder (SDS Doc 22): fields, properties, conditional visibility. */

const FIELD_TYPES = [
  ["TEXT", "Text"],
  ["PARAGRAPH", "Paragraph"],
  ["NUMBER", "Number"],
  ["EMAIL", "Email"],
  ["PHONE", "Phone"],
  ["DATE", "Date"],
  ["TIME", "Time"],
  ["DATETIME", "Date & Time"],
  ["DROPDOWN", "Dropdown"],
  ["MULTI_SELECT", "Multi-select"],
  ["RADIO", "Radio"],
  ["CHECKBOX", "Checkbox"],
  ["YES_NO", "Yes / No"],
  ["FILE_UPLOAD", "File Upload"],
] as const;

const OPTION_TYPES = new Set(["DROPDOWN", "MULTI_SELECT", "RADIO", "CHECKBOX"]);

interface FieldDraft {
  fieldKey: string;
  label: string;
  fieldType: string;
  placeholder: string;
  helpText: string;
  isRequired: boolean;
  defaultValue: string;
  options: string[];
  visibilityRules: VisibilityRule | null;
}

export interface ExistingForm {
  id: string;
  companyId: string;
  requestTypeId: string;
  workflowId: string;
  name: string;
  description: string | null;
  confirmationMessage: string | null;
  status: string;
  fields: FieldDraft[];
}

export function FormBuilder({
  companies,
  requestTypes,
  workflows,
  existing,
}: {
  companies: { id: string; name: string }[];
  requestTypes: { id: string; name: string; kind: string; companyId: string }[];
  workflows: { id: string; name: string; companyId: string }[];
  existing: ExistingForm | null;
}) {
  const router = useRouter();
  const { run, loading, fieldErrors } = useAction();
  const [companyId, setCompanyId] = useState(existing?.companyId ?? companies[0]?.id ?? "");
  const [requestTypeId, setRequestTypeId] = useState(existing?.requestTypeId ?? "");
  const [workflowId, setWorkflowId] = useState(existing?.workflowId ?? "");
  const [name, setName] = useState(existing?.name ?? "");
  const [description, setDescription] = useState(existing?.description ?? "");
  const [confirmationMessage, setConfirmationMessage] = useState(existing?.confirmationMessage ?? "");
  const [fields, setFields] = useState<FieldDraft[]>(existing?.fields ?? []);

  const companyRequestTypes = useMemo(
    () => requestTypes.filter((requestType) => requestType.companyId === companyId),
    [requestTypes, companyId],
  );
  const companyWorkflows = useMemo(
    () => workflows.filter((workflow) => workflow.companyId === companyId),
    [workflows, companyId],
  );

  function updateField(index: number, patch: Partial<FieldDraft>) {
    setFields((current) => current.map((field, i) => (i === index ? { ...field, ...patch } : field)));
  }

  function moveField(index: number, direction: -1 | 1) {
    setFields((current) => {
      const target = index + direction;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      const item = next[index]!;
      next[index] = next[target]!;
      next[target] = item;
      return next;
    });
  }

  function addField() {
    const base = `field_${fields.length + 1}`;
    let key = base;
    let suffix = 1;
    while (fields.some((field) => field.fieldKey === key)) {
      key = `${base}_${suffix}`;
      suffix += 1;
    }
    setFields((current) => [
      ...current,
      {
        fieldKey: key,
        label: "",
        fieldType: "TEXT",
        placeholder: "",
        helpText: "",
        isRequired: false,
        defaultValue: "",
        options: [],
        visibilityRules: null,
      },
    ]);
  }

  async function save() {
    const payload = {
      companyId,
      requestTypeId,
      workflowId,
      name,
      description: description || undefined,
      confirmationMessage: confirmationMessage || undefined,
      fields: fields.map((field) => ({
        fieldKey: field.fieldKey,
        label: field.label,
        fieldType: field.fieldType,
        placeholder: field.placeholder || undefined,
        helpText: field.helpText || undefined,
        isRequired: field.isRequired,
        defaultValue: field.defaultValue || undefined,
        options: OPTION_TYPES.has(field.fieldType) ? field.options.filter((option) => option.trim() !== "") : undefined,
        visibilityRules:
          field.visibilityRules && field.visibilityRules.conditions.length > 0
            ? field.visibilityRules
            : undefined,
      })),
    };
    await run(
      () => (existing ? updateFormAction(existing.id, payload) : createFormAction(payload)),
      {
        successMessage: existing ? "Form saved." : "Form created as draft.",
        onSuccess: () => router.push("/forms"),
      },
    );
  }

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader><CardTitle>Form settings</CardTitle></CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="fb-company" required>Company</Label>
            <Select
              id="fb-company"
              value={companyId}
              disabled={!!existing}
              onChange={(e) => { setCompanyId(e.target.value); setRequestTypeId(""); setWorkflowId(""); }}
            >
              {companies.map((company) => (
                <option key={company.id} value={company.id}>{company.name}</option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="fb-name" required>Form name</Label>
            <Input id="fb-name" value={name} onChange={(e) => setName(e.target.value)} />
            <FieldError message={fieldErrors.name} />
          </div>
          <div>
            <Label htmlFor="fb-request-type" required>Request type</Label>
            <Select id="fb-request-type" value={requestTypeId} onChange={(e) => setRequestTypeId(e.target.value)}>
              <option value="">Select…</option>
              {companyRequestTypes.map((requestType) => (
                <option key={requestType.id} value={requestType.id}>
                  {requestType.name} ({requestType.kind.replace(/_/g, " ").toLowerCase()})
                </option>
              ))}
            </Select>
            <HelperText>Determines which items (applications, assets, …) the form collects.</HelperText>
          </div>
          <div>
            <Label htmlFor="fb-workflow" required>Workflow</Label>
            <Select id="fb-workflow" value={workflowId} onChange={(e) => setWorkflowId(e.target.value)}>
              <option value="">Select…</option>
              {companyWorkflows.map((workflow) => (
                <option key={workflow.id} value={workflow.id}>{workflow.name}</option>
              ))}
            </Select>
            <HelperText>Every published form has exactly one workflow.</HelperText>
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="fb-description">Description (shown on the public form)</Label>
            <Textarea id="fb-description" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="fb-confirmation">Custom confirmation message</Label>
            <Textarea
              id="fb-confirmation"
              value={confirmationMessage}
              onChange={(e) => setConfirmationMessage(e.target.value)}
              placeholder="Shown to the requester after submission."
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Custom fields</CardTitle>
            <Button variant="outline" size="sm" onClick={addField}>
              <Plus className="h-4 w-4" /> Add field
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {fields.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No custom fields yet. Requester and Requested For details plus item selection are always included.
            </p>
          ) : null}
          {fields.map((field, index) => (
            <div key={index} className="rounded-md border p-4">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <Label htmlFor={`f-label-${index}`} required>Label</Label>
                  <Input id={`f-label-${index}`} value={field.label} onChange={(e) => updateField(index, { label: e.target.value })} />
                </div>
                <div>
                  <Label htmlFor={`f-key-${index}`} required>Field key</Label>
                  <Input
                    id={`f-key-${index}`}
                    value={field.fieldKey}
                    onChange={(e) => updateField(index, { fieldKey: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_") })}
                  />
                </div>
                <div>
                  <Label htmlFor={`f-type-${index}`} required>Type</Label>
                  <Select id={`f-type-${index}`} value={field.fieldType} onChange={(e) => updateField(index, { fieldType: e.target.value })}>
                    {FIELD_TYPES.map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </Select>
                </div>
                <div>
                  <Label htmlFor={`f-placeholder-${index}`}>Placeholder</Label>
                  <Input id={`f-placeholder-${index}`} value={field.placeholder} onChange={(e) => updateField(index, { placeholder: e.target.value })} />
                </div>
                <div className="sm:col-span-2">
                  <Label htmlFor={`f-help-${index}`}>Help text</Label>
                  <Input id={`f-help-${index}`} value={field.helpText} onChange={(e) => updateField(index, { helpText: e.target.value })} />
                </div>
                <div>
                  <Label htmlFor={`f-default-${index}`}>Default value</Label>
                  <Input id={`f-default-${index}`} value={field.defaultValue} onChange={(e) => updateField(index, { defaultValue: e.target.value })} />
                </div>
                {OPTION_TYPES.has(field.fieldType) ? (
                  <div>
                    <Label htmlFor={`f-options-${index}`} required>Options (one per line)</Label>
                    <Textarea
                      id={`f-options-${index}`}
                      value={field.options.join("\n")}
                      onChange={(e) => updateField(index, { options: e.target.value.split("\n") })}
                    />
                  </div>
                ) : null}
              </div>

              <VisibilityRuleEditor
                index={index}
                field={field}
                allFields={fields}
                onChange={(rules) => updateField(index, { visibilityRules: rules })}
              />

              <div className="mt-3 flex items-center justify-between">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={field.isRequired}
                    onChange={(e) => updateField(index, { isRequired: e.target.checked })}
                    className="h-4 w-4"
                  />
                  Required field
                </label>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" aria-label="Move field up" onClick={() => moveField(index, -1)}>
                    <ArrowUp className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" aria-label="Move field down" onClick={() => moveField(index, 1)}>
                    <ArrowDown className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Remove field"
                    onClick={() => setFields((current) => current.filter((_, i) => i !== index))}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
          <FieldError message={fieldErrors.fields} />
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => router.push("/forms")}>Cancel</Button>
        <Button onClick={save} loading={loading} disabled={!name || !requestTypeId || !workflowId}>
          {existing ? "Save form" : "Create draft form"}
        </Button>
      </div>
    </div>
  );
}

function VisibilityRuleEditor({
  index,
  field,
  allFields,
  onChange,
}: {
  index: number;
  field: FieldDraft;
  allFields: FieldDraft[];
  onChange: (rules: VisibilityRule | null) => void;
}) {
  const rules = field.visibilityRules;
  const otherFields = allFields.filter((other) => other.fieldKey !== field.fieldKey);

  if (!rules) {
    return (
      <button
        type="button"
        className="mt-3 text-xs text-primary underline-offset-2 hover:underline"
        onClick={() =>
          onChange({
            logic: "AND",
            conditions: [{ fieldKey: otherFields[0]?.fieldKey ?? "", operator: "EQUALS", value: "" }],
          })
        }
        disabled={otherFields.length === 0}
      >
        + Add conditional visibility
      </button>
    );
  }

  return (
    <div className="mt-3 rounded-md border border-dashed p-3">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs font-medium">
          Show this field when
          <Select
            value={rules.logic}
            className="h-7 w-20 text-xs"
            aria-label="Condition logic"
            onChange={(e) => onChange({ ...rules, logic: e.target.value as "AND" | "OR" })}
          >
            <option value="AND">ALL</option>
            <option value="OR">ANY</option>
          </Select>
          of the conditions match:
        </div>
        <button type="button" className="text-xs text-destructive hover:underline" onClick={() => onChange(null)}>
          Remove rules
        </button>
      </div>
      <div className="space-y-2">
        {rules.conditions.map((condition, conditionIndex) => (
          <div key={conditionIndex} className="flex flex-wrap items-center gap-2">
            <Select
              value={condition.fieldKey}
              className="h-8 w-40 text-xs"
              aria-label="Condition field"
              onChange={(e) =>
                onChange({
                  ...rules,
                  conditions: rules.conditions.map((entry, i) =>
                    i === conditionIndex ? { ...entry, fieldKey: e.target.value } : entry,
                  ),
                })
              }
            >
              {otherFields.map((other) => (
                <option key={other.fieldKey} value={other.fieldKey}>
                  {other.label || other.fieldKey}
                </option>
              ))}
            </Select>
            <Select
              value={condition.operator}
              className="h-8 w-36 text-xs"
              aria-label="Condition operator"
              onChange={(e) =>
                onChange({
                  ...rules,
                  conditions: rules.conditions.map((entry, i) =>
                    i === conditionIndex ? { ...entry, operator: e.target.value as never } : entry,
                  ),
                })
              }
            >
              <option value="EQUALS">Equals</option>
              <option value="NOT_EQUALS">Not equals</option>
              <option value="CONTAINS">Contains</option>
              <option value="GREATER_THAN">Greater than</option>
              <option value="LESS_THAN">Less than</option>
            </Select>
            <Input
              value={condition.value}
              className="h-8 w-40 text-xs"
              aria-label="Condition value"
              onChange={(e) =>
                onChange({
                  ...rules,
                  conditions: rules.conditions.map((entry, i) =>
                    i === conditionIndex ? { ...entry, value: e.target.value } : entry,
                  ),
                })
              }
            />
            <button
              type="button"
              aria-label="Remove condition"
              className="text-muted-foreground hover:text-destructive"
              onClick={() =>
                onChange(
                  rules.conditions.length === 1
                    ? null
                    : { ...rules, conditions: rules.conditions.filter((_, i) => i !== conditionIndex) },
                )
              }
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
        <button
          type="button"
          className="text-xs text-primary hover:underline"
          onClick={() =>
            onChange({
              ...rules,
              conditions: [
                ...rules.conditions,
                { fieldKey: otherFields[0]?.fieldKey ?? "", operator: "EQUALS", value: "" },
              ],
            })
          }
        >
          + Add condition
        </button>
      </div>
    </div>
  );
}
