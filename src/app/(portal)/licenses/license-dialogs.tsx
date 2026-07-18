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
import { Dialog, DialogContent, DialogTrigger } from "@/shared/ui/dialog";

export function LicenseDialog({
  companies,
  applications,
  contracts,
  license,
}: {
  companies: { id: string; name: string }[];
  applications: { id: string; name: string; companyId: string }[];
  contracts: { id: string; contractNumber: string; name: string; companyId: string }[];
  license?: {
    id: string;
    companyId: string;
    applicationId: string;
    name: string;
    licenseType: string;
    vendor: string | null;
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
    vendor: license?.vendor ?? "",
    licenseKey: license?.licenseKey ?? "",
    contractId: license?.contractId ?? "",
    notes: license?.notes ?? "",
  });

  const companyApplications = applications.filter((application) => application.companyId === form.companyId);
  const companyContracts = contracts.filter((contract) => contract.companyId === form.companyId);

  async function submit() {
    const payload = {
      companyId: form.companyId,
      applicationId: form.applicationId,
      name: form.name,
      licenseType: form.licenseType,
      vendor: form.vendor || undefined,
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
              <Select
                id="lic-company" value={form.companyId} disabled={!!license}
                onChange={(e) => setForm({ ...form, companyId: e.target.value, applicationId: "", contractId: "" })}
              >
                {companies.map((company) => (
                  <option key={company.id} value={company.id}>{company.name}</option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="lic-application" required>Application</Label>
              <Select id="lic-application" value={form.applicationId} onChange={(e) => setForm({ ...form, applicationId: e.target.value })}>
                <option value="">Select…</option>
                {companyApplications.map((application) => (
                  <option key={application.id} value={application.id}>{application.name}</option>
                ))}
              </Select>
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
              <Label htmlFor="lic-vendor">Vendor</Label>
              <Input id="lic-vendor" value={form.vendor} onChange={(e) => setForm({ ...form, vendor: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="lic-key">License key</Label>
              <Input id="lic-key" value={form.licenseKey} onChange={(e) => setForm({ ...form, licenseKey: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="lic-contract">Linked contract</Label>
              <Select id="lic-contract" value={form.contractId} onChange={(e) => setForm({ ...form, contractId: e.target.value })}>
                <option value="">No contract</option>
                {companyContracts.map((contract) => (
                  <option key={contract.id} value={contract.id}>
                    {contract.contractNumber} · {contract.name}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          <div>
            <Label htmlFor="lic-notes">Notes</Label>
            <Textarea id="lic-notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={submit} loading={loading} disabled={!form.applicationId}>
              {license ? "Save changes" : "Create license"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function PurchaseDialog({ licenseId, licenseType }: { licenseId: string; licenseType: string }) {
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
              <Label htmlFor="pur-supplier">Supplier</Label>
              <Input id="pur-supplier" value={form.supplier} onChange={(e) => setForm({ ...form, supplier: e.target.value })} />
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
            <Select id="lic-assign-person" value={personId} onChange={(e) => setPersonId(e.target.value)}>
              <option value="">Select…</option>
              {people.map((person) => (
                <option key={person.id} value={person.id}>{person.name}</option>
              ))}
            </Select>
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
