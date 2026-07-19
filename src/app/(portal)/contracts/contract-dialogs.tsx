"use client";

import { useEffect, useState } from "react";
import { Pencil, Plus, RefreshCw, Ban, Paperclip, Eye } from "lucide-react";
import {
  createContractAction,
  updateContractAction,
  setContractStatusAction,
  renewContractAction,
  attachContractPdfAction,
} from "@/modules/contracts/actions";
import { useAction } from "@/shared/ui/use-action";
import { Button } from "@/shared/ui/button";
import { Input, Select, Textarea, Label, FieldError, HelperText } from "@/shared/ui/input";
import { Dialog, DialogContent, DialogTrigger } from "@/shared/ui/dialog";

export interface ContractRecord {
  id: string;
  companyId: string;
  contractNumber: string | null;
  name: string;
  vendor: string;
  category: string;
  status: string;
  startDate: string | null;
  endDate: string | null;
  renewalDate: string | null;
  renewalType: string;
  cost: number | null;
  currency: string | null;
  ownerPersonId: string | null;
  notes: string | null;
}

export interface ContractCatalogs {
  vendors: { id: string; name: string }[];
  categories: { id: string; name: string }[];
}

/**
 * Renewal date derives from the end date for periodic renewal types; only
 * MANUAL contracts set it by hand.
 */
function computeRenewalDate(endDate: string, renewalType: string): string {
  if (!endDate || renewalType === "MANUAL" || renewalType === "CUSTOM") return "";
  return endDate;
}

