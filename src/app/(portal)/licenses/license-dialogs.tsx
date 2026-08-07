"use client";

import { useState } from "react";
import { Pencil, Plus, ShoppingCart, UserPlus, Trash2 } from "lucide-react";
import {
  createLicenseAction,
  updateLicenseAction,
  recordPurchaseAction,
  assignLicenseAction,
  removeLicenseAssignmentAction,
} from "@/modules/licenses/actions";
import { useAction } from "@/shared/ui/use-action";
import { Button } from "@/shared/ui/button";
import { Input, Select, Textarea, Label, FieldError, HelperText } from "@/shared/ui/input";
import { Combobox } from "@/shared/ui/combobox";
import { Dialog, DialogContent, DialogTrigger } from "@/shared/ui/dialog";

export function LicenseDialog({
  companies,
  applications,
  contracts,
  license,
}: {
  companies: { id: string; name: string }[];
  applications: { id: string; name: string; companyId: string }[];
  contracts: { id: string; contractNumber: string | null; name: string; companyId: string }[];
  license?: {
    id: string;
    companyId: string;
    applicationId: string | null;
    name: string;
    licenseType: string;
    isShared: boolean;
    licenseKey: string | null;
    contractId: string | null;
    notes: string | null;
  };
}) {
  const { run, loading, fieldErrors } = useAction();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    companyId: license?.companyId ?? companies[0]?.id ?? "",
    applicationId: license?.applicationId ?? "",
    name: license?.name ?? "",
    licenseType: license?.licenseType ?? "SUBSCRIPTION",
    isShared: license?.isShared ?? false,
    licenseKey: license?.licenseKey ?? "",
    contractId: license?.contractId ?? "",
    notes: license?.notes ?? "",
  });

  const companyApplications = applications.filter((application) => application.companyId === form.companyId);
  const companyContracts = contracts.filter((contract) => contract.companyId === form.companyId);

  async function submit() {
    const payload = {
      companyId: form.companyId,
      applicationId: form.applicationId || undefined,
      name: form.name,
      licenseType: form.licenseType,
      isShared: form.isShared,
      licenseKey: form.licenseKey || undefined,
      contractId: form.contractId || undefined,
      notes: form.notes || undefined,
    };
    await run(
      () => (license ? updateLicenseAction(license.id, payload) : createLicenseAction(payload)),
      { successMessage: license ? "License updated." : "License created.", onSuccess: () => setOpen(false) },
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {license ? (
          <Button variant="ghost" size="icon" aria-label={`Edit ${license.name}`}>
            <Pencil className="h-4 w-4" />
          </Button>
        ) : (
          <Button size="sm">
            <Plus className="h-4 w-4" /> New license
          </Button>
        )}
      </DialogTrigger>
      <DialogContent title={license ? "Edit license" : "New license"}>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="lic-company" required>Company</Label>
              <Combobox
                id="lic-company" value={form.companyId} disabled={!!license}
                options={companies.map((company) => ({ value: company.id, label: company.name }))}
                onChange={(value) => setForm({ ...form, companyId: value, applicationId: "", contractId: "" })}
              />
            </div>
            <div>
              <Label htmlFor="lic-application">Linked application</Label>
              <Combobox
                id="lic-application" value={form.applicationId}
                placeholder="None"
                emptyLabel="None"
                options={companyApplications.map((application) => ({ value: application.id, label: application.name }))}
                onChange={(value) => setForm({ ...form, applicationId: value })}
              />
            </div>
          </div>
          <div>
            <Label htmlFor="lic-name" required>License name</Label>
            <Input id="lic-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <FieldError message={fieldErrors.name} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="lic-type" required>License type</Label>
              <Select id="lic-type" value={form.licenseType} onChange={(e) => setForm({ ...form, licenseType: e.target.value })}>
                <option value="SUBSCRIPTION">Subscription</option>
                <option value="PERPETUAL">Perpetual</option>
              </Select>
            </div>
            <div>
              <Label htmlFor="lic-shared">Availability</Label>
              <label htmlFor="lic-shared" className="flex h-9 items-center gap-2 text-sm">
                <input
                  id="lic-shared"
                  type="checkbox"
                  className="h-4 w-4 rounded border-input"
                  checked={form.isShared}
                  onChange={(e) => setForm({ ...form, isShared: e.target.checked })}
                />
                Available to all companies
              </label>
            </div>
          </div>
          {form.isShared ? (
            <HelperText>Seats can be assigned to employees of any company.</HelperText>
          ) : null}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="lic-key">License key</Label>
              <Input id="lic-key" value={form.licenseKey} onChange={(e) => setForm({ ...form, licenseKey: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="lic-contract">Linked contract</Label>
              <Combobox
                id="lic-contract" value={form.contractId}
                placeholder="No contract"
                emptyLabel="No contract"
                options={companyContracts.map((contract) => ({
                  value: contract.id,
                  label: `${contract.contractNumber ? `${contract.contractNumber} · ` : ""}${contract.name}`,
                }))}
                onChange={(value) => setForm({ ...form, contractId: value })}
              />
            </div>
          </div>
          <div>
            <Label htmlFor="lic-notes">Notes</Label>
            <Textarea id="lic-notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={submit} loading={loading} >
              {license ? "Save changes" : "Create license"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function PurchaseDialog({
  licenseId,
  licenseType,
  vendors = [],
}: {
  licenseId: string;
  licenseType: string;
  vendors?: string[];
}) {
  const { run, loading, fieldErrors } = useAction();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    purchaseType: "NEW_PURCHASE",
    quantity: "1",
    purchaseDate: new Date().toISOString().slice(0, 10),
    startDate: "",
    expiryDate: "",
    price: "",
    currency: "USD",
    supplier: "",
    purchaseReference: "",
  });
  const isSubscription = licenseType === "SUBSCRIPTION";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Record purchase" title="Record purchase or renewal">
          <ShoppingCart className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent title="Record purchase / renewal">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="pur-type" required>Purchase type</Label>
              <Select id="pur-type" value={form.purchaseType} onChange={(e) => setForm({ ...form, purchaseType: e.target.value })}>
                <option value="NEW_PURCHASE">New purchase</option>
                <option value="RENEWAL">Renewal</option>
                <option value="ADDITIONAL_SEATS">Additional seats</option>
              </Select>
            </div>
            <div>
              <Label htmlFor="pur-quantity" required>Quantity</Label>
              <Input id="pur-quantity" type="number" min={1} value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} />
              <FieldError message={fieldErrors.quantity} />
            </div>
            <div>
              <Label htmlFor="pur-date" required>Purchase date</Label>
              <Input id="pur-date" type="date" value={form.purchaseDate} onChange={(e) => setForm({ ...form, purchaseDate: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="pur-price">Price</Label>
              <Input id="pur-price" type="number" min={0} step="0.01" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
            </div>
            {isSubscription ? (
              <>
                <div>
                  <Label htmlFor="pur-start" required>Start date</Label>
                  <Input id="pur-start" type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
                  <FieldError message={fieldErrors.startDate} />
                </div>
                <div>
                  <Label htmlFor="pur-expiry" required>Expiry date</Label>
                  <Input id="pur-expiry" type="date" value={form.expiryDate} onChange={(e) => setForm({ ...form, expiryDate: e.target.value })} />
                  <FieldError message={fieldErrors.expiryDate} />
                </div>
              </>
            ) : null}
            <div>
              <Label htmlFor="pur-supplier">Vendor</Label>
              <Combobox
                id="pur-supplier" value={form.supplier}
                placeholder={vendors.length ? "Select vendor…" : "Add vendors in Settings → Catalogs"}
                emptyLabel="None"
                options={vendors.map((vendor) => ({ value: vendor, label: vendor }))}
                onChange={(value) => setForm({ ...form, supplier: value })}
              />
            </div>
            <div>
              <Label htmlFor="pur-reference">Purchase reference</Label>
              <Input id="pur-reference" value={form.purchaseReference} onChange={(e) => setForm({ ...form, purchaseReference: e.target.value })} />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              loading={loading}
              onClick={() =>
                run(
                  () =>
                    recordPurchaseAction({
                      licenseId,
                      purchaseType: form.purchaseType,
                      quantity: Number(form.quantity),
                      purchaseDate: form.purchaseDate,
                      startDate: form.startDate || undefined,
                      expiryDate: form.expiryDate || undefined,
                      price: form.price ? Number(form.price) : undefined,
                      currency: form.currency || undefined,
                      supplier: form.supplier || undefined,
                      purchaseReference: form.purchaseReference || undefined,
                    }),
                  { successMessage: "Purchase recorded.", onSuccess: () => setOpen(false) },
                )
              }
            >
              Record purchase
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function LicenseAssignDialog({
  licenseId,
  people,
  available,
}: {
  licenseId: string;
  people: { id: string; name: string }[];
  available: number;
}) {
  const { run, loading } = useAction();
  const [open, setOpen] = useState(false);
  const [personId, setPersonId] = useState("");

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Assign license" title="Assign license">
          <UserPlus className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent title="Assign license seat">
        {available <= 0 ? (
          <p className="rounded-md bg-warning/10 px-4 py-3 text-sm text-warning">
            No seats available. Record a purchase or remove an assignment first.
          </p>
        ) : (
          <HelperText>{available} seat(s) available.</HelperText>
        )}
        <div className="mt-3 space-y-3">
          <div>
            <Label htmlFor="lic-assign-person" required>Employee</Label>
            <Combobox
              id="lic-assign-person" value={personId}
              placeholder="Select employee…"
              options={people.map((person) => ({ value: person.id, label: person.name }))}
              onChange={setPersonId}
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              loading={loading}
              disabled={!personId || available <= 0}
              onClick={() =>
                run(() => assignLicenseAction({ licenseId, personId }), {
                  successMessage: "License assigned.",
                  onSuccess: () => setOpen(false),
                })
              }
            >
              Assign seat
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function LicenseAssignmentActions({ assignmentId, status }: { assignmentId: string; status: string }) {
  const { run, loading } = useAction();
  if (status === "REMOVED") return null;
  return (
    <Button
      variant="ghost"
      size="icon"
      loading={loading}
      aria-label="Remove license assignment"
      title="Remove (returns seat to pool)"
      onClick={() =>
        run(() => removeLicenseAssignmentAction(assignmentId), {
          successMessage: "Assignment removed; seat returned to pool.",
        })
      }
    >
      <Trash2 className="h-4 w-4 text-destructive" />
    </Button>
  );
}
