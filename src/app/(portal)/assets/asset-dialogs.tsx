"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, Copy, UserPlus, Undo2, Wrench, Trash2, ClipboardCheck } from "lucide-react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import {
  createAssetAction,
  updateAssetAction,
  setAssetStatusAction,
  createAssetCategoryAction,
  assignAssetAction,
  returnAssetAction,
  createMaintenanceAction,
  setMaintenanceStatusAction,
  deleteAssetAction,
  startClearanceAction,
  verifyClearanceItemAction,
  completeClearanceAction,
  cancelClearanceAction,
  removeClearanceItemAction,
} from "@/modules/assets/actions";
import {
  quickCreateManufacturerAction,
  quickCreateVendorAction,
  quickCreateAssetModelAction,
  quickCreateCategoryAction,
  quickCreateLocationAction,
} from "@/modules/catalogs/actions";
import { useAction } from "@/shared/ui/use-action";
import { useToast } from "@/shared/ui/toast";
import { Button } from "@/shared/ui/button";
import { Input, Select, Textarea, Label, FieldError, HelperText } from "@/shared/ui/input";
import { Combobox } from "@/shared/ui/combobox";
import { PersonPicker } from "@/shared/ui/person-picker";
import { Dialog, DialogContent, DialogTrigger } from "@/shared/ui/dialog";
import { StatusBadge } from "@/shared/ui/badge";
import { CUSTOM_FIELD_PLACEHOLDERS, type CustomFieldFormat } from "@/modules/catalogs/format";
import type { ActionResult } from "@/shared/errors";

/** Wrap a quick-create action into the Combobox onCreate contract, toasting failures. */
function useCreateHandler() {
  const { toast } = useToast();
  return function handler(fn: (label: string) => Promise<ActionResult<{ value: string; label: string }>>) {
    return async (label: string) => {
      const result = await fn(label);
      if (result.ok) return result.data;
      toast("error", result.error);
      return null;
    };
  };
}

interface Company { id: string; name: string }
interface Category { id: string; name: string }
interface LocationOption { id: string; name: string; companyId: string }
interface PersonOption { id: string; name: string }

/** Categories are global, so this dialog has no company selector. */
export function CategoryDialog({
  workflows = [],
}: {
  workflows?: { id: string; name: string }[];
}) {
  const { run, loading, fieldErrors } = useAction();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    workflowId: "",
    name: "",
    description: "",
    requireHandoverAcceptance: true,
    requireClearanceRecovery: true,
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Plus className="h-4 w-4" /> New category
        </Button>
      </DialogTrigger>
      <DialogContent title="New asset category">
        <div className="space-y-3">
          <div>
            <Label htmlFor="cat-name" required>Category name</Label>
            <Input id="cat-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Laptop, Mobile Phone, SIM Card" />
            <FieldError message={fieldErrors.name} />
          </div>
          <div>
            <Label htmlFor="cat-description">Description</Label>
            <Textarea id="cat-description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          {workflows.length > 0 ? (
            <div>
              <Label htmlFor="cat-workflow">Approval chain</Label>
              <Select id="cat-workflow" value={form.workflowId}
                onChange={(e) => setForm({ ...form, workflowId: e.target.value })}>
                <option value="">Use the form&apos;s approval chain</option>
                {workflows.map((workflow) => (
                  <option key={workflow.id} value={workflow.id}>{workflow.name}</option>
                ))}
              </Select>
              <HelperText>
                Set this so requests for this kind of asset route to their own approvers, even from
                an all-in-one form.
              </HelperText>
            </div>
          ) : null}
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.requireHandoverAcceptance}
              onChange={(e) => setForm({ ...form, requireHandoverAcceptance: e.target.checked })} className="h-4 w-4" />
            Require electronic handover acknowledgement
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.requireClearanceRecovery}
              onChange={(e) => setForm({ ...form, requireClearanceRecovery: e.target.checked })} className="h-4 w-4" />
            Require recovery during clearance
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              loading={loading}
              onClick={() =>
                run(
                  () =>
                    createAssetCategoryAction({
                      workflowId: form.workflowId || undefined,
                      name: form.name,
                      description: form.description || undefined,
                      requireHandoverAcceptance: form.requireHandoverAcceptance,
                      requireClearanceRecovery: form.requireClearanceRecovery,
                    }),
                  { successMessage: "Category created.", onSuccess: () => setOpen(false) },
                )
              }
            >
              Create category
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export interface AssetFormRecord {
  id: string;
  companyId: string;
  categoryId: string;
  name: string;
  assetTag: string | null;
  serialNumber: string | null;
  manufacturer: string | null;
  model: string | null;
  locationId: string | null;
  supplier: string | null;
  warrantyExpiry: string | null;
  notes: string | null;
  status: string;
  customFields: Record<string, string> | null;
}