export function ContractDialog({
  companies,
  peopleByCompany,
  catalogs,
  contract,
}: {
  companies: { id: string; name: string }[];
  peopleByCompany: Record<string, { id: string; name: string }[]>;
  catalogs: ContractCatalogs;
  contract?: ContractRecord;
}) {
  const { run, loading, fieldErrors } = useAction();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    companyId: contract?.companyId ?? companies[0]?.id ?? "",
    contractNumber: contract?.contractNumber ?? "",
    name: contract?.name ?? "",
    vendor: contract?.vendor ?? "",
    category: contract?.category ?? "",
    startDate: contract?.startDate ?? "",
    endDate: contract?.endDate ?? "",
    renewalDate: contract?.renewalDate ?? "",
    renewalType: contract?.renewalType ?? "ANNUAL",
    cost: contract?.cost !== null && contract?.cost !== undefined ? String(contract.cost) : "",
    currency: contract?.currency ?? "USD",
    ownerPersonId: contract?.ownerPersonId ?? "",
    notes: contract?.notes ?? "",
  });

  const autoRenewal = form.renewalType !== "MANUAL" && form.renewalType !== "CUSTOM";
  // Keep the renewal date in sync with end date + renewal type.
  useEffect(() => {
    if (autoRenewal) {
      setForm((current) => ({
        ...current,
        renewalDate: computeRenewalDate(current.endDate, current.renewalType),
      }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.endDate, form.renewalType]);

  async function submit() {
    const payload = {
      companyId: form.companyId,
      contractNumber: form.contractNumber || undefined,
      name: form.name,
      vendor: form.vendor,
      category: form.category,
      startDate: form.startDate || undefined,
      endDate: form.endDate || undefined,
      renewalDate: form.renewalDate || undefined,
      renewalType: form.renewalType,
      cost: form.cost ? Number(form.cost) : undefined,
      currency: form.currency || undefined,
      ownerPersonId: form.ownerPersonId || undefined,
      notes: form.notes || undefined,
    };
    await run(
      () => (contract ? updateContractAction(contract.id, payload) : createContractAction(payload)),
      { successMessage: contract ? "Contract updated." : "Contract created.", onSuccess: () => setOpen(false) },
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {contract ? (
          <Button variant="ghost" size="icon" aria-label={`Edit ${contract.name}`}>
            <Pencil className="h-4 w-4" />
          </Button>
        ) : (
          <Button size="sm">
            <Plus className="h-4 w-4" /> New contract
          </Button>
        )}
      </DialogTrigger>
      <DialogContent title={contract ? "Edit contract" : "New contract"} wide>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="con-company" required>Company</Label>
            <Select id="con-company" value={form.companyId} disabled={!!contract}
              onChange={(e) => setForm({ ...form, companyId: e.target.value, ownerPersonId: "" })}>
              {companies.map((company) => (
                <option key={company.id} value={company.id}>{company.name}</option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="con-name" required>Contract name</Label>
            <Input id="con-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <FieldError message={fieldErrors.name} />
          </div>
          <div>
            <Label htmlFor="con-vendor" required>Vendor</Label>
            <Select id="con-vendor" value={form.vendor} onChange={(e) => setForm({ ...form, vendor: e.target.value })}>
              <option value="">Select…</option>
              {catalogs.vendors.map((vendor) => (
                <option key={vendor.id} value={vendor.name}>{vendor.name}</option>
              ))}
            </Select>
            <HelperText>Vendors are managed in Settings → Catalogs.</HelperText>
            <FieldError message={fieldErrors.vendor} />
          </div>
          <div>
            <Label htmlFor="con-category" required>Category</Label>
            <Select id="con-category" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
              <option value="">Select…</option>
              {catalogs.categories.map((category) => (
                <option key={category.id} value={category.name}>{category.name}</option>
              ))}
            </Select>
            <FieldError message={fieldErrors.category} />
          </div>
          <div>
            <Label htmlFor="con-number">Contract number (optional)</Label>
            <Input id="con-number" value={form.contractNumber} onChange={(e) => setForm({ ...form, contractNumber: e.target.value })} />
            <FieldError message={fieldErrors.contractNumber} />
          </div>
          <div>
            <Label htmlFor="con-owner">Contract owner</Label>
            <Select id="con-owner" value={form.ownerPersonId} onChange={(e) => setForm({ ...form, ownerPersonId: e.target.value })}>
              <option value="">No owner</option>
              {(peopleByCompany[form.companyId] ?? []).map((person) => (
                <option key={person.id} value={person.id}>{person.name}</option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="con-start">Start date</Label>
            <Input id="con-start" type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
          </div>
          <div>
            <Label htmlFor="con-end">End date</Label>
            <Input id="con-end" type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
            <FieldError message={fieldErrors.endDate} />
          </div>
          <div>
            <Label htmlFor="con-renewal-type" required>Renewal type</Label>
            <Select id="con-renewal-type" value={form.renewalType} onChange={(e) => setForm({ ...form, renewalType: e.target.value })}>
              <option value="MANUAL">Manual</option>
              <option value="MONTHLY">Monthly</option>
              <option value="QUARTERLY">Quarterly</option>
              <option value="ANNUAL">Annual</option>
              <option value="CUSTOM">Custom</option>
            </Select>
          </div>
          <div>
            <Label htmlFor="con-renewal-date">Renewal date</Label>
            <Input
              id="con-renewal-date"
              type="date"
              value={form.renewalDate}
              readOnly={autoRenewal}
              onChange={(e) => setForm({ ...form, renewalDate: e.target.value })}
            />
            <HelperText>
              {autoRenewal
                ? "Calculated automatically from the end date and renewal type."
                : "Set manually for manual/custom renewals."}
            </HelperText>
          </div>
          <div>
            <Label htmlFor="con-cost">Cost</Label>
            <Input id="con-cost" type="number" min={0} step="0.01" value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} />
          </div>
          <div>
            <Label htmlFor="con-currency">Currency</Label>
            <Input id="con-currency" value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="con-notes">Notes</Label>
            <Textarea id="con-notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={submit} loading={loading} disabled={!form.name || !form.vendor || !form.category}>
            {contract ? "Save changes" : "Create contract"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function AttachPdfDialog({ contractId, contractName }: { contractId: string; contractName: string }) {
  const { run, loading, fieldErrors } = useAction();
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Attach contract PDF" title="Attach PDF">
          <Paperclip className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent title={`Attach PDF: ${contractName}`} description="Stored in Documents with immutable version history and linked to this contract.">
        <Label htmlFor={`con-pdf-${contractId}`} required>Contract PDF</Label>
        <Input
          id={`con-pdf-${contractId}`}
          type="file"
          accept="application/pdf"
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
        />
        <FieldError message={fieldErrors.file} />
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button
            loading={loading}
            disabled={!file}
            onClick={() => {
              if (!file) return;
              const data = new FormData();
              data.set("file", file);
              void run(() => attachContractPdfAction(contractId, data), {
                successMessage: "Contract PDF attached.",
                onSuccess: () => setOpen(false),
              });
            }}
          >
            Attach PDF
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function ContractRowActions({
  contract,
  companies,
  peopleByCompany,
  catalogs,
  attachedDocumentId,
}: {
  contract: ContractRecord;
  companies: { id: string; name: string }[];
  peopleByCompany: Record<string, { id: string; name: string }[]>;
  catalogs: ContractCatalogs;
  attachedDocumentId: string | null;
}) {
  const { run, loading } = useAction();
  const [renewOpen, setRenewOpen] = useState(false);
  const [renewForm, setRenewForm] = useState({
    renewalDate: new Date().toISOString().slice(0, 10),
    newStartDate: "",
    newEndDate: "",
    cost: "",
  });

  return (
    <div className="flex justify-end gap-1">
      {attachedDocumentId ? (
        <a
          href={`/api/documents/${attachedDocumentId}/download?inline=1`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex h-9 w-9 items-center justify-center rounded-md hover:bg-accent"
          aria-label="View contract PDF"
          title="View contract PDF"
        >
          <Eye className="h-4 w-4 text-primary" />
        </a>
      ) : null}
      <AttachPdfDialog contractId={contract.id} contractName={contract.name} />
      <ContractDialog companies={companies} peopleByCompany={peopleByCompany} catalogs={catalogs} contract={contract} />
      {contract.status === "DRAFT" ? (
        <Button
          variant="ghost" size="sm" className="text-xs" loading={loading}
          onClick={() => run(() => setContractStatusAction(contract.id, "ACTIVE"), { successMessage: "Contract activated." })}
        >
          Activate
        </Button>
      ) : null}
      {contract.status !== "TERMINATED" && contract.status !== "DRAFT" ? (
        <>
          <Dialog open={renewOpen} onOpenChange={setRenewOpen}>
            <DialogTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Renew contract" title="Renew">
                <RefreshCw className="h-4 w-4 text-success" />
              </Button>
            </DialogTrigger>
            <DialogContent title={`Renew ${contract.name}`} description="Renewal history is preserved; the contract period advances.">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor={`ren-date-${contract.id}`} required>Renewal date</Label>
                  <Input id={`ren-date-${contract.id}`} type="date" value={renewForm.renewalDate}
                    onChange={(e) => setRenewForm({ ...renewForm, renewalDate: e.target.value })} />
                </div>
                <div>
                  <Label htmlFor={`ren-cost-${contract.id}`}>New cost</Label>
                  <Input id={`ren-cost-${contract.id}`} type="number" min={0} step="0.01" value={renewForm.cost}
                    onChange={(e) => setRenewForm({ ...renewForm, cost: e.target.value })} />
                </div>
                <div>
                  <Label htmlFor={`ren-start-${contract.id}`}>New start date</Label>
                  <Input id={`ren-start-${contract.id}`} type="date" value={renewForm.newStartDate}
                    onChange={(e) => setRenewForm({ ...renewForm, newStartDate: e.target.value })} />
                </div>
                <div>
                  <Label htmlFor={`ren-end-${contract.id}`}>New end date</Label>
                  <Input id={`ren-end-${contract.id}`} type="date" value={renewForm.newEndDate}
                    onChange={(e) => setRenewForm({ ...renewForm, newEndDate: e.target.value })} />
                </div>
              </div>
              <div className="mt-4 flex justify-end gap-2">
                <Button variant="outline" onClick={() => setRenewOpen(false)}>Cancel</Button>
                <Button
                  loading={loading}
                  onClick={() =>
                    run(
                      () =>
                        renewContractAction({
                          contractId: contract.id,
                          renewalDate: renewForm.renewalDate,
                          newStartDate: renewForm.newStartDate || undefined,
                          newEndDate: renewForm.newEndDate || undefined,
                          cost: renewForm.cost ? Number(renewForm.cost) : undefined,
                        }),
                      { successMessage: "Contract renewed.", onSuccess: () => setRenewOpen(false) },
                    )
                  }
                >
                  Record renewal
                </Button>
              </div>
            </DialogContent>
          </Dialog>
          <Button
            variant="ghost" size="icon" loading={loading} aria-label="Terminate contract" title="Terminate"
            onClick={() =>
              run(() => setContractStatusAction(contract.id, "TERMINATED"), { successMessage: "Contract terminated." })
            }
          >
            <Ban className="h-4 w-4 text-destructive" />
          </Button>
        </>
      ) : null}
    </div>
  );
}
