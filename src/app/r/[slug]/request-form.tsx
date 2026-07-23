"use client";

import { useMemo, useState } from "react";
import { Plus, Trash2, CheckCircle2 } from "lucide-react";
import { submitPublicRequestAction } from "@/modules/requests/actions";
import { isFieldVisible } from "@/modules/forms/visibility";
import type { VisibilityRule } from "@/modules/forms/validators";
import { Button } from "@/shared/ui/button";
import { Input, Textarea, Select, Label, FieldError, HelperText } from "@/shared/ui/input";
import { Combobox } from "@/shared/ui/combobox";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { useToast } from "@/shared/ui/toast";

/**
 * Public single-page request form (SDS Doc 22): inline validation, conditional
 * visibility, multiple request items each processed independently.
 */

export interface PublicField {
  fieldKey: string;
  label: string;
  fieldType: string;
  placeholder: string | null;
  helpText: string | null;
  isRequired: boolean;
  defaultValue: string | null;
  options: string[];
  visibilityRules: VisibilityRule | null;
}

interface PublicApplication {
  id: string;
  name: string;
  roles: { id: string; name: string }[];
}

interface ItemDraft {
  key: number;
  /** Only set on an all-in-one form, where each row picks its own kind. */
  rowType?: "APPLICATION" | "ASSET";
  applicationId?: string;
  applicationRoleId?: string;
  assetCategoryId?: string;
  description?: string;
  /** Answers to the request fields defined on the chosen application/category. */
  fieldValues: Record<string, string | string[]>;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface ParticipantDraft {
  name: string;
  email: string;
  employeeId: string;
  departmentId: string;
  /** Free text: the position may not exist in the catalogue yet. */
  positionTitle: string;
}

const EMPTY_PARTICIPANT: ParticipantDraft = {
  name: "",
  email: "",
  employeeId: "",
  departmentId: "",
  positionTitle: "",
};

export function PublicRequestForm({
  slug,
  requestTypeKind,
  fields,
  applications,
  assetCategories,
  departments,
  positions,
  companies,
  formCompanyId,
  requestFieldsByTarget,
  allowsMixedItems,
  fixedApplicationId,
  fixedAssetCategoryId,
}: {
  slug: string;
  requestTypeKind: string;
  fields: PublicField[];
  applications: PublicApplication[];
  assetCategories: { id: string; name: string }[];
  departments: { id: string; name: string; companyId: string }[];
  positions: { id: string; name: string; companyId: string }[];
  companies: { id: string; name: string }[];
  formCompanyId: string;
  /** Extra questions keyed by application id or asset category id (Doc 08/11). */
  requestFieldsByTarget: Record<string, PublicField[]>;
  /** All-in-one form: each row chooses its own kind. */
  allowsMixedItems: boolean;
  /** Dedicated form: the target is fixed and never shown as a choice. */
  fixedApplicationId: string | null;
  fixedAssetCategoryId: string | null;
}) {
  const { toast } = useToast();
  const [requester, setRequester] = useState<ParticipantDraft>(EMPTY_PARTICIPANT);
  const [requestedFor, setRequestedFor] = useState<ParticipantDraft>(EMPTY_PARTICIPANT);
  const [requesterCompanyId, setRequesterCompanyId] = useState(formCompanyId);
  const [requestedForCompanyId, setRequestedForCompanyId] = useState(formCompanyId);
  const [sameAsRequester, setSameAsRequester] = useState(false);

  // Each participant names their own company, since a form may be shared across
  // companies; their department and position lists follow that choice.
  const requesterDepartments = departments.filter((entry) => entry.companyId === requesterCompanyId);
  const requesterPositions = positions.filter((entry) => entry.companyId === requesterCompanyId);
  const requestedForDepartments = departments.filter((entry) => entry.companyId === requestedForCompanyId);
  const requestedForPositions = positions.filter((entry) => entry.companyId === requestedForCompanyId);
  const [values, setValues] = useState<Record<string, string | string[]>>(() => {
    const initial: Record<string, string | string[]> = {};
    for (const field of fields) {
      if (field.defaultValue) initial[field.fieldKey] = field.defaultValue;
    }
    return initial;
  });
  const [items, setItems] = useState<ItemDraft[]>([
    {
      key: 1,
      fieldValues: {},
      ...(allowsMixedItems ? { rowType: "APPLICATION" as const } : {}),
      ...(fixedApplicationId ? { applicationId: fixedApplicationId } : {}),
      ...(fixedAssetCategoryId ? { assetCategoryId: fixedAssetCategoryId } : {}),
    },
  ]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState<{ requestNumber: string; message: string | null } | null>(null);

  const itemMode = useMemo(() => {
    if (requestTypeKind === "APPLICATION_ACCESS") return "APPLICATION" as const;
    if (requestTypeKind === "ASSET_REQUEST") return "ASSET" as const;
    if (requestTypeKind === "ROLE_CHANGE") return "ROLE_CHANGE" as const;
    return "GENERAL" as const;
  }, [requestTypeKind]);

  const visibleFields = fields.filter((field) => isFieldVisible(field.visibilityRules, values));

  function setFieldValue(key: string, value: string | string[]) {
    setValues((current) => ({ ...current, [key]: value }));
    setErrors((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
  }

  function validateClient(): boolean {
    const nextErrors: Record<string, string> = {};
    const effectiveRequestedFor = sameAsRequester ? requester : requestedFor;
    const checkParticipant = (prefix: string, participant: ParticipantDraft) => {
      if (!participant.name.trim()) nextErrors[`${prefix}Name`] = "Name is required.";
      if (!EMAIL_PATTERN.test(participant.email)) nextErrors[`${prefix}Email`] = "Enter a valid email address.";
      if (!participant.employeeId.trim()) nextErrors[`${prefix}EmployeeId`] = "Employee ID is required.";
      if (!participant.departmentId) nextErrors[`${prefix}DepartmentId`] = "Select a department.";
      if (!participant.positionTitle.trim()) nextErrors[`${prefix}PositionTitle`] = "Enter a position.";
    };
    checkParticipant("requester", requester);
    checkParticipant("requestedFor", effectiveRequestedFor);
    for (const field of visibleFields) {
      const value = values[field.fieldKey];
      const empty = value === undefined || value === "" || (Array.isArray(value) && value.length === 0);
      if (field.isRequired && field.fieldType !== "FILE_UPLOAD" && empty) {
        nextErrors[field.fieldKey] = `${field.label} is required.`;
      }
      if (field.fieldType === "EMAIL" && !empty && !EMAIL_PATTERN.test(String(value))) {
        nextErrors[field.fieldKey] = "Enter a valid email address.";
      }
      if (field.fieldType === "NUMBER" && !empty && !Number.isFinite(Number(value))) {
        nextErrors[field.fieldKey] = `${field.label} must be a number.`;
      }
    }
    items.forEach((item, index) => {
      const rowMode = allowsMixedItems ? (item.rowType ?? "APPLICATION") : itemMode;
      if (rowMode === "APPLICATION" && !item.applicationId) {
        nextErrors[`item-${index}`] = "Select an application.";
      }
      // A role is required whenever the chosen application defines any.
      if (rowMode === "APPLICATION" && item.applicationId && !item.applicationRoleId) {
        const roles = applications.find((application) => application.id === item.applicationId)?.roles ?? [];
        if (roles.length > 0) nextErrors[`item-${index}`] = "Select an access role.";
      }
      if (rowMode === "ASSET" && !item.assetCategoryId) {
        nextErrors[`item-${index}`] = "Select an asset category.";
      }
      // Required questions from the chosen application or category.
      const targetId = item.applicationId || item.assetCategoryId;
      for (const field of targetId ? requestFieldsByTarget[targetId] ?? [] : []) {
        const value = item.fieldValues[field.fieldKey];
        const empty = value === undefined || value === "" || (Array.isArray(value) && value.length === 0);
        if (field.isRequired && empty) {
          nextErrors[`item_${index}_${field.fieldKey}`] = `${field.label} is required.`;
        }
      }
      if ((itemMode === "ROLE_CHANGE" || itemMode === "GENERAL") && !item.description?.trim()) {
        nextErrors[`item-${index}`] = "Please describe the request.";
      }
    });
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      // Autofocus first invalid field (Doc 03 Ch5).
      const firstKey = Object.keys(nextErrors)[0];
      document.getElementById(`field-${firstKey}`)?.focus();
      return false;
    }
    return true;
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!validateClient()) return;
    setLoading(true);
    const effectiveRequestedFor = sameAsRequester ? requester : requestedFor;
    try {
      const result = await submitPublicRequestAction({
        slug,
        requesterName: requester.name.trim(),
        requesterEmail: requester.email.trim(),
        requesterEmployeeId: requester.employeeId.trim(),
        requesterDepartmentId: requester.departmentId,
        requesterPositionTitle: requester.positionTitle.trim(),
        requestedForName: effectiveRequestedFor.name.trim(),
        requestedForEmail: effectiveRequestedFor.email.trim(),
        requestedForEmployeeId: effectiveRequestedFor.employeeId.trim(),
        requesterCompanyId,
        requestedForCompanyId: sameAsRequester ? requesterCompanyId : requestedForCompanyId,
        requestedForDepartmentId: effectiveRequestedFor.departmentId,
        requestedForPositionTitle: effectiveRequestedFor.positionTitle.trim(),
        fieldValues: values,
        website: "",
        items: items.map((item) => ({
          itemType: allowsMixedItems ? (item.rowType ?? "APPLICATION") : itemMode,
          applicationId: item.applicationId || undefined,
          applicationRoleId: item.applicationRoleId || undefined,
          assetCategoryId: item.assetCategoryId || undefined,
          description: item.description || undefined,
          fieldValues: item.fieldValues,
        })),
      });
      if (result.ok) {
        setDone({ requestNumber: result.data.requestNumber, message: result.data.confirmationMessage });
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
          <CheckCircle2 className="mx-auto h-12 w-12 text-success" aria-hidden />
          <h2 className="mt-4 text-xl font-bold">Request submitted</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {done.message ?? "Your request has been received and routed for approval."}
          </p>
          <p className="mt-4 inline-block rounded-md bg-muted px-4 py-2 font-mono text-sm font-semibold">
            {done.requestNumber}
          </p>
          <p className="mt-4 text-xs text-muted-foreground">
            Keep this reference number. You will receive email updates as your request progresses.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-5">
      {/* Honeypot (Doc 05 Ch7): hidden from humans, filled only by bots. */}
      <div className="absolute -left-[9999px] top-auto" aria-hidden>
        <label htmlFor="website">Website</label>
        <input id="website" name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      <ParticipantCard
        title="Requested by"
        prefix="requester"
        participant={requester}
        onChange={setRequester}
        departments={requesterDepartments}
        positions={requesterPositions}
        errors={errors}
        companySelect={
          <div>
            <Label htmlFor="requester-company" required>Company</Label>
            <Combobox
              id="requester-company"
              value={requesterCompanyId}
              options={companies.map((company) => ({ value: company.id, label: company.name }))}
              onChange={(value) => {
                setRequesterCompanyId(value);
                // Department and position belong to the company; reset them.
                setRequester((current) => ({ ...current, departmentId: "" }));
              }}
            />
            <FieldError message={errors.requesterCompanyId} />
          </div>
        }
      />

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Requested for</CardTitle>
            <label className="flex items-center gap-2 text-sm font-normal">
              <input
                type="checkbox"
                checked={sameAsRequester}
                onChange={(event) => setSameAsRequester(event.target.checked)}
                className="h-4 w-4"
              />
              Same as requester
            </label>
          </div>
        </CardHeader>
        {!sameAsRequester ? (
          <CardContent className="space-y-3">
            <div>
              <Label htmlFor="requestedFor-company" required>Company</Label>
              <Combobox
              id="requestedFor-company"
              value={requestedForCompanyId}
              options={companies.map((company) => ({ value: company.id, label: company.name }))}
              onChange={(value) => {
                setRequestedForCompanyId(value);
                // Department and position belong to the company; reset them.
                setRequestedFor((current) => ({ ...current, departmentId: "" }));
              }}
            />
              <FieldError message={errors.requestedForCompanyId} />
            </div>
            <ParticipantFields
              prefix="requestedFor"
              participant={requestedFor}
              onChange={setRequestedFor}
              departments={requestedForDepartments}
              positions={requestedForPositions}
              errors={errors}
            />
          </CardContent>
        ) : (
          <CardContent>
            <p className="text-sm text-muted-foreground">
              This request is for yourself; your details above are used.
            </p>
          </CardContent>
        )}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            {itemMode === "APPLICATION"
              ? "Applications requested"
              : itemMode === "ASSET"
                ? "Assets requested"
                : allowsMixedItems
                  ? "What do you need?"
                  : "Request items"}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {items.map((item, index) => (
            <div key={item.key} className="rounded-md border p-3">
              <div className="flex items-start gap-3">
                <div className="grid flex-1 gap-3 sm:grid-cols-2">
                  {/* An all-in-one row picks its own kind first. */}
                  {allowsMixedItems ? (
                    <div className="sm:col-span-2">
                      <Label htmlFor={`field-item-kind-${index}`} required>What do you need?</Label>
                      <Select
                        id={`field-item-kind-${index}`}
                        value={item.rowType ?? "APPLICATION"}
                        onChange={(event) =>
                          setItems((current) =>
                            current.map((entry, i) =>
                              i === index
                                ? {
                                    ...entry,
                                    rowType: event.target.value as "APPLICATION" | "ASSET",
                                    applicationId: undefined,
                                    applicationRoleId: undefined,
                                    assetCategoryId: undefined,
                                    fieldValues: {},
                                  }
                                : entry,
                            ),
                          )
                        }
                      >
                        <option value="APPLICATION">Application access</option>
                        <option value="ASSET">Asset</option>
                      </Select>
                    </div>
                  ) : null}
                  {(allowsMixedItems ? (item.rowType ?? "APPLICATION") === "APPLICATION" : itemMode === "APPLICATION") ? (
                    <>
                      <div>
                        <Label htmlFor={`field-item-${index}`} required>Application</Label>
                        <Combobox
                          id={`field-item-${index}`}
                          value={item.applicationId ?? ""}
                          placeholder="Select an application…"
                          options={applications.map((application) => ({
                            value: application.id,
                            label: application.name,
                          }))}
                          onChange={(value) =>
                            setItems((current) =>
                              current.map((entry, i) =>
                                i === index
                                  ? { ...entry, applicationId: value, applicationRoleId: undefined, fieldValues: {} }
                                  : entry,
                              ),
                            )
                          }
                        />
                      </div>
                      <div>
                        <Label
                          htmlFor={`field-item-role-${index}`}
                          required={
                            (applications.find((application) => application.id === item.applicationId)?.roles ?? [])
                              .length > 0
                          }
                        >
                          Access role
                        </Label>
<Combobox
                          id={`field-item-role-${index}`}
                          value={item.applicationRoleId ?? ""}
                          placeholder="Select a role…"
                          disabled={!item.applicationId}
                          options={(
                            applications.find((application) => application.id === item.applicationId)?.roles ?? []
                          ).map((role) => ({ value: role.id, label: role.name }))}
                          onChange={(value) =>
                            setItems((current) =>
                              current.map((entry, i) =>
                                i === index ? { ...entry, applicationRoleId: value || undefined } : entry,
                              ),
                            )
                          }
                        />
                      </div>
                    </>
                  ) : (allowsMixedItems ? item.rowType === "ASSET" : itemMode === "ASSET") ? (
                    <div className="sm:col-span-2">
                      <Label htmlFor={`field-item-${index}`} required>Asset category</Label>
                      <Combobox
                        id={`field-item-${index}`}
                        value={item.assetCategoryId ?? ""}
                        placeholder="Select a category…"
                        options={assetCategories.map((category) => ({
                          value: category.id,
                          label: category.name,
                        }))}
                        onChange={(value) =>
                          setItems((current) =>
                            current.map((entry, i) =>
                              i === index ? { ...entry, assetCategoryId: value, fieldValues: {} } : entry,
                            ),
                          )
                        }
                      />
                    </div>
                  ) : (
                    <div className="sm:col-span-2">
                      <Label htmlFor={`field-item-${index}`} required>Description</Label>
                      <Textarea
                        id={`field-item-${index}`}
                        value={item.description ?? ""}
                        onChange={(event) =>
                          setItems((current) =>
                            current.map((entry, i) =>
                              i === index ? { ...entry, description: event.target.value } : entry,
                            ),
                          )
                        }
                        placeholder="Describe what is required…"
                      />
                    </div>
                  )}
                  {itemMode !== "ROLE_CHANGE" && itemMode !== "GENERAL" ? (
                    <div className="sm:col-span-2">
                      <Label htmlFor={`field-item-notes-${index}`}>Notes (optional)</Label>
                      <Input
                        id={`field-item-notes-${index}`}
                        value={item.description ?? ""}
                        onChange={(event) =>
                          setItems((current) =>
                            current.map((entry, i) =>
                              i === index ? { ...entry, description: event.target.value } : entry,
                            ),
                          )
                        }
                        placeholder="Additional context for this item"
                      />
                    </div>
                  ) : null}
                </div>
                {items.length > 1 ? (
                  <button
                    type="button"
                    onClick={() => setItems((current) => current.filter((_, i) => i !== index))}
                    className="mt-6 text-muted-foreground hover:text-destructive"
                    aria-label={`Remove item ${index + 1}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                ) : null}
              </div>
              {/* Questions defined on the chosen application or category, so an
                  all-in-one form asks exactly what that target needs. */}
              {(() => {
                const targetId = item.applicationId || item.assetCategoryId;
                const targetFields = targetId ? requestFieldsByTarget[targetId] ?? [] : [];
                if (targetFields.length === 0) return null;
                return (
                  <div className="mt-3 grid gap-4 border-t pt-3 sm:grid-cols-2">
                    {targetFields.map((field) => (
                      <DynamicField
                        key={field.fieldKey}
                        field={field}
                        idPrefix={`item-${index}`}
                        value={item.fieldValues[field.fieldKey]}
                        error={errors[`item_${index}_${field.fieldKey}`]}
                        onChange={(value) =>
                          setItems((current) =>
                            current.map((entry, i) =>
                              i === index
                                ? { ...entry, fieldValues: { ...entry.fieldValues, [field.fieldKey]: value } }
                                : entry,
                            ),
                          )
                        }
                      />
                    ))}
                  </div>
                );
              })()}
              <FieldError message={errors[`item-${index}`]} />
            </div>
          ))}
          {fixedApplicationId || fixedAssetCategoryId ? null : (
            <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setItems((current) => [
              ...current,
              {
                fieldValues: {},
                key: Date.now(),
                ...(allowsMixedItems ? { rowType: "APPLICATION" as const } : {}),
                ...(fixedApplicationId ? { applicationId: fixedApplicationId } : {}),
                ...(fixedAssetCategoryId ? { assetCategoryId: fixedAssetCategoryId } : {}),
              },
            ])}
          >
            <Plus className="h-4 w-4" /> Add another item
          </Button>
          )}
          <p className="text-xs text-muted-foreground">
            Each item is approved and implemented independently.
          </p>
        </CardContent>
      </Card>

      {visibleFields.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Request details</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            {visibleFields.map((field) => (
              <DynamicField
                key={field.fieldKey}
                field={field}
                value={values[field.fieldKey]}
                error={errors[field.fieldKey]}
                onChange={(value) => setFieldValue(field.fieldKey, value)}
              />
            ))}
          </CardContent>
        </Card>
      ) : null}

      <Button type="submit" size="lg" className="w-full" loading={loading}>
        Submit request
      </Button>
    </form>
  );
}

function ParticipantCard({
  title,
  prefix,
  participant,
  onChange,
  departments,
  positions,
  errors,
  companySelect,
}: {
  title: string;
  prefix: string;
  participant: ParticipantDraft;
  onChange: (participant: ParticipantDraft) => void;
  departments: { id: string; name: string }[];
  positions: { id: string; name: string }[];
  errors: Record<string, string>;
  /** Company picker rendered above the participant's other fields. */
  companySelect?: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {companySelect}
        <ParticipantFields
          prefix={prefix}
          participant={participant}
          onChange={onChange}
          departments={departments}
          positions={positions}
          errors={errors}
        />
      </CardContent>
    </Card>
  );
}

function ParticipantFields({
  prefix,
  participant,
  onChange,
  departments,
  positions,
  errors,
}: {
  prefix: string;
  participant: ParticipantDraft;
  onChange: (participant: ParticipantDraft) => void;
  departments: { id: string; name: string }[];
  positions: { id: string; name: string }[];
  errors: Record<string, string>;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div>
        <Label htmlFor={`field-${prefix}Name`} required>Employee name</Label>
        <Input
          id={`field-${prefix}Name`}
          value={participant.name}
          onChange={(event) => onChange({ ...participant, name: event.target.value })}
          aria-invalid={!!errors[`${prefix}Name`]}
        />
        <FieldError message={errors[`${prefix}Name`]} />
      </div>
      <div>
        <Label htmlFor={`field-${prefix}EmployeeId`} required>Employee ID</Label>
        <Input
          id={`field-${prefix}EmployeeId`}
          value={participant.employeeId}
          onChange={(event) => onChange({ ...participant, employeeId: event.target.value })}
          aria-invalid={!!errors[`${prefix}EmployeeId`]}
        />
        <FieldError message={errors[`${prefix}EmployeeId`]} />
      </div>
      <div>
        <Label htmlFor={`field-${prefix}Email`} required>Work email</Label>
        <Input
          id={`field-${prefix}Email`}
          type="email"
          value={participant.email}
          onChange={(event) => onChange({ ...participant, email: event.target.value })}
          aria-invalid={!!errors[`${prefix}Email`]}
        />
        <FieldError message={errors[`${prefix}Email`]} />
      </div>
      <div>
        <Label htmlFor={`field-${prefix}DepartmentId`} required>Department</Label>
        <Combobox
          id={`field-${prefix}DepartmentId`}
          value={participant.departmentId}
          placeholder="Select…"
          aria-invalid={!!errors[`${prefix}DepartmentId`]}
          options={departments.map((department) => ({ value: department.id, label: department.name }))}
          onChange={(value) => onChange({ ...participant, departmentId: value })}
        />
        <FieldError message={errors[`${prefix}DepartmentId`]} />
      </div>
      <div>
        <Label htmlFor={`field-${prefix}PositionTitle`} required>Position</Label>
        {/* Free text with suggestions: a new joiner may need a position that is
            not in the catalogue yet, which IT confirms before creating them. */}
        <Input
          id={`field-${prefix}PositionTitle`}
          list={`positions-${prefix}`}
          value={participant.positionTitle}
          placeholder="e.g. Front Office Agent"
          onChange={(event) => onChange({ ...participant, positionTitle: event.target.value })}
          aria-invalid={!!errors[`${prefix}PositionTitle`]}
        />
        <datalist id={`positions-${prefix}`}>
          {positions.map((position) => (
            <option key={position.id} value={position.name} />
          ))}
        </datalist>
        <FieldError message={errors[`${prefix}PositionTitle`]} />
      </div>
    </div>
  );
}

function DynamicField({
  field,
  value,
  error,
  onChange,
  idPrefix = "field",
}: {
  field: PublicField;
  value: string | string[] | undefined;
  error?: string;
  onChange: (value: string | string[]) => void;
  /** Set when the same field renders once per request item. */
  idPrefix?: string;
}) {
  const id = `${idPrefix}-${field.fieldKey}`;
  const wide = ["PARAGRAPH", "MULTI_SELECT", "CHECKBOX"].includes(field.fieldType);

  return (
    <div className={wide ? "sm:col-span-2" : undefined}>
      <Label htmlFor={id} required={field.isRequired}>
        {field.label}
      </Label>
      {field.fieldType === "PARAGRAPH" ? (
        <Textarea
          id={id}
          value={(value as string) ?? ""}
          placeholder={field.placeholder ?? undefined}
          onChange={(event) => onChange(event.target.value)}
          aria-invalid={!!error}
        />
      ) : field.fieldType === "DROPDOWN" ? (
        <Select id={id} value={(value as string) ?? ""} onChange={(event) => onChange(event.target.value)} aria-invalid={!!error}>
          <option value="">Select…</option>
          {field.options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </Select>
      ) : field.fieldType === "RADIO" ? (
        <div role="radiogroup" aria-labelledby={id} className="mt-1 space-y-1.5">
          {field.options.map((option) => (
            <label key={option} className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name={id}
                value={option}
                checked={value === option}
                onChange={() => onChange(option)}
                className="h-4 w-4 accent-[hsl(var(--primary))]"
              />
              {option}
            </label>
          ))}
        </div>
      ) : field.fieldType === "MULTI_SELECT" || field.fieldType === "CHECKBOX" ? (
        <div className="mt-1 grid gap-1.5 sm:grid-cols-2">
          {field.options.map((option) => {
            const selected = Array.isArray(value) ? value : [];
            return (
              <label key={option} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={selected.includes(option)}
                  onChange={(event) =>
                    onChange(
                      event.target.checked
                        ? [...selected, option]
                        : selected.filter((entry) => entry !== option),
                    )
                  }
                  className="h-4 w-4 accent-[hsl(var(--primary))]"
                />
                {option}
              </label>
            );
          })}
        </div>
      ) : field.fieldType === "YES_NO" ? (
        <Select id={id} value={(value as string) ?? ""} onChange={(event) => onChange(event.target.value)} aria-invalid={!!error}>
          <option value="">Select…</option>
          <option value="yes">Yes</option>
          <option value="no">No</option>
        </Select>
      ) : field.fieldType === "FILE_UPLOAD" ? (
        <Input id={id} type="file" onChange={(event) => onChange(event.target.value)} aria-invalid={!!error} />
      ) : (
        <Input
          id={id}
          type={
            field.fieldType === "EMAIL"
              ? "email"
              : field.fieldType === "NUMBER"
                ? "number"
                : field.fieldType === "PHONE"
                  ? "tel"
                  : field.fieldType === "DATE"
                    ? "date"
                    : field.fieldType === "TIME"
                      ? "time"
                      : field.fieldType === "DATETIME"
                        ? "datetime-local"
                        : "text"
          }
          value={(value as string) ?? ""}
          placeholder={field.placeholder ?? undefined}
          onChange={(event) => onChange(event.target.value)}
          aria-invalid={!!error}
        />
      )}
      <HelperText>{field.helpText}</HelperText>
      <FieldError message={error} />
    </div>
  );
}
