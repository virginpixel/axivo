"use client";

import { useState } from "react";
import { Pencil, Plus, UserPlus, Undo2, Wrench, Trash2, ClipboardCheck } from "lucide-react";
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
  disposeAssetAction,
  startClearanceAction,
  verifyClearanceItemAction,
  completeClearanceAction,
} from "@/modules/assets/actions";
import { useAction } from "@/shared/ui/use-action";
import { Button } from "@/shared/ui/button";
import { Input, Select, Textarea, Label, FieldError, HelperText } from "@/shared/ui/input";
import { Dialog, DialogContent, DialogTrigger } from "@/shared/ui/dialog";
import { StatusBadge } from "@/shared/ui/badge";

interface Company { id: string; name: string }
interface Category { id: string; name: string; companyId: string }
interface LocationOption { id: string; name: string; companyId: string }
interface PersonOption { id: string; name: string }

export function CategoryDialog({ companies }: { companies: Company[] }) {
  const { run, loading, fieldErrors } = useAction();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    companyId: companies[0]?.id ?? "",
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
            <Label htmlFor="cat-company" required>Company</Label>
            <Select id="cat-company" value={form.companyId} onChange={(e) => setForm({ ...form, companyId: e.target.value })}>
              {companies.map((company) => (
                <option key={company.id} value={company.id}>{company.name}</option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="cat-name" required>Category name</Label>
            <Input id="cat-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Laptop, Mobile Phone, SIM Card" />
            <FieldError message={fieldErrors.name} />
          </div>
          <div>
            <Label htmlFor="cat-description">Description</Label>
            <Textarea id="cat-description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
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
                      companyId: form.companyId,
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
  assetTag: string;
  serialNumber: string | null;
  manufacturer: string | null;
  model: string | null;
  locationId: string | null;
  supplier: string | null;
  warrantyExpiry: string | null;
  notes: string | null;
  status: string;
}

export function AssetDialog({
  companies,
  categories,
  locations,
  asset,
  triggerIcon,
}: {
  companies: Company[];
  categories: Category[];
  locations: LocationOption[];
  asset?: AssetFormRecord;
  triggerIcon?: boolean;
}) {
  const { run, loading, fieldErrors } = useAction();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    companyId: asset?.companyId ?? companies[0]?.id ?? "",
    categoryId: asset?.categoryId ?? "",
    assetTag: asset?.assetTag ?? "",
    serialNumber: asset?.serialNumber ?? "",
    manufacturer: asset?.manufacturer ?? "",
    model: asset?.model ?? "",
    locationId: asset?.locationId ?? "",
    supplier: asset?.supplier ?? "",
    warrantyExpiry: asset?.warrantyExpiry ?? "",
    notes: asset?.notes ?? "",
  });
  const companyCategories = categories.filter((category) => category.companyId === form.companyId);
  const companyLocations = locations.filter((location) => location.companyId === form.companyId);

  async function submit() {
    const payload = {
      companyId: form.companyId,
      categoryId: form.categoryId,
      assetTag: form.assetTag,
      serialNumber: form.serialNumber || undefined,
      manufacturer: form.manufacturer || undefined,
      model: form.model || undefined,
      locationId: form.locationId || undefined,
      supplier: form.supplier || undefined,
      warrantyExpiry: form.warrantyExpiry || undefined,
      notes: form.notes || undefined,
    };
    await run(
      () => (asset ? updateAssetAction(asset.id, payload) : createAssetAction(payload)),
      { successMessage: asset ? "Asset updated." : "Asset created.", onSuccess: () => setOpen(false) },
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {asset || triggerIcon ? (
          <Button variant="ghost" size="icon" aria-label={asset ? `Edit ${asset.assetTag}` : "New asset"}>
            {asset ? <Pencil className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          </Button>
        ) : (
          <Button size="sm">
            <Plus className="h-4 w-4" /> New asset
          </Button>
        )}
      </DialogTrigger>
      <DialogContent title={asset ? `Edit asset ${asset.assetTag}` : "New asset"} wide>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="asset-company" required>Company</Label>
            <Select id="asset-company" value={form.companyId} disabled={!!asset}
              onChange={(e) => setForm({ ...form, companyId: e.target.value, categoryId: "", locationId: "" })}>
              {companies.map((company) => (
                <option key={company.id} value={company.id}>{company.name}</option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="asset-category" required>Category</Label>
            <Select id="asset-category" value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })}>
              <option value="">Select…</option>
              {companyCategories.map((category) => (
                <option key={category.id} value={category.id}>{category.name}</option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="asset-tag" required>Asset tag</Label>
            <Input id="asset-tag" value={form.assetTag} onChange={(e) => setForm({ ...form, assetTag: e.target.value })} />
            <FieldError message={fieldErrors.assetTag} />
          </div>
          <div>
            <Label htmlFor="asset-serial">Serial number</Label>
            <Input id="asset-serial" value={form.serialNumber} onChange={(e) => setForm({ ...form, serialNumber: e.target.value })} />
          </div>
          <div>
            <Label htmlFor="asset-manufacturer">Manufacturer</Label>
            <Input id="asset-manufacturer" value={form.manufacturer} onChange={(e) => setForm({ ...form, manufacturer: e.target.value })} />
          </div>
          <div>
            <Label htmlFor="asset-model">Model</Label>
            <Input id="asset-model" value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} />
          </div>
          <div>
            <Label htmlFor="asset-location">Location</Label>
            <Select id="asset-location" value={form.locationId} onChange={(e) => setForm({ ...form, locationId: e.target.value })}>
              <option value="">No location</option>
              {companyLocations.map((location) => (
                <option key={location.id} value={location.id}>{location.name}</option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="asset-warranty">Warranty expiry</Label>
            <Input id="asset-warranty" type="date" value={form.warrantyExpiry} onChange={(e) => setForm({ ...form, warrantyExpiry: e.target.value })} />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="asset-notes">Notes</Label>
            <Textarea id="asset-notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={submit} loading={loading} disabled={!form.categoryId || !form.assetTag}>
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
  companies,
  categories,
  locations,
  people,
  documents,
  permissions,
}: {
  asset: AssetFormRecord;
  activeAssignmentId: string | null;
  companies: Company[];
  categories: Category[];
  locations: LocationOption[];
  people: PersonOption[];
  documents: { id: string; name: string }[];
  permissions: { canManage: boolean; canAssign: boolean; canMaintain: boolean; canDispose: boolean };
}) {
  const { run, loading } = useAction();
  const [assignOpen, setAssignOpen] = useState(false);
  const [maintenanceOpen, setMaintenanceOpen] = useState(false);
  const [disposeOpen, setDisposeOpen] = useState(false);
  const [personId, setPersonId] = useState("");
  const [maintForm, setMaintForm] = useState({ maintenanceType: "Repair", description: "", serviceProvider: "" });
  const [disposeForm, setDisposeForm] = useState({ method: "", reason: "", documentId: "" });

  return (
    <div className="flex justify-end gap-1">
      {permissions.canManage ? (
        <AssetDialog companies={companies} categories={categories} locations={locations} asset={asset} />
      ) : null}

      {permissions.canAssign && asset.status === "AVAILABLE" ? (
        <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
          <DialogTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Assign asset" title="Assign">
              <UserPlus className="h-4 w-4 text-primary" />
            </Button>
          </DialogTrigger>
          <DialogContent title={`Assign ${asset.assetTag}`} description="A handover acknowledgement email is sent automatically when the category requires it.">
            <Label htmlFor={`assign-person-${asset.id}`} required>Employee</Label>
            <Select id={`assign-person-${asset.id}`} value={personId} onChange={(e) => setPersonId(e.target.value)}>
              <option value="">Select…</option>
              {people.map((person) => (
                <option key={person.id} value={person.id}>{person.name}</option>
              ))}
            </Select>
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

      {permissions.canMaintain && asset.status !== "DISCARDED" && asset.status !== "ASSIGNED" ? (
        <Dialog open={maintenanceOpen} onOpenChange={setMaintenanceOpen}>
          <DialogTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Schedule maintenance" title="Maintenance">
              <Wrench className="h-4 w-4 text-warning" />
            </Button>
          </DialogTrigger>
          <DialogContent title={`Maintenance for ${asset.assetTag}`}>
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

      {permissions.canDispose && asset.status !== "DISCARDED" && asset.status !== "ASSIGNED" ? (
        <Dialog open={disposeOpen} onOpenChange={setDisposeOpen}>
          <DialogTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Dispose asset" title="Dispose">
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </DialogTrigger>
          <DialogContent
            title={`Dispose ${asset.assetTag}`}
            description="A completed disposal document is required before the asset becomes Discarded. This cannot be undone."
          >
            <div className="space-y-3">
              <div>
                <Label htmlFor={`disp-method-${asset.id}`} required>Disposal method</Label>
                <Input id={`disp-method-${asset.id}`} value={disposeForm.method}
                  onChange={(e) => setDisposeForm({ ...disposeForm, method: e.target.value })}
                  placeholder="e.g. E-waste recycling, Sold, Donated" />
              </div>
              <div>
                <Label htmlFor={`disp-reason-${asset.id}`} required>Disposal reason</Label>
                <Textarea id={`disp-reason-${asset.id}`} value={disposeForm.reason}
                  onChange={(e) => setDisposeForm({ ...disposeForm, reason: e.target.value })} />
              </div>
              <div>
                <Label htmlFor={`disp-document-${asset.id}`} required>Disposal document</Label>
                <Select id={`disp-document-${asset.id}`} value={disposeForm.documentId}
                  onChange={(e) => setDisposeForm({ ...disposeForm, documentId: e.target.value })}>
                  <option value="">Select a document…</option>
                  {documents.map((document) => (
                    <option key={document.id} value={document.id}>{document.name}</option>
                  ))}
                </Select>
                <HelperText>Upload the signed disposal form in Documents first, then select it here.</HelperText>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setDisposeOpen(false)}>Cancel</Button>
                <Button
                  variant="destructive"
                  loading={loading}
                  disabled={!disposeForm.method || !disposeForm.reason || !disposeForm.documentId}
                  onClick={() =>
                    run(
                      () =>
                        disposeAssetAction({
                          assetId: asset.id,
                          disposalDate: new Date().toISOString().slice(0, 10),
                          method: disposeForm.method,
                          reason: disposeForm.reason,
                          documentId: disposeForm.documentId,
                        }),
                      { successMessage: "Asset discarded.", onSuccess: () => setDisposeOpen(false) },
                    )
                  }
                >
                  Dispose asset
                </Button>
              </div>
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
            <Select id="clr-company" value={companyId} onChange={(e) => { setCompanyId(e.target.value); setPersonId(""); }}>
              {companies.map((company) => (
                <option key={company.id} value={company.id}>{company.name}</option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="clr-person" required>Employee</Label>
            <Select id="clr-person" value={personId} onChange={(e) => setPersonId(e.target.value)}>
              <option value="">Select…</option>
              {(peopleByCompany[companyId] ?? []).map((person) => (
                <option key={person.id} value={person.id}>{person.name}</option>
              ))}
            </Select>
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

export function ClearancePanel({
  clearanceId,
  personName,
  items,
  canManage,
}: {
  clearanceId: string;
  personName: string;
  items: { id: string; assetTag: string; model: string | null; status: string; comments: string | null }[];
  canManage: boolean;
}) {
  const { run, loading } = useAction();
  const allVerified = items.every((item) => item.status !== "PENDING");

  return (
    <div className="rounded-lg border border-warning/40 bg-warning/5 p-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold">Clearance in progress: {personName}</h3>
        {canManage ? (
          <Button
            size="sm"
            loading={loading}
            disabled={!allVerified}
            onClick={() =>
              run(() => completeClearanceAction(clearanceId), {
                successMessage: "Clearance completed; document archived.",
              })
            }
          >
            Complete clearance
          </Button>
        ) : null}
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">No assets assigned — clearance can be completed immediately.</p>
      ) : (
        <ul className="space-y-2">
          {items.map((item) => (
            <ClearanceItemRow key={item.id} item={item} canManage={canManage} />
          ))}
        </ul>
      )}
    </div>
  );
}

function ClearanceItemRow({
  item,
  canManage,
}: {
  item: { id: string; assetTag: string; model: string | null; status: string; comments: string | null };
  canManage: boolean;
}) {
  const { run, loading } = useAction();
  const [comments, setComments] = useState(item.comments ?? "");

  return (
    <li className="flex flex-wrap items-center gap-2 rounded-md border bg-card p-2.5 text-sm">
      <span className="min-w-32 font-medium">{item.assetTag}</span>
      <span className="text-muted-foreground">{item.model ?? ""}</span>
      <span className="ml-auto flex items-center gap-2">
        <StatusBadge status={item.status} />
        {canManage && item.status === "PENDING" ? (
          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <Button variant="outline" size="sm" loading={loading}>
                Verify…
              </Button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content align="end" className="z-50 w-72 rounded-md border bg-card p-3 shadow-lg">
                <Label htmlFor={`clr-comments-${item.id}`}>Comments (required if missing/damaged)</Label>
                <Textarea
                  id={`clr-comments-${item.id}`}
                  value={comments}
                  onChange={(event) => setComments(event.target.value)}
                  className="mb-2"
                />
                <div className="flex justify-end gap-1.5">
                  {(["RECEIVED", "MISSING", "DAMAGED"] as const).map((status) => (
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
                          { successMessage: `Asset marked ${status.toLowerCase()}.` },
                        )
                      }
                    >
                      {status.charAt(0) + status.slice(1).toLowerCase()}
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
