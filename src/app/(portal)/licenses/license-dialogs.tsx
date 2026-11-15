"use client";

import { useState } from "react";
import Link from "next/link";
import { Pencil, Plus, ShoppingCart, UserPlus, Trash2 } from "lucide-react";
import {
  createLicenseAction,
  updateLicenseAction,
  recordPurchaseAction,
  updatePurchaseAction,
  assignLicenseAction,
  removeLicenseAssignmentAction,
  deleteLicenseAction,
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
    alertEmails: string[];
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
    alertEmails: (license?.alertEmails ?? []).join(", "),
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
      alertEmails: form.alertEmails,
      notes: form.notes,
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
            <Label htmlFor="lic-alert-emails">Expiry alerts to</Label>
            <Input
              id="lic-alert-emails"
              value={form.alertEmails}
              placeholder="it@example.com, procurement@example.com"
              onChange={(e) => setForm({ ...form, alertEmails: e.target.value })}
            />
            <FieldError message={fieldErrors.alertEmails} />
            <HelperText>
              Separate addresses with commas. Leave blank to use the default recipients set in{" "}
              <Link href="/settings?tab=notifications" className="text-primary hover:underline">
                Settings
              </Link>
              .
            </HelperText>
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

export interface PurchaseRecord {
  id: string;
  purchaseType: string;
  quantity: number;
  purchaseDate: string;
  startDate: string | null;
  expiryDate: string | null;
  price: number | null;
  currency: string | null;
  supplier: string | null;
  purchaseReference: string | null;
}

/**
 * Record a purchase, or correct one entered wrongly. The same form does both:
 * a purchase drives the seat count and the cover dates, so a typo misstates
 * both until it is fixed, and re-entering it as a second purchase would add
 * seats rather than replace them.
 */
export function PurchaseDialog({
  licenseId,
  licenseType,
  vendors = [],
  purchase,
}: {
  licenseId: string;
  licenseType: string;
  vendors?: string[];
  purchase?: PurchaseRecord;
}) {
  const { run, loading, fieldErrors } = useAction();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    purchaseType: purchase?.purchaseType ?? "NEW_PURCHASE",
    quantity: String(purchase?.quantity ?? 1),
    purchaseDate: purchase?.purchaseDate ?? new Date().toISOString().slice(0, 10),
    startDate: purchase?.startDate ?? "",
    expiryDate: purchase?.expiryDate ?? "",
    price: purchase?.price != null ? String(purchase.price) : "",
    currency: purchase?.currency ?? "USD",
    supplier: purchase?.supplier ?? "",
    purchaseReference: purchase?.purchaseReference ?? "",
  });
  const isSubscription = licenseType === "SUBSCRIPTION";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {purchase ? (
          <Button variant="ghost" size="icon" aria-label="Edit purchase" title="Correct this purchase">
            <Pencil className="h-4 w-4" />
          </Button>
        ) : (
          <Button variant="ghost" size="icon" aria-label="Record purchase" title="Record purchase or renewal">
            <ShoppingCart className="h-4 w-4" />
          </Button>
        )}
      </DialogTrigger>
      <DialogContent
        title={purchase ? "Correct purchase / renewal" : "Record purchase / renewal"}
        description={
          purchase
            ? "Changing a quantity or a date here changes the seats in force and the cover dates. The correction is recorded in the audit trail."
            : undefined
        }
      >
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
              onClick={() => {
                const payload = {
                  licenseId,
                  purchaseType: form.purchaseType,
                  quantity: Number(form.quantity),
                  purchaseDate: form.purchaseDate,
                  startDate: form.startDate || undefined,
                  expiryDate: form.expiryDate || undefined,
                  price: form.price ? Number(form.price) : undefined,
                  currency: form.currency,
                  supplier: form.supplier,
                  purchaseReference: form.purchaseReference,
                };
                run(
                  () =>
                    purchase
                      ? updatePurchaseAction(purchase.id, payload)
                      : recordPurchaseAction(payload),
                  {
                    successMessage: purchase ? "Purchase corrected." : "Purchase recorded.",
                    onSuccess: () => setOpen(false),
                  },
                );
              }}
            >
              {purchase ? "Save changes" : "Record purchase"}
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
  people: { id: string; name: string; hint?: string }[];
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

/** Availability history is kept via snapshots elsewhere; deleting a license is
 * blocked while it still has active assignments. */
export function LicenseDeleteButton({ id, name }: { id: string; name: string }) {
  const { run, loading } = useAction();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="ghost" size="icon" aria-label={`Delete ${name}`} title="Delete license" onClick={() => setOpen(true)}>
        <Trash2 className="h-4 w-4 text-destructive" />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          title={`Delete ${name}`}
          description="This removes the license and its purchase records from the list. Licenses with active assignments cannot be deleted."
        >
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              variant="destructive"
              loading={loading}
              onClick={() =>
                run(() => deleteLicenseAction(id), {
                  successMessage: "License deleted.",
                  onSuccess: () => setOpen(false),
                })
              }
            >
              Delete license
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
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
