"use client";

import { useState } from "react";
import { Pencil, Plus, Power, Upload, Trash2, GripVertical } from "lucide-react";
import {
  createManufacturerAction,
  updateManufacturerAction,
  setManufacturerActiveAction,
  createVendorAction,
  updateVendorAction,
  setVendorActiveAction,
  uploadVendorLogoAction,
  removeVendorLogoAction,
  createAssetModelAction,
  updateAssetModelAction,
  setAssetModelActiveAction,
  uploadAssetModelImageAction,
  removeAssetModelImageAction,
  createCustomFieldAction,
  updateCustomFieldAction,
  setCustomFieldActiveAction,
  saveFieldSetAction,
  setFieldSetActiveAction,
  createCurrencyAction,
  updateCurrencyAction,
  setCurrencyActiveAction,
  setBaseCurrencyAction,
} from "@/modules/catalogs/actions";
import { CUSTOM_FIELD_FORMAT_LABELS, type CustomFieldFormat } from "@/modules/catalogs/format";
import { useAction } from "@/shared/ui/use-action";
import type { ActionResult } from "@/shared/errors";
import { Button } from "@/shared/ui/button";
import { Input, Select, Textarea, Label, FieldError, HelperText } from "@/shared/ui/input";
import { Combobox } from "@/shared/ui/combobox";
import { Dialog, DialogContent, DialogTrigger } from "@/shared/ui/dialog";

function ToggleButton({ isActive, onToggle }: { isActive: boolean; onToggle: () => Promise<ActionResult<undefined>> }) {
  const { run, loading } = useAction();
  return (
    <Button
      variant="ghost" size="icon" loading={loading}
      aria-label={isActive ? "Disable" : "Enable"} title={isActive ? "Disable" : "Enable"}
      onClick={() => run(() => onToggle(), { successMessage: isActive ? "Disabled." : "Enabled." })}
    >
      <Power className={isActive ? "h-4 w-4 text-success" : "h-4 w-4 text-muted-foreground"} />
    </Button>
  );
}

// ---------------------------------------------------------------------------
// Manufacturers
// ---------------------------------------------------------------------------

