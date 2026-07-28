"use client";

import { useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { submitCorrectionAction } from "@/modules/requests/actions";
import { Button } from "@/shared/ui/button";
import { Input, Textarea, Select, Label, FieldError } from "@/shared/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui/card";
import { useToast } from "@/shared/ui/toast";

interface CorrectionField {
  fieldKey: string;
  label: string;
  fieldType: string;
  isRequired: boolean;
  options: string[];
}

export function CorrectionForm({
  token,
  itemDescription,
  fields,
  currentValues,
  itemFields,
  currentItemValues,
  itemLabel,
}: {
  token: string;
  itemDescription: string | null;
  fields: CorrectionField[];
  currentValues: Record<string, string | string[]>;
  /** Request fields belonging to the application or asset category asked for. */
  itemFields: CorrectionField[];
  currentItemValues: Record<string, string | string[]>;
  itemLabel: string;
}) {
  const { toast } = useToast();
  const [values, setValues] = useState<Record<string, string | string[]>>(currentValues);
  const [itemValues, setItemValues] = useState<Record<string, string | string[]>>(currentItemValues);
  const [description, setDescription] = useState(itemDescription ?? "");
  const [comments, setComments] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    try {
      const result = await submitCorrectionAction(token, {
        fieldValues: values,
        itemFieldValues: itemValues,
        itemDescription: description || undefined,
        comments: comments || undefined,
      });
      if (result.ok) {
        setDone(true);
      } else {
        setErrors(result.fieldErrors ?? {});
        toast("error", result.error);
      }
    } catch {
      toast("error", "An unexpected error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <CheckCircle2 className="mx-auto h-10 w-10 text-success" aria-hidden />
          <h2 className="mt-3 text-lg font-semibold">Correction submitted</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            The corrected item has been returned to the approval workflow. You will receive further
            updates by email.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      {fields.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Request details</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <FieldGroup fields={fields} values={values} onChange={setValues} errors={errors} />
          </CardContent>
        </Card>
      ) : null}

      {itemFields.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>{itemLabel}</CardTitle>
            <CardDescription>
              What was asked for. If the approver objected to one of these, change it here.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <FieldGroup
              fields={itemFields}
              values={itemValues}
              onChange={setItemValues}
              errors={errors}
              errorPrefix="item_"
              idPrefix="item-field-"
            />
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Item details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="item-description">Item notes</Label>
            <Textarea
              id="item-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="correction-comments">Message to the approver (optional)</Label>
            <Textarea
              id="correction-comments"
              value={comments}
              onChange={(event) => setComments(event.target.value)}
              placeholder="Describe what you corrected"
            />
          </div>
        </CardContent>
      </Card>

      <Button type="submit" size="lg" className="w-full" loading={loading}>
        Resubmit corrected item
      </Button>
    </form>
  );
}

/**
 * One editable group of dynamic fields. Both the form's own questions and the
 * requested item's request fields render through here, so the two can never
 * drift apart in behaviour or appearance.
 */
function FieldGroup({
  fields,
  values,
  onChange,
  errors,
  errorPrefix = "",
  idPrefix = "field-",
}: {
  fields: CorrectionField[];
  values: Record<string, string | string[]>;
  onChange: React.Dispatch<React.SetStateAction<Record<string, string | string[]>>>;
  errors: Record<string, string>;
  errorPrefix?: string;
  idPrefix?: string;
}) {
  return (
    <>
      {fields
        // A file cannot be re-attached through a one-time correction link.
        .filter((field) => field.fieldType !== "FILE_UPLOAD")
        .map((field) => {
          const id = `${idPrefix}${field.fieldKey}`;
          const value = values[field.fieldKey];
          const set = (next: string) => onChange((current) => ({ ...current, [field.fieldKey]: next }));
          const isMulti = field.fieldType === "MULTI_SELECT" || field.fieldType === "CHECKBOX";
          return (
            <div
              key={field.fieldKey}
              className={
                field.fieldType === "PARAGRAPH" || isMulti ? "sm:col-span-2" : undefined
              }
            >
              <Label htmlFor={id} required={field.isRequired}>
                {field.label}
              </Label>
              {field.fieldType === "PARAGRAPH" ? (
                <Textarea id={id} value={(value as string) ?? ""} onChange={(e) => set(e.target.value)} />
              ) : isMulti ? (
                // Multi-value answers (several outlets, several cost centres)
                // need every option visible, not a single-choice dropdown.
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
                            onChange((current) => {
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
              ) : field.fieldType === "DROPDOWN" || field.fieldType === "RADIO" ? (
                <Select id={id} value={(value as string) ?? ""} onChange={(e) => set(e.target.value)}>
                  <option value="">Select…</option>
                  {field.options.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </Select>
              ) : field.fieldType === "YES_NO" ? (
                <Select id={id} value={String(value ?? "")} onChange={(e) => set(e.target.value)}>
                  <option value="">Select…</option>
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </Select>
              ) : (
                <Input
                  id={id}
                  type={field.fieldType === "NUMBER" ? "number" : field.fieldType === "DATE" ? "date" : "text"}
                  value={Array.isArray(value) ? value.join(", ") : ((value as string) ?? "")}
                  onChange={(e) => set(e.target.value)}
                />
              )}
              <FieldError message={errors[`${errorPrefix}${field.fieldKey}`]} />
            </div>
          );
        })}
    </>
  );
}