export interface AssetModelOption {
  name: string;
  manufacturer: string | null;
  fields: { customFieldId: string; name: string; format: CustomFieldFormat; required: boolean; helpText: string | null }[];
}

export interface AssetCatalogs {
  manufacturers: { name: string }[];
  models: AssetModelOption[];
  vendors: { name: string }[];
}

export function AssetDialog({
  companies,
  categories,
  locations,
  catalogs,
  people = [],
  asset,
  cloneFrom,
  triggerIcon,
}: {
  companies: Company[];
  categories: Category[];
  locations: LocationOption[];
  catalogs: AssetCatalogs;
  people?: { id: string; name: string; companyId: string }[];
  asset?: AssetFormRecord;
  cloneFrom?: AssetFormRecord;
  triggerIcon?: boolean;
}) {
  const { run, loading, fieldErrors } = useAction();
  const createHandler = useCreateHandler();
  const [open, setOpen] = useState(false);
  const [assignPersonId, setAssignPersonId] = useState("");
  // Clone reuses the shared fields (company/category/manufacturer/model/vendor/
  // location/warranty/notes) but leaves the per-unit ones (name, serial, tag,
  // model fields) blank so each new record gets its own.
  const base = asset ?? cloneFrom;
  const [form, setForm] = useState({
    companyId: base?.companyId ?? companies[0]?.id ?? "",
    categoryId: base?.categoryId ?? "",
    name: asset?.name ?? "",
    assetTag: asset?.assetTag ?? "",
    serialNumber: asset?.serialNumber ?? "",
    manufacturer: base?.manufacturer ?? "",
    model: base?.model ?? "",
    locationId: base?.locationId ?? "",
    supplier: base?.supplier ?? "",
    warrantyExpiry: base?.warrantyExpiry ?? "",
    notes: base?.notes ?? "",
  });
  const [customFields, setCustomFields] = useState<Record<string, string>>(asset?.customFields ?? {});
  const companyLocations = locations.filter((location) => location.companyId === form.companyId);
  const manufacturerModels = catalogs.models.filter(
    (model) => !form.manufacturer || model.manufacturer === form.manufacturer || !model.manufacturer,
  );
  const selectedModel = catalogs.models.find((model) => model.name === form.model);
  const modelFields = selectedModel?.fields ?? [];

  async function submit(addAnother = false) {
    const payload = {
      companyId: form.companyId,
      categoryId: form.categoryId,
      name: form.name,
      assetTag: form.assetTag || undefined,
      serialNumber: form.serialNumber || undefined,
      manufacturer: form.manufacturer || undefined,
      model: form.model || undefined,
      locationId: form.locationId || undefined,
      supplier: form.supplier || undefined,
      warrantyExpiry: form.warrantyExpiry || undefined,
      notes: form.notes || undefined,
      customFields: modelFields.length > 0 ? customFields : undefined,
    };
    if (asset) {
      await run(() => updateAssetAction(asset.id, payload), { successMessage: "Asset updated.", onSuccess: () => setOpen(false) });
      return;
    }
    await run(() => createAssetAction(payload), {
      successMessage: assignPersonId ? "Asset created and assigned." : "Asset created.",
      onSuccess: async (data) => {
        if (assignPersonId) {
          await assignAssetAction({ assetId: data.id, personId: assignPersonId });
        }
        setAssignPersonId("");
        if (addAnother) {
          // Keep the shared fields; clear the per-unit ones for the next unit.
          setForm((current) => ({ ...current, name: "", assetTag: "", serialNumber: "" }));
          setCustomFields({});
        } else {
          setOpen(false);
        }
      },
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {asset ? (
          <Button variant="ghost" size="icon" aria-label={`Edit ${asset.name}`}>
            <Pencil className="h-4 w-4" />
          </Button>
        ) : cloneFrom ? (
          <Button variant="ghost" size="icon" aria-label={`Clone ${cloneFrom.name}`} title="Clone">
            <Copy className="h-4 w-4" />
          </Button>
        ) : triggerIcon ? (
          <Button variant="ghost" size="icon" aria-label="New asset">
            <Plus className="h-4 w-4" />
          </Button>
        ) : (
          <Button size="sm">
            <Plus className="h-4 w-4" /> New asset
          </Button>
        )}
      </DialogTrigger>
      <DialogContent
        title={asset ? `Edit asset: ${asset.name}` : cloneFrom ? `New asset (cloned from ${cloneFrom.name})` : "New asset"}
        wide
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="asset-company" required>Company</Label>
            <Combobox
              id="asset-company" value={form.companyId} disabled={!!asset}
              options={companies.map((company) => ({ value: company.id, label: company.name }))}
              onChange={(value) => setForm({ ...form, companyId: value, categoryId: "", locationId: "" })}
            />
            {asset ? (
              <HelperText>Use Transfer on the asset page to move it to another company.</HelperText>
            ) : null}
          </div>
          <div>
            <Label htmlFor="asset-category" required>Category</Label>
            <Combobox
              id="asset-category" value={form.categoryId}
              placeholder="Select category"
              options={categories.map((category) => ({ value: category.id, label: category.name }))}
              onChange={(value) => setForm({ ...form, categoryId: value })}
              onCreate={createHandler((label) => quickCreateCategoryAction(label))}
              createNoun="category"
            />
          </div>
          <div>
            <Label htmlFor="asset-name" required>Asset name</Label>
            <Input id="asset-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder={'e.g. "Front Desk Laptop 1"'} />
            <FieldError message={fieldErrors.name} />
          </div>
          <div>
            <Label htmlFor="asset-tag">Asset tag (optional)</Label>
            <Input id="asset-tag" value={form.assetTag} onChange={(e) => setForm({ ...form, assetTag: e.target.value })} />
            <FieldError message={fieldErrors.assetTag} />
          </div>
          <div>
            <Label htmlFor="asset-manufacturer">Manufacturer</Label>
            <Combobox
              id="asset-manufacturer" value={form.manufacturer}
              placeholder="Select manufacturer" emptyLabel="None"
              options={catalogs.manufacturers.map((manufacturer) => ({ value: manufacturer.name, label: manufacturer.name }))}
              onChange={(value) => setForm({ ...form, manufacturer: value, model: "" })}
              onCreate={createHandler(quickCreateManufacturerAction)}
              createNoun="manufacturer"
            />
            <HelperText>Managed in Settings, Manufacturers.</HelperText>
          </div>
          <div>
            <Label htmlFor="asset-model">Model</Label>
            <Combobox
              id="asset-model" value={form.model}
              placeholder="Select model" emptyLabel="None"
              options={manufacturerModels.map((model) => ({ value: model.name, label: model.name }))}
              onChange={(value) => setForm({ ...form, model: value })}
              onCreate={createHandler(quickCreateAssetModelAction)}
              createNoun="model"
            />
            {modelFields.length > 0 ? <HelperText>This model has custom fields below.</HelperText> : null}
          </div>
          <div>
            <Label htmlFor="asset-supplier">Vendor</Label>
            <Combobox
              id="asset-supplier" value={form.supplier}
              placeholder="Select vendor" emptyLabel="None"
              options={catalogs.vendors.map((vendor) => ({ value: vendor.name, label: vendor.name }))}
              onChange={(value) => setForm({ ...form, supplier: value })}
              onCreate={createHandler(quickCreateVendorAction)}
              createNoun="vendor"
            />
          </div>
          <div>
            <Label htmlFor="asset-serial">Serial number</Label>
            <Input id="asset-serial" value={form.serialNumber} onChange={(e) => setForm({ ...form, serialNumber: e.target.value })} />
          </div>
          <div>
            <Label htmlFor="asset-location">Location</Label>
            <Combobox
              id="asset-location" value={form.locationId}
              placeholder="No location" emptyLabel="No location"
              options={companyLocations.map((location) => ({ value: location.id, label: location.name }))}
              onChange={(value) => setForm({ ...form, locationId: value })}
              onCreate={form.companyId ? createHandler((label) => quickCreateLocationAction(form.companyId, label)) : undefined}
              createNoun="location"
            />
          </div>
          {!asset && !cloneFrom ? (
            <div className="sm:col-span-2">
              <Label htmlFor="asset-assign">Assign to (optional)</Label>
              <PersonPicker
                id="asset-assign"
                value={assignPersonId}
                companyId={form.companyId}
                people={people.filter((person) => person.companyId === form.companyId).map((person) => ({ id: person.id, name: person.name }))}
                placeholder="Leave unassigned"
                onChange={setAssignPersonId}
              />
              <HelperText>The asset will be assigned to this employee after creation. Create a new person with the button if needed.</HelperText>
            </div>
          ) : null}
          <div>
            <Label htmlFor="asset-warranty">Warranty expiry</Label>
            <Input id="asset-warranty" type="date" value={form.warrantyExpiry} onChange={(e) => setForm({ ...form, warrantyExpiry: e.target.value })} />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="asset-notes">Notes</Label>
            <Textarea id="asset-notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
          {modelFields.length > 0 ? (
            <div className="sm:col-span-2 rounded-md border bg-muted/30 p-3">
              <p className="mb-2 label-caps text-muted-foreground">
                {selectedModel?.name} details
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                {modelFields.map((field) => (
                  <div key={field.customFieldId}>
                    <Label htmlFor={`cf-${field.customFieldId}`} required={field.required}>{field.name}</Label>
                    <Input
                      id={`cf-${field.customFieldId}`}
                      value={customFields[field.customFieldId] ?? ""}
                      placeholder={CUSTOM_FIELD_PLACEHOLDERS[field.format] ?? ""}
                      onChange={(e) => setCustomFields((current) => ({ ...current, [field.customFieldId]: e.target.value }))}
                    />
                    {field.helpText ? <HelperText>{field.helpText}</HelperText> : null}
                    <FieldError message={fieldErrors[`cf_${field.customFieldId}`]} />
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          {cloneFrom ? (
            <Button
              variant="outline"
              onClick={() => submit(true)}
              loading={loading}
              disabled={!form.categoryId || !form.name.trim()}
            >
              Create &amp; add another
            </Button>
          ) : null}
          <Button onClick={() => submit(false)} loading={loading} disabled={!form.categoryId || !form.name.trim()}>
            {asset ? "Save changes" : "Create asset"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function AssetRowActions({
  asset,
  activeAssignmentId,
  activeMaintenanceId,
  companies,
  categories,
  locations,
  catalogs,
  people,
  permissions,
}: {
  asset: AssetFormRecord;
  activeAssignmentId: string | null;
  activeMaintenanceId: string | null;
  companies: Company[];
  categories: Category[];
  locations: LocationOption[];
  catalogs: AssetCatalogs;
  people: PersonOption[];
  permissions: { canManage: boolean; canAssign: boolean; canMaintain: boolean; canDispose: boolean };
}) {
  const router = useRouter();
  const { run, loading } = useAction();
  const [assignOpen, setAssignOpen] = useState(false);
  const [maintenanceOpen, setMaintenanceOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [personId, setPersonId] = useState("");
  const [maintForm, setMaintForm] = useState({ maintenanceType: "Repair", description: "", serviceProvider: "" });

  return (
    <div className="flex justify-end gap-1">
      {permissions.canManage ? (
        <>
          <AssetDialog companies={companies} categories={categories} locations={locations} catalogs={catalogs} asset={asset} />
          <AssetDialog companies={companies} categories={categories} locations={locations} catalogs={catalogs} cloneFrom={asset} />
        </>
      ) : null}

      {permissions.canAssign && asset.status === "AVAILABLE" ? (
        <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
          <DialogTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Assign asset" title="Assign">
              <UserPlus className="h-4 w-4 text-primary" />
            </Button>
          </DialogTrigger>
          <DialogContent title={`Assign ${asset.name}`} description="A handover acknowledgement email is sent automatically when the category requires it.">
            <Label htmlFor={`assign-person-${asset.id}`} required>Employee</Label>
            <Combobox
              id={`assign-person-${asset.id}`} value={personId}
              placeholder="Select employee…"
              options={people.map((person) => ({ value: person.id, label: person.name }))}
              onChange={setPersonId}
            />
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setAssignOpen(false)}>Cancel</Button>
              <Button
                loading={loading}
                disabled={!personId}
                onClick={() =>
                  run(() => assignAssetAction({ assetId: asset.id, personId }), {
                    successMessage: "Asset assigned.",
                    onSuccess: () => setAssignOpen(false),
                  })
                }
              >
                Assign asset
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      ) : null}

      {permissions.canAssign && activeAssignmentId ? (
        <Button
          variant="ghost" size="icon" loading={loading} aria-label="Return asset" title="Return"
          onClick={() => run(() => returnAssetAction(activeAssignmentId), { successMessage: "Asset returned." })}
        >
          <Undo2 className="h-4 w-4" />
        </Button>
      ) : null}

      {permissions.canMaintain && asset.status === "UNDER_REPAIR" && activeMaintenanceId ? (
        <Button
          variant="ghost"
          size="icon"
          loading={loading}
          aria-label="Complete maintenance"
          title="Complete maintenance"
          onClick={() =>
            run(() => setMaintenanceStatusAction(activeMaintenanceId, "COMPLETED"), {
              successMessage: "Maintenance completed; previous status restored.",
            })
          }
        >
          <Wrench className="h-4 w-4 text-success" />
        </Button>
      ) : null}

      {permissions.canMaintain &&
      asset.status !== "DISCARDED" &&
      asset.status !== "ASSIGNED" &&
      asset.status !== "UNDER_REPAIR" ? (
        <Dialog open={maintenanceOpen} onOpenChange={setMaintenanceOpen}>
          <DialogTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Schedule maintenance" title="Maintenance">
              <Wrench className="h-4 w-4 text-warning" />
            </Button>
          </DialogTrigger>
          <DialogContent title={`Maintenance for ${asset.name}`}>
            <div className="space-y-3">
              <div>
                <Label htmlFor={`maint-type-${asset.id}`} required>Maintenance type</Label>
                <Input id={`maint-type-${asset.id}`} value={maintForm.maintenanceType}
                  onChange={(e) => setMaintForm({ ...maintForm, maintenanceType: e.target.value })} />
              </div>
              <div>
                <Label htmlFor={`maint-desc-${asset.id}`} required>Description</Label>
                <Textarea id={`maint-desc-${asset.id}`} value={maintForm.description}
                  onChange={(e) => setMaintForm({ ...maintForm, description: e.target.value })} />
              </div>
              <div>
                <Label htmlFor={`maint-provider-${asset.id}`}>Service provider</Label>
                <Input id={`maint-provider-${asset.id}`} value={maintForm.serviceProvider}
                  onChange={(e) => setMaintForm({ ...maintForm, serviceProvider: e.target.value })} />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setMaintenanceOpen(false)}>Cancel</Button>
                <Button
                  loading={loading}
                  disabled={!maintForm.description}
                  onClick={() =>
                    run(
                      async () => {
                        const created = await createMaintenanceAction({
                          assetId: asset.id,
                          maintenanceType: maintForm.maintenanceType,
                          description: maintForm.description,
                          serviceProvider: maintForm.serviceProvider || undefined,
                          startDate: new Date().toISOString().slice(0, 10),
                        });
                        if (created.ok) {
                          return setMaintenanceStatusAction(created.data.id, "IN_PROGRESS");
                        }
                        return created;
                      },
                      { successMessage: "Maintenance started; asset marked Under Repair.", onSuccess: () => setMaintenanceOpen(false) },
                    )
                  }
                >
                  Start maintenance
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      ) : null}

      {permissions.canManage && (asset.status === "UNDER_REPAIR" || asset.status === "OUT_OF_ORDER" || asset.status === "RESERVED") ? (
        <Button
          variant="ghost" size="icon" loading={loading} aria-label="Mark available" title="Mark available"
          onClick={() => run(() => setAssetStatusAction(asset.id, "AVAILABLE"), { successMessage: "Asset marked Available." })}
        >
          <Undo2 className="h-4 w-4 text-success" />
        </Button>
      ) : null}

      {permissions.canManage && asset.status !== "ASSIGNED" ? (
        <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
          <DialogTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Delete asset" title="Delete">
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </DialogTrigger>
          <DialogContent
            title={`Delete ${asset.name}`}
            description="This removes the asset record entirely. To retire an asset while keeping its history, set its status to Discarded instead."
          >
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setDeleteOpen(false)}>Cancel</Button>
              <Button
                variant="destructive"
                loading={loading}
                onClick={() =>
                  run(() => deleteAssetAction(asset.id), {
                    successMessage: "Asset record deleted.",
                    onSuccess: () => {
                      setDeleteOpen(false);
                      router.push("/assets");
                    },
                  })
                }
              >
                Delete asset
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      ) : null}
    </div>
  );
}

export function StartClearanceDialog({
  companies,
  peopleByCompany,
}: {
  companies: Company[];
  peopleByCompany: Record<string, PersonOption[]>;
}) {
  const { run, loading } = useAction();
  const [open, setOpen] = useState(false);
  const [companyId, setCompanyId] = useState(companies[0]?.id ?? "");
  const [personId, setPersonId] = useState("");

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <ClipboardCheck className="h-4 w-4" /> Start clearance
        </Button>
      </DialogTrigger>
      <DialogContent
        title="Start asset clearance"
        description="All assets actively assigned to the employee are identified automatically for verification."
      >
        <div className="space-y-3">
          <div>
            <Label htmlFor="clr-company" required>Company</Label>
            <Combobox
              id="clr-company" value={companyId}
              options={companies.map((company) => ({ value: company.id, label: company.name }))}
              onChange={(value) => { setCompanyId(value); setPersonId(""); }}
            />
          </div>
          <div>
            <Label htmlFor="clr-person" required>Employee</Label>
            <Combobox
              id="clr-person" value={personId}
              placeholder="Select employee…"
              options={(peopleByCompany[companyId] ?? []).map((person) => ({ value: person.id, label: person.name }))}
              onChange={setPersonId}
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              loading={loading}
              disabled={!personId}
              onClick={() =>
                run(() => startClearanceAction(personId), {
                  successMessage: "Clearance started.",
                  onSuccess: () => setOpen(false),
                })
              }
            >
              Start clearance
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export interface ClearanceItemView {
  id: string;
  kind: "ASSET" | "APPLICATION" | "LICENSE";
  label: string;
  reference: string | null;
  status: string;
  comments: string | null;
}

export function ClearancePanel({
  clearanceId,
  personName,
  items,
  canManage,
}: {
  clearanceId: string;
  personName: string;
  items: ClearanceItemView[];
  canManage: boolean;
}) {
  const { run, loading } = useAction();
  const { run: runCancel, loading: cancelling } = useAction();
  const [finalStatus, setFinalStatus] = useState<"RESIGNED" | "TERMINATED">("RESIGNED");
  const allVerified = items.every((item) => item.status !== "PENDING");

  const groups: { kind: ClearanceItemView["kind"]; title: string }[] = [
    { kind: "ASSET", title: "Assets" },
    { kind: "APPLICATION", title: "Application access" },
    { kind: "LICENSE", title: "Licenses" },
  ];

  return (
    <div className="rounded-lg border border-warning/40 bg-warning/5 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Clearance in progress: {personName}</h3>
        {canManage ? (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              loading={cancelling}
              onClick={() =>
                runCancel(() => cancelClearanceAction(clearanceId), { successMessage: "Clearance cancelled." })
              }
            >
              Cancel clearance
            </Button>
            <Label htmlFor="clr-final" className="sr-only">Outcome</Label>
            <Select
              id="clr-final"
              value={finalStatus}
              className="h-9 w-40"
              onChange={(event) => setFinalStatus(event.target.value as "RESIGNED" | "TERMINATED")}
            >
              <option value="RESIGNED">Mark as Resigned</option>
              <option value="TERMINATED">Mark as Terminated</option>
            </Select>
            <Button
              size="sm"
              loading={loading}
              disabled={!allVerified}
              onClick={() =>
                run(() => completeClearanceAction(clearanceId, finalStatus), {
                  successMessage: "Clearance completed; document archived.",
                })
              }
            >
              Complete clearance
            </Button>
          </div>
        ) : null}
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">No open assignments. Clearance can be completed immediately.</p>
      ) : (
        <div className="space-y-4">
          {groups.map((group) => {
            const groupItems = items.filter((item) => item.kind === group.kind);
            if (groupItems.length === 0) return null;
            return (
              <div key={group.kind}>
                <h4 className="mb-1.5 label-caps text-muted-foreground">{group.title}</h4>
                <ul className="space-y-2">
                  {groupItems.map((item) => (
                    <ClearanceItemRow key={item.id} item={item} canManage={canManage} />
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ClearanceItemRow({ item, canManage }: { item: ClearanceItemView; canManage: boolean }) {
  const { run, loading } = useAction();
  const { run: runRemove, loading: removing } = useAction();
  const [comments, setComments] = useState(item.comments ?? "");
  // Assets can be received / missing / damaged; access & licenses are disabled.
  const statuses = item.kind === "ASSET" ? (["RECEIVED", "MISSING", "DAMAGED"] as const) : (["RECEIVED"] as const);
  const statusLabel = (status: string) =>
    item.kind !== "ASSET" && status === "RECEIVED" ? "Disabled" : status.charAt(0) + status.slice(1).toLowerCase();

  return (
    <li className="flex flex-wrap items-center gap-2 rounded-md border bg-card p-2.5 text-sm">
      <span className="min-w-32 font-medium">{item.label}</span>
      <span className="text-muted-foreground">{item.reference ?? ""}</span>
      <span className="ml-auto flex items-center gap-2">
        <StatusBadge status={item.status} />
        {canManage && item.status === "PENDING" ? (
          <Button
            variant="ghost"
            size="icon"
            loading={removing}
            aria-label="Remove from clearance"
            title="Remove from clearance (handled separately)"
            onClick={() =>
              runRemove(() => removeClearanceItemAction(item.id), { successMessage: "Removed from clearance." })
            }
          >
            <Trash2 className="h-4 w-4 text-muted-foreground" />
          </Button>
        ) : null}
        {canManage && item.status === "PENDING" ? (
          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <Button variant="outline" size="sm" loading={loading}>
                Verify…
              </Button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content align="end" className="z-50 w-72 rounded-lg border bg-popover p-3 shadow-pop">
                <Label htmlFor={`clr-comments-${item.id}`}>Comments (required if missing/damaged)</Label>
                <Textarea
                  id={`clr-comments-${item.id}`}
                  value={comments}
                  onChange={(event) => setComments(event.target.value)}
                  className="mb-2"
                />
                <div className="flex justify-end gap-1.5">
                  {statuses.map((status) => (
                    <Button
                      key={status}
                      size="sm"
                      variant={status === "RECEIVED" ? "primary" : status === "MISSING" ? "destructive" : "outline"}
                      onClick={() =>
                        run(
                          () =>
                            verifyClearanceItemAction({
                              clearanceItemId: item.id,
                              status,
                              comments: comments || undefined,
                            }),
                          { successMessage: `Marked ${statusLabel(status).toLowerCase()}.` },
                        )
                      }
                    >
                      {statusLabel(status)}
                    </Button>
                  ))}
                </div>
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        ) : null}
      </span>
    </li>
  );
}