export function ManufacturerDialog({ manufacturer }: { manufacturer?: { id: string; name: string } }) {
  const { run, loading, fieldErrors } = useAction();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(manufacturer?.name ?? "");
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {manufacturer ? (
          <Button variant="ghost" size="icon" aria-label={`Edit ${manufacturer.name}`}><Pencil className="h-4 w-4" /></Button>
        ) : (
          <Button size="sm"><Plus className="h-4 w-4" /> New manufacturer</Button>
        )}
      </DialogTrigger>
      <DialogContent title={manufacturer ? "Edit manufacturer" : "New manufacturer"}>
        <div className="space-y-3">
          <div>
            <Label htmlFor="mfr-name" required>Name</Label>
            <Input id="mfr-name" value={name} onChange={(e) => setName(e.target.value)} />
            <FieldError message={fieldErrors.name} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              loading={loading}
              onClick={() =>
                run(() => (manufacturer ? updateManufacturerAction(manufacturer.id, { name }) : createManufacturerAction({ name })), {
                  successMessage: manufacturer ? "Manufacturer updated." : "Manufacturer added.",
                  onSuccess: () => setOpen(false),
                })
              }
            >
              {manufacturer ? "Save" : "Add"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function ManufacturerToggle({ id, isActive }: { id: string; isActive: boolean }) {
  return <ToggleButton isActive={isActive} onToggle={() => setManufacturerActiveAction(id, !isActive)} />;
}

// ---------------------------------------------------------------------------
// Vendors
// ---------------------------------------------------------------------------

export interface VendorRecord {
  id: string;
  name: string;
  contactName: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  notes: string | null;
}

export function VendorDialog({ vendor }: { vendor?: VendorRecord }) {
  const { run, loading, fieldErrors } = useAction();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    name: vendor?.name ?? "",
    contactName: vendor?.contactName ?? "",
    contactPhone: vendor?.contactPhone ?? "",
    contactEmail: vendor?.contactEmail ?? "",
    notes: vendor?.notes ?? "",
  });
  function submit() {
    const payload = {
      name: form.name,
      contactName: form.contactName || undefined,
      contactPhone: form.contactPhone || undefined,
      contactEmail: form.contactEmail || undefined,
      notes: form.notes || undefined,
    };
    run(() => (vendor ? updateVendorAction(vendor.id, payload) : createVendorAction(payload)), {
      successMessage: vendor ? "Vendor updated." : "Vendor added.",
      onSuccess: () => setOpen(false),
    });
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {vendor ? (
          <Button variant="ghost" size="icon" aria-label={`Edit ${vendor.name}`}><Pencil className="h-4 w-4" /></Button>
        ) : (
          <Button size="sm"><Plus className="h-4 w-4" /> New vendor</Button>
        )}
      </DialogTrigger>
      <DialogContent title={vendor ? "Edit vendor" : "New vendor"}>
        <div className="space-y-3">
          <div>
            <Label htmlFor="ven-name" required>Name</Label>
            <Input id="ven-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <FieldError message={fieldErrors.name} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="ven-contact">Contact name</Label>
              <Input id="ven-contact" value={form.contactName} onChange={(e) => setForm({ ...form, contactName: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="ven-phone">Contact phone</Label>
              <Input id="ven-phone" value={form.contactPhone} onChange={(e) => setForm({ ...form, contactPhone: e.target.value })} />
            </div>
          </div>
          <div>
            <Label htmlFor="ven-email">Contact email</Label>
            <Input id="ven-email" type="email" value={form.contactEmail} onChange={(e) => setForm({ ...form, contactEmail: e.target.value })} />
            <FieldError message={fieldErrors.contactEmail} />
          </div>
          <div>
            <Label htmlFor="ven-notes">Notes</Label>
            <Textarea id="ven-notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button loading={loading} onClick={submit}>{vendor ? "Save" : "Add"}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function VendorToggle({ id, isActive }: { id: string; isActive: boolean }) {
  return <ToggleButton isActive={isActive} onToggle={() => setVendorActiveAction(id, !isActive)} />;
}

/** Upload / replace / remove a vendor logo. */
export function VendorLogoControl({ vendorId, hasLogo }: { vendorId: string; hasLogo: boolean }) {
  const { run, loading } = useAction();
  function onFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const data = new FormData();
    data.set("file", file);
    run(() => uploadVendorLogoAction(vendorId, data), { successMessage: "Vendor logo saved." });
    event.target.value = "";
  }
  return (
    <div className="flex items-center gap-2">
      <label className="inline-flex cursor-pointer items-center gap-1 rounded-md border bg-card px-2.5 py-1.5 text-xs hover:bg-accent">
        <Upload className="h-3.5 w-3.5" /> {hasLogo ? "Replace" : "Upload"} logo
        <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="hidden" onChange={onFile} disabled={loading} />
      </label>
      {hasLogo ? (
        <Button variant="ghost" size="icon" loading={loading} aria-label="Remove logo" title="Remove logo"
          onClick={() => run(() => removeVendorLogoAction(vendorId), { successMessage: "Logo removed." })}>
          <Trash2 className="h-4 w-4 text-destructive" />
        </Button>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Asset models
// ---------------------------------------------------------------------------

export interface AssetModelRecord {
  id: string;
  name: string;
  manufacturerId: string | null;
  fieldSetId: string | null;
  notes: string | null;
}

export function AssetModelDialog({
  model,
  manufacturers,
  fieldSets,
}: {
  model?: AssetModelRecord;
  manufacturers: { id: string; name: string }[];
  fieldSets: { id: string; name: string }[];
}) {
  const { run, loading, fieldErrors } = useAction();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    name: model?.name ?? "",
    manufacturerId: model?.manufacturerId ?? "",
    fieldSetId: model?.fieldSetId ?? "",
    notes: model?.notes ?? "",
  });
  function submit() {
    const payload = {
      name: form.name,
      manufacturerId: form.manufacturerId || undefined,
      fieldSetId: form.fieldSetId || undefined,
      notes: form.notes || undefined,
    };
    run(() => (model ? updateAssetModelAction(model.id, payload) : createAssetModelAction(payload)), {
      successMessage: model ? "Model updated." : "Model added.",
      onSuccess: () => setOpen(false),
    });
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {model ? (
          <Button variant="ghost" size="icon" aria-label={`Edit ${model.name}`}><Pencil className="h-4 w-4" /></Button>
        ) : (
          <Button size="sm"><Plus className="h-4 w-4" /> New model</Button>
        )}
      </DialogTrigger>
      <DialogContent title={model ? "Edit model" : "New model"}>
        <div className="space-y-3">
          <div>
            <Label htmlFor="mdl-name" required>Model name</Label>
            <Input id="mdl-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <FieldError message={fieldErrors.name} />
          </div>
          <div>
            <Label htmlFor="mdl-mfr">Manufacturer</Label>
            <Combobox
              id="mdl-mfr" value={form.manufacturerId}
              placeholder="No manufacturer" emptyLabel="No manufacturer"
              options={manufacturers.map((m) => ({ value: m.id, label: m.name }))}
              onChange={(value) => setForm({ ...form, manufacturerId: value })}
            />
          </div>
          <div>
            <Label htmlFor="mdl-fieldset">Fieldset</Label>
            <Combobox
              id="mdl-fieldset" value={form.fieldSetId}
              placeholder="No custom fields" emptyLabel="No custom fields"
              options={fieldSets.map((f) => ({ value: f.id, label: f.name }))}
              onChange={(value) => setForm({ ...form, fieldSetId: value })}
            />
            <HelperText>Assets of this model will collect the fields in this fieldset (e.g. MAC, IMEI).</HelperText>
          </div>
          <div>
            <Label htmlFor="mdl-notes">Notes</Label>
            <Textarea id="mdl-notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button loading={loading} onClick={submit}>{model ? "Save" : "Add"}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function AssetModelToggle({ id, isActive }: { id: string; isActive: boolean }) {
  return <ToggleButton isActive={isActive} onToggle={() => setAssetModelActiveAction(id, !isActive)} />;
}

/** Upload / replace / remove the default image for an asset model. */
export function ModelImageControl({ modelId, hasImage }: { modelId: string; hasImage: boolean }) {
  const { run, loading } = useAction();
  function onFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const data = new FormData();
    data.set("file", file);
    run(() => uploadAssetModelImageAction(modelId, data), { successMessage: "Image saved." });
    event.target.value = "";
  }
  return (
    <div className="flex items-center gap-2">
      <label className="inline-flex cursor-pointer items-center gap-1 rounded-md border bg-card px-2.5 py-1.5 text-xs hover:bg-accent">
        <Upload className="h-3.5 w-3.5" /> {hasImage ? "Replace" : "Upload"} image
        <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={onFile} disabled={loading} />
      </label>
      {hasImage ? (
        <Button
          variant="ghost" size="icon" loading={loading} aria-label="Remove image" title="Remove image"
          onClick={() => run(() => removeAssetModelImageAction(modelId), { successMessage: "Image removed." })}
        >
          <Trash2 className="h-4 w-4 text-destructive" />
        </Button>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Custom fields
// ---------------------------------------------------------------------------

const FORMAT_OPTIONS = Object.entries(CUSTOM_FIELD_FORMAT_LABELS) as [CustomFieldFormat, string][];

export interface CustomFieldRecord {
  id: string;
  name: string;
  format: CustomFieldFormat;
  helpText: string | null;
}

export function CustomFieldDialog({ field }: { field?: CustomFieldRecord }) {
  const { run, loading, fieldErrors } = useAction();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    name: field?.name ?? "",
    format: field?.format ?? ("TEXT" as CustomFieldFormat),
    helpText: field?.helpText ?? "",
  });
  function submit() {
    const payload = { name: form.name, format: form.format, helpText: form.helpText || undefined };
    run(() => (field ? updateCustomFieldAction(field.id, payload) : createCustomFieldAction(payload)), {
      successMessage: field ? "Custom field updated." : "Custom field added.",
      onSuccess: () => setOpen(false),
    });
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {field ? (
          <Button variant="ghost" size="icon" aria-label={`Edit ${field.name}`}><Pencil className="h-4 w-4" /></Button>
        ) : (
          <Button size="sm"><Plus className="h-4 w-4" /> New custom field</Button>
        )}
      </DialogTrigger>
      <DialogContent title={field ? "Edit custom field" : "New custom field"}>
        <div className="space-y-3">
          <div>
            <Label htmlFor="cf-name" required>Field name</Label>
            <Input id="cf-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. MAC address" />
            <FieldError message={fieldErrors.name} />
          </div>
          <div>
            <Label htmlFor="cf-format" required>Format</Label>
            <Select id="cf-format" value={form.format} onChange={(e) => setForm({ ...form, format: e.target.value as CustomFieldFormat })}>
              {FORMAT_OPTIONS.map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </Select>
            <HelperText>The format validates what can be entered for this field.</HelperText>
          </div>
          <div>
            <Label htmlFor="cf-help">Help text</Label>
            <Input id="cf-help" value={form.helpText} onChange={(e) => setForm({ ...form, helpText: e.target.value })} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button loading={loading} onClick={submit}>{field ? "Save" : "Add"}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function CustomFieldToggle({ id, isActive }: { id: string; isActive: boolean }) {
  return <ToggleButton isActive={isActive} onToggle={() => setCustomFieldActiveAction(id, !isActive)} />;
}

// ---------------------------------------------------------------------------
// Fieldsets
// ---------------------------------------------------------------------------

export interface FieldSetRecord {
  id: string;
  name: string;
  fields: { customFieldId: string; required: boolean }[];
}

export function FieldSetDialog({
  fieldSet,
  customFields,
}: {
  fieldSet?: FieldSetRecord;
  customFields: { id: string; name: string }[];
}) {
  const { run, loading, fieldErrors } = useAction();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(fieldSet?.name ?? "");
  const [rows, setRows] = useState<{ customFieldId: string; required: boolean }[]>(fieldSet?.fields ?? []);

  const available = customFields.filter((cf) => !rows.some((row) => row.customFieldId === cf.id));

  function addField(id: string) {
    if (!id) return;
    setRows((current) => [...current, { customFieldId: id, required: false }]);
  }
  function move(index: number, dir: -1 | 1) {
    setRows((current) => {
      const target = index + dir;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target]!, next[index]!];
      return next;
    });
  }
  function submit() {
    run(() => saveFieldSetAction({ name, fields: rows }, fieldSet?.id), {
      successMessage: fieldSet ? "Fieldset updated." : "Fieldset created.",
      onSuccess: () => setOpen(false),
    });
  }
  const nameFor = (id: string) => customFields.find((cf) => cf.id === id)?.name ?? "None";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {fieldSet ? (
          <Button variant="ghost" size="icon" aria-label={`Edit ${fieldSet.name}`}><Pencil className="h-4 w-4" /></Button>
        ) : (
          <Button size="sm"><Plus className="h-4 w-4" /> New fieldset</Button>
        )}
      </DialogTrigger>
      <DialogContent title={fieldSet ? "Edit fieldset" : "New fieldset"} wide>
        <div className="space-y-3">
          <div>
            <Label htmlFor="fs-name" required>Fieldset name</Label>
            <Input id="fs-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Assets with MAC and IMEI" />
            <FieldError message={fieldErrors.name} />
          </div>
          {available.length > 0 ? (
            <div>
              <Label htmlFor="fs-add">Add a field</Label>
              <Combobox
                id="fs-add" value=""
                placeholder="Select a custom field to add"
                options={available.map((cf) => ({ value: cf.id, label: cf.name }))}
                onChange={addField}
              />
            </div>
          ) : null}
          <div>
            <Label>Fields</Label>
            {rows.length === 0 ? (
              <p className="rounded-md border border-dashed px-3 py-4 text-sm text-muted-foreground">
                No fields yet. Add custom fields using the dropdown above.
              </p>
            ) : (
              <ul className="space-y-2">
                {rows.map((row, index) => (
                  <li key={row.customFieldId} className="flex items-center gap-2 rounded-md border bg-card px-3 py-2">
                    <div className="flex flex-col">
                      <button type="button" aria-label="Move up" className="text-muted-foreground hover:text-foreground disabled:opacity-30" disabled={index === 0} onClick={() => move(index, -1)}>▲</button>
                      <button type="button" aria-label="Move down" className="text-muted-foreground hover:text-foreground disabled:opacity-30" disabled={index === rows.length - 1} onClick={() => move(index, 1)}>▼</button>
                    </div>
                    <GripVertical className="h-4 w-4 text-muted-foreground" aria-hidden />
                    <span className="flex-1 text-sm font-medium">{nameFor(row.customFieldId)}</span>
                    <label className="flex items-center gap-1.5 text-xs">
                      <input
                        type="checkbox" className="h-4 w-4" checked={row.required}
                        onChange={(e) => setRows((current) => current.map((r, i) => (i === index ? { ...r, required: e.target.checked } : r)))}
                      />
                      Required
                    </label>
                    <Button variant="ghost" size="icon" aria-label="Remove field" onClick={() => setRows((current) => current.filter((_, i) => i !== index))}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button loading={loading} onClick={submit} disabled={!name.trim()}>{fieldSet ? "Save" : "Create"}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function FieldSetToggle({ id, isActive }: { id: string; isActive: boolean }) {
  return <ToggleButton isActive={isActive} onToggle={() => setFieldSetActiveAction(id, !isActive)} />;
}

// ---------------------------------------------------------------------------
// Currencies
// ---------------------------------------------------------------------------

export interface CurrencyRecord {
  id: string;
  code: string;
  name: string;
  rateToBase: number;
}

export function CurrencyDialog({ currency }: { currency?: CurrencyRecord }) {
  const { run, loading, fieldErrors } = useAction();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    code: currency?.code ?? "",
    name: currency?.name ?? "",
    rateToBase: currency?.rateToBase !== undefined ? String(currency.rateToBase) : "1",
  });
  function submit() {
    const payload = { code: form.code, name: form.name, rateToBase: Number(form.rateToBase) };
    run(() => (currency ? updateCurrencyAction(currency.id, payload) : createCurrencyAction(payload)), {
      successMessage: currency ? "Currency updated." : "Currency added.",
      onSuccess: () => setOpen(false),
    });
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {currency ? (
          <Button variant="ghost" size="icon" aria-label={`Edit ${currency.code}`}><Pencil className="h-4 w-4" /></Button>
        ) : (
          <Button size="sm"><Plus className="h-4 w-4" /> New currency</Button>
        )}
      </DialogTrigger>
      <DialogContent title={currency ? "Edit currency" : "New currency"}>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="cur-code" required>Code</Label>
              <Input id="cur-code" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} placeholder="USD" maxLength={10} />
              <FieldError message={fieldErrors.code} />
            </div>
            <div>
              <Label htmlFor="cur-rate" required>Rate to base</Label>
              <Input id="cur-rate" type="number" step="0.000001" min={0} value={form.rateToBase} onChange={(e) => setForm({ ...form, rateToBase: e.target.value })} />
              <FieldError message={fieldErrors.rateToBase} />
            </div>
          </div>
          <div>
            <Label htmlFor="cur-name" required>Name</Label>
            <Input id="cur-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="US Dollar" />
            <FieldError message={fieldErrors.name} />
          </div>
          <HelperText>Rate = value of one unit of this currency in the base currency (base currency rate is 1).</HelperText>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button loading={loading} onClick={submit} disabled={!form.code || !form.name}>{currency ? "Save" : "Add"}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function CurrencyToggle({ id, isActive }: { id: string; isActive: boolean }) {
  return <ToggleButton isActive={isActive} onToggle={() => setCurrencyActiveAction(id, !isActive)} />;
}

export function BaseCurrencyForm({ current, currencies }: { current: string; currencies: { code: string; name: string }[] }) {
  const { run, loading } = useAction();
  const [code, setCode] = useState(current);
  return (
    <div className="flex items-end gap-2 rounded-md border bg-muted/30 p-3">
      <div className="w-64">
        <Label htmlFor="base-currency">Base (reporting) currency</Label>
        <Combobox
          id="base-currency" value={code}
          options={currencies.map((c) => ({ value: c.code, label: `${c.code} - ${c.name}` }))}
          onChange={setCode}
        />
      </div>
      <Button
        size="sm"
        loading={loading}
        disabled={code === current}
        onClick={() => run(() => setBaseCurrencyAction(code), { successMessage: "Base currency updated." })}
      >
        Set base
      </Button>
    </div>
  );
}
