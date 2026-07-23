"use client";

import { useState } from "react";
import Link from "next/link";
import { Pencil, Plus, RefreshCw, Ban, Paperclip, Eye } from "lucide-react";
import {
  createContractAction,
  updateContractAction,
  setContractStatusAction,
  renewContractAction,
  attachContractPdfAction,
} from "@/modules/contracts/actions";
import { quickCreateVendorAction, quickCreateContractCategoryAction, quickCreateCurrencyAction } from "@/modules/catalogs/actions";
import { useAction } from "@/shared/ui/use-action";
import { useToast } from "@/shared/ui/toast";
import { Button } from "@/shared/ui/button";
import { Input, Select, Textarea, Label, FieldError, HelperText } from "@/shared/ui/input";
import { Combobox } from "@/shared/ui/combobox";
import { PersonPicker } from "@/shared/ui/person-picker";
import { Dialog, DialogContent, DialogTrigger } from "@/shared/ui/dialog";
import type { ActionResult } from "@/shared/errors";

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
  currencies?: { code: string; name: string }[];
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
  const createHandler = useCreateHandler();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    companyId: contract?.companyId ?? companies[0]?.id ?? "",
    contractNumber: contract?.contractNumber ?? "",
    name: contract?.name ?? "",
    vendor: contract?.vendor ?? "",
    category: contract?.category ?? "",
    startDate: contract?.startDate ?? "",
    endDate: contract?.endDate ?? "",
    renewalType: contract?.renewalType ?? "ANNUAL",
    cost: contract?.cost !== null && contract?.cost !== undefined ? String(contract.cost) : "",
    currency: contract?.currency ?? "USD",
    ownerPersonId: contract?.ownerPersonId ?? "",
    notes: contract?.notes ?? "",
  });

  async function submit() {
    const payload = {
      companyId: form.companyId,
      contractNumber: form.contractNumber || undefined,
      name: form.name,
      vendor: form.vendor,
      category: form.category,
      startDate: form.startDate || undefined,
      endDate: form.endDate || undefined,
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
            <Combobox
              id="con-company" value={form.companyId} disabled={!!contract}
              options={companies.map((company) => ({ value: company.id, label: company.name }))}
              onChange={(value) => setForm({ ...form, companyId: value, ownerPersonId: "" })}
            />
          </div>
          <div>
            <Label htmlFor="con-name" required>Contract name</Label>
            <Input id="con-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <FieldError message={fieldErrors.name} />
          </div>
          <div>
            <Label htmlFor="con-vendor" required>Vendor</Label>
            <Combobox
              id="con-vendor" value={form.vendor}
              placeholder="Select vendor"
              options={catalogs.vendors.map((vendor) => ({ value: vendor.name, label: vendor.name }))}
              onChange={(value) => setForm({ ...form, vendor: value })}
              onCreate={createHandler(quickCreateVendorAction)}
              createNoun="vendor"
            />
            <HelperText>Vendors are managed in Settings, Vendors.</HelperText>
            <FieldError message={fieldErrors.vendor} />
          </div>
          <div>
            <Label htmlFor="con-category" required>Category</Label>
            <Combobox
              id="con-category" value={form.category}
              placeholder="Select category"
              options={catalogs.categories.map((category) => ({ value: category.name, label: category.name }))}
              onChange={(value) => setForm({ ...form, category: value })}
              onCreate={createHandler(quickCreateContractCategoryAction)}
              createNoun="category"
            />
            <FieldError message={fieldErrors.category} />
          </div>
          <div>
            <Label htmlFor="con-number">Contract number (optional)</Label>
            <Input id="con-number" value={form.contractNumber} onChange={(e) => setForm({ ...form, contractNumber: e.target.value })} />
            <FieldError message={fieldErrors.contractNumber} />
          </div>
          <div>
            <Label htmlFor="con-owner">Contract owner</Label>
            <PersonPicker
              id="con-owner"
              value={form.ownerPersonId}
              companyId={form.companyId}
              people={peopleByCompany[form.companyId] ?? []}
              placeholder="No owner"
              emptyLabel="No owner"
              onChange={(value) => setForm({ ...form, ownerPersonId: value })}
            />
            <HelperText>
              The employee responsible for managing this contract; they receive renewal and expiry reminders.
            </HelperText>
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
            <Label htmlFor="con-cost">Cost</Label>
            <Input id="con-cost" type="number" min={0} step="0.01" value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} />
          </div>
          <div>
            <Label htmlFor="con-currency">Currency</Label>
            <Combobox
              id="con-currency" value={form.currency}
              placeholder="Select currency"
              options={(catalogs.currencies ?? []).map((currency) => ({ value: currency.code, label: `${currency.code} - ${currency.name}` }))}
              onChange={(value) => setForm({ ...form, currency: value })}
              onCreate={createHandler(quickCreateCurrencyAction)}
              createNoun="currency"
            />
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
  hideView,
}: {
  contract: ContractRecord;
  companies: { id: string; name: string }[];
  peopleByCompany: Record<string, { id: string; name: string }[]>;
  catalogs: ContractCatalogs;
  hideView?: boolean;
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
      {!hideView ? (
        <Link
          href={`/contracts/${contract.id}`}
          className="inline-flex h-9 w-9 items-center justify-center rounded-md hover:bg-accent"
          aria-label="View contract"
          title="View contract & documents"
        >
          <Eye className="h-4 w-4 text-primary" />
        </Link>
      ) : null}
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
