"use client";

import { useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { submitCorrectionAction } from "@/modules/requests/actions";
import { Button } from "@/shared/ui/button";
import { Input, Textarea, Select, Label, FieldError } from "@/shared/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
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
}: {
  token: string;
  itemDescription: string | null;
  fields: CorrectionField[];
  currentValues: Record<string, string | string[]>;
}) {
  const { toast } = useToast();
  const [values, setValues] = useState<Record<string, string | string[]>>(currentValues);
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
            {fields
              .filter((field) => field.fieldType !== "FILE_UPLOAD")
              .map((field) => {
                const id = `field-${field.fieldKey}`;
                const value = values[field.fieldKey];
                return (
                  <div key={field.fieldKey} className={field.fieldType === "PARAGRAPH" ? "sm:col-span-2" : undefined}>
                    <Label htmlFor={id} required={field.isRequired}>
                      {field.label}
                    </Label>
                    {field.fieldType === "PARAGRAPH" ? (
                      <Textarea
                        id={id}
                        value={(value as string) ?? ""}
                        onChange={(event) =>
                          setValues((current) => ({ ...current, [field.fieldKey]: event.target.value }))
                        }
                      />
                    ) : field.fieldType === "DROPDOWN" || field.fieldType === "RADIO" ? (
                      <Select
                        id={id}
                        value={(value as string) ?? ""}
                        onChange={(event) =>
                          setValues((current) => ({ ...current, [field.fieldKey]: event.target.value }))
                        }
                      >
                        <option value="">Select…</option>
                        {field.options.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </Select>
                    ) : field.fieldType === "YES_NO" ? (
                      <Select
                        id={id}
                        value={String(value ?? "")}
                        onChange={(event) =>
                          setValues((current) => ({ ...current, [field.fieldKey]: event.target.value }))
                        }
                      >
                        <option value="">Select…</option>
                        <option value="yes">Yes</option>
                        <option value="no">No</option>
                      </Select>
                    ) : (
                      <Input
                        id={id}
                        type={field.fieldType === "NUMBER" ? "number" : field.fieldType === "DATE" ? "date" : "text"}
                        value={Array.isArray(value) ? value.join(", ") : ((value as string) ?? "")}
                        onChange={(event) =>
                          setValues((current) => ({ ...current, [field.fieldKey]: event.target.value }))
                        }
                      />
                    )}
                    <FieldError message={errors[field.fieldKey]} />
                  </div>
                );
              })}
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
