"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, FileSpreadsheet, Pencil, Plus, Trash2, Upload } from "lucide-react";
import {
  createBudgetAction, saveLineAction, moveBudgetAction, previewBudgetImportAction, commitBudgetImportAction,
} from "@/modules/budgets/actions";
import type { BudgetImportPreview } from "@/modules/budgets/service";
import {
  CAPEX_TYPE_LABELS, MONTHS, PRIORITY_LABELS, QUARTERS, capexTotal, evenMonths, evenShares, sharesComplete, sum, usd,
} from "@/modules/budgets/budget-math";
import { quickCreateVendorIdAction } from "@/modules/catalogs/actions";
import { useAction } from "@/shared/ui/use-action";
import { useToast } from "@/shared/ui/toast";
import { Button } from "@/shared/ui/button";
import { Input, Select, Textarea, Label, FieldError, HelperText } from "@/shared/ui/input";
import { Combobox } from "@/shared/ui/combobox";
import { Dialog, DialogContent, DialogTrigger } from "@/shared/ui/dialog";
import { cn } from "@/shared/utils";

type Kind = "OPEX" | "CAPEX";
type Share = { companyId: string; percent: string };
export interface BudgetCatalogs {
  companies: { id: string; name: string }[];
  vendors: { id: string; name: string }[];
  departments: string[];
  canCreateVendors: boolean;
}

// ---------------------------------------------------------------------------
// New budget
// ---------------------------------------------------------------------------

export function NewBudgetDialog({ earlier }: { earlier: { id: string; kind: Kind; year: number }[] }) {
  const { run, loading, fieldErrors } = useAction();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const nextYear = new Date().getFullYear() + 1;
  const [form, setForm] = useState({ kind: "OPEX" as Kind, year: String(nextYear), copyFromId: "", notes: "" });
  const sources = earlier.filter((b) => b.kind === form.kind);
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) {
          const latest = earlier.find((b) => b.kind === "OPEX");
          setForm({ kind: "OPEX", year: String(nextYear), copyFromId: latest?.id ?? "", notes: "" });
        }
        setOpen(next);
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm"><Plus className="h-4 w-4" /> New budget</Button>
      </DialogTrigger>
      <DialogContent title="New budget" description="One OPEX and one CAPEX budget per year, in USD.">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="budget-kind" required>Kind</Label>
            <Select
              id="budget-kind"
              value={form.kind}
              onChange={(e) => {
                const kind = e.target.value as Kind;
                setForm((p) => ({ ...p, kind, copyFromId: earlier.find((b) => b.kind === kind)?.id ?? "" }));
              }}
            >
              <option value="OPEX">OPEX: running costs</option>
              <option value="CAPEX">CAPEX: purchases</option>
            </Select>
          </div>
          <div>
            <Label htmlFor="budget-year" required>Year</Label>
            <Input id="budget-year" inputMode="numeric" value={form.year} onChange={(e) => setForm((p) => ({ ...p, year: e.target.value }))} />
            <FieldError message={fieldErrors.year} />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="budget-copy">Start from</Label>
            <Select id="budget-copy" value={form.copyFromId} onChange={(e) => setForm((p) => ({ ...p, copyFromId: e.target.value }))}>
              <option value="">An empty budget</option>
              {sources.map((b) => <option key={b.id} value={b.id}>A copy of the {b.year} lines</option>)}
            </Select>
            <HelperText>Copying brings every line and its company split; change what differs this year.</HelperText>
            <FieldError message={fieldErrors.copyFromId} />
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button
            loading={loading}
            onClick={() =>
              run(() => createBudgetAction({ ...form, copyFromId: form.copyFromId || null }), {
                successMessage: "Budget created.",
                onSuccess: ({ id }) => {
                  setOpen(false);
                  router.push(`/budgets/${id}`);
                },
              })
            }
          >
            Create
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Company split
// ---------------------------------------------------------------------------

function SplitEditor({
  companies, value, onChange, error,
}: { companies: { id: string; name: string }[]; value: Share[]; onChange: (next: Share[]) => void; error?: string }) {
  const total = value.reduce((s, v) => s + (Number(v.percent) || 0), 0);
  const complete = sharesComplete(value.map((v) => Number(v.percent) || 0));
  const unused = companies.filter((c) => !value.some((v) => v.companyId === c.id));
  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <Label>Paid by</Label>
        <div className="flex gap-1">
          {companies.map((c) => (
            <button
              key={c.id}
              type="button"
              className="rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground"
              onClick={() => onChange([{ companyId: c.id, percent: "100" }])}
            >
              All {c.name.split(" ")[0]}
            </button>
          ))}
          {companies.length > 1 ? (
            <button
              type="button"
              className="rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground"
              onClick={() => {
                const shares = evenShares(companies.length);
                onChange(companies.map((c, i) => ({ companyId: c.id, percent: String(shares[i]) })));
              }}
            >
              Split evenly
            </button>
          ) : null}
        </div>
      </div>
      <div className="mt-1.5 space-y-1.5">
        {value.map((row, index) => (
          <div key={index} className="flex items-center gap-2">
            <Select
              aria-label="Company"
              value={row.companyId}
              className="flex-1"
              onChange={(e) => onChange(value.map((v, i) => (i === index ? { ...v, companyId: e.target.value } : v)))}
            >
              <option value="" disabled>Select company</option>
              {companies.filter((c) => c.id === row.companyId || !value.some((v) => v.companyId === c.id)).map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
            <div className="relative w-24">
              <Input
                aria-label="Share in percent"
                inputMode="decimal"
                value={row.percent}
                className="pr-6 text-right"
                onChange={(e) => onChange(value.map((v, i) => (i === index ? { ...v, percent: e.target.value } : v)))}
              />
              <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">%</span>
            </div>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Remove this company"
              disabled={value.length === 1}
              onClick={() => onChange(value.filter((_, i) => i !== index))}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex items-center justify-between text-xs">
        {unused.length > 0 ? (
          <button type="button" className="font-medium text-primary hover:underline" onClick={() => onChange([...value, { companyId: unused[0]!.id, percent: "" }])}>
            + Add a company
          </button>
        ) : <span />}
        <span className={cn("tabular-nums", complete ? "text-muted-foreground" : "font-medium text-destructive")}>
          {Math.round(total * 100) / 100}% of 100%
        </span>
      </div>
      <FieldError message={error} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Line
// ---------------------------------------------------------------------------

export interface LineRecord {
  id: string;
  reference: string | null;
  department: string | null;
  description: string;
  vendorId: string | null;
  category: string | null;
  amount: number;
  months: number[];
  evenlySpread: boolean;
  quantity: number | null;
  unitPrice: number | null;
  associatedCost: number | null;
  priority: string | null;
  capexType: string | null;
  period: string | null;
  locationCode: string | null;
  justification: string | null;
  notes: string | null;
  allocations: { companyId: string; percent: number }[];
}

export function LineDialog({
  budgetId, kind, catalogs, line, defaultShares,
}: {
  budgetId: string;
  kind: Kind;
  catalogs: BudgetCatalogs;
  line?: LineRecord;
  /** The split of the line added last, so a run of lines for one company is quick. */
  defaultShares: Share[];
}) {
  const { run, loading, fieldErrors } = useAction();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [vendors, setVendors] = useState(catalogs.vendors);
  const blank = () => ({
    reference: line?.reference ?? "",
    department: line?.department ?? "",
    description: line?.description ?? "",
    vendorId: line?.vendorId ?? "",
    category: line?.category ?? "",
    amount: line ? String(line.amount) : "",
    phasing: (line && !line.evenlySpread ? "MONTHLY" : "EVEN") as "EVEN" | "MONTHLY",
    months: (line?.months ?? Array(12).fill(0)).map((m) => String(m)),
    quantity: line?.quantity != null ? String(line.quantity) : "1",
    unitPrice: line?.unitPrice != null ? String(line.unitPrice) : "",
    associatedCost: line?.associatedCost != null ? String(line.associatedCost) : "",
    priority: line?.priority ?? "",
    capexType: line?.capexType ?? "",
    period: line?.period ?? "",
    locationCode: line?.locationCode ?? "",
    justification: line?.justification ?? "",
    notes: line?.notes ?? "",
    shares: line ? line.allocations.map((a) => ({ companyId: a.companyId, percent: String(a.percent) })) : defaultShares,
  });
  const [form, setForm] = useState(blank);
  const set = <K extends keyof ReturnType<typeof blank>>(key: K, value: ReturnType<typeof blank>[K]) => setForm((p) => ({ ...p, [key]: value }));
  const capex = kind === "CAPEX";
  const total = capex
    ? capexTotal(Number(form.quantity) || 0, Number(form.unitPrice) || 0, Number(form.associatedCost) || 0)
    : form.phasing === "MONTHLY"
      ? sum(form.months.map((m) => Number(m) || 0))
      : Number(form.amount) || 0;
  const spread = useMemo(() => evenMonths(Number(form.amount) || 0), [form.amount]);

  async function createVendor(name: string) {
    const result = await quickCreateVendorIdAction(name);
    if (!result.ok) {
      toast("error", result.error);
      return null;
    }
    setVendors((prev) => (prev.some((v) => v.id === result.data.value) ? prev : [...prev, { id: result.data.value, name: result.data.label }]));
    return result.data;
  }

  function submit() {
    const payload = {
      reference: form.reference,
      department: form.department,
      description: form.description,
      vendorId: form.vendorId || null,
      category: form.category,
      amount: capex ? null : form.amount,
      phasing: form.phasing,
      months: !capex && form.phasing === "MONTHLY" ? form.months.map((m) => Number(m) || 0) : null,
      quantity: capex ? form.quantity : null,
      unitPrice: capex ? form.unitPrice : null,
      associatedCost: capex ? form.associatedCost : null,
      priority: capex && form.priority ? form.priority : null,
      capexType: capex && form.capexType ? form.capexType : null,
      period: capex && form.period ? form.period : null,
      locationCode: form.locationCode,
      justification: form.justification,
      notes: form.notes,
      allocations: form.shares.filter((s) => s.companyId).map((s) => ({ companyId: s.companyId, percent: Number(s.percent) || 0 })),
    };
    void run(() => saveLineAction(budgetId, line?.id ?? null, payload), {
      successMessage: line ? "Line saved." : "Line added.",
      onSuccess: () => setOpen(false),
    });
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (next) setForm(blank()); setOpen(next); }}>
      <DialogTrigger asChild>
        {line ? (
          <Button variant="ghost" size="icon" aria-label={`Edit ${line.description}`}><Pencil className="h-4 w-4" /></Button>
        ) : (
          <Button size="sm"><Plus className="h-4 w-4" /> Add line</Button>
        )}
      </DialogTrigger>
      <DialogContent title={line ? "Edit line" : `Add ${kind} line`} wide>
        <datalist id="budget-departments">{catalogs.departments.map((d) => <option key={d} value={d} />)}</datalist>
        <div className="grid gap-3 sm:grid-cols-6">
          <div className="sm:col-span-4">
            <Label htmlFor="line-description" required>{capex ? "Item" : "Product or service"}</Label>
            <Input id="line-description" value={form.description} onChange={(e) => set("description", e.target.value)} />
            <FieldError message={fieldErrors.description} />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="line-ref">Ref</Label>
            <Input id="line-ref" placeholder={capex ? "IT-01" : ""} value={form.reference} onChange={(e) => set("reference", e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="line-dept">Department</Label>
            <Input id="line-dept" list="budget-departments" value={form.department} onChange={(e) => set("department", e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="line-vendor">Vendor</Label>
            <Combobox
              id="line-vendor"
              value={form.vendorId}
              placeholder="Select vendor"
              emptyLabel="None"
              options={vendors.map((v) => ({ value: v.id, label: v.name }))}
              onChange={(v) => set("vendorId", v)}
              onCreate={catalogs.canCreateVendors ? createVendor : undefined}
              createNoun="vendor"
            />
            <FieldError message={fieldErrors.vendorId} />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="line-category">{capex ? "Category" : "Kind of cost"}</Label>
            <Input id="line-category" placeholder={capex ? "Hardware" : "Subscription"} value={form.category} onChange={(e) => set("category", e.target.value)} />
          </div>

          {capex ? (
            <>
              <div className="sm:col-span-2">
                <Label htmlFor="line-qty" required>Quantity</Label>
                <Input id="line-qty" inputMode="numeric" value={form.quantity} onChange={(e) => set("quantity", e.target.value)} />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="line-price" required>Unit price (USD)</Label>
                <Input id="line-price" inputMode="decimal" value={form.unitPrice} onChange={(e) => set("unitPrice", e.target.value)} />
                <FieldError message={fieldErrors.unitPrice} />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="line-assoc">Associated cost</Label>
                <Input id="line-assoc" inputMode="decimal" placeholder="Shipping, install" value={form.associatedCost} onChange={(e) => set("associatedCost", e.target.value)} />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="line-priority">Priority</Label>
                <Select id="line-priority" value={form.priority} onChange={(e) => set("priority", e.target.value)}>
                  <option value="">Not set</option>
                  {Object.entries(PRIORITY_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </Select>
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="line-type">CAPEX type</Label>
                <Select id="line-type" value={form.capexType} onChange={(e) => set("capexType", e.target.value)}>
                  <option value="">Not set</option>
                  {Object.entries(CAPEX_TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </Select>
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="line-period">Needed in</Label>
                <Select id="line-period" value={form.period} onChange={(e) => set("period", e.target.value)}>
                  <option value="">Any time</option>
                  {QUARTERS.map((q) => <option key={q} value={q}>{q}</option>)}
                </Select>
              </div>
              <div className="sm:col-span-6">
                <Label htmlFor="line-just">Reason / justification</Label>
                <Textarea id="line-just" rows={2} value={form.justification} onChange={(e) => set("justification", e.target.value)} />
              </div>
            </>
          ) : (
            <>
              <div className="sm:col-span-2">
                <Label htmlFor="line-amount" required>Amount for the year (USD)</Label>
                <Input
                  id="line-amount"
                  inputMode="decimal"
                  value={form.phasing === "MONTHLY" ? String(total) : form.amount}
                  disabled={form.phasing === "MONTHLY"}
                  onChange={(e) => set("amount", e.target.value)}
                />
                <FieldError message={fieldErrors.amount ?? fieldErrors.months} />
              </div>
              <div className="sm:col-span-4">
                <Label>Spread over the year</Label>
                <div className="flex gap-1.5" role="radiogroup" aria-label="Spread over the year">
                  {([["EVEN", "Evenly, 1/12 a month"], ["MONTHLY", "Amounts per month"]] as const).map(([value, text]) => (
                    <button
                      key={value}
                      type="button"
                      role="radio"
                      aria-checked={form.phasing === value}
                      onClick={() => {
                        if (value === "MONTHLY" && form.phasing === "EVEN") set("months", spread.map(String));
                        set("phasing", value);
                      }}
                      className={cn(
                        "rounded-full border px-3 py-1.5 text-xs",
                        form.phasing === value ? "border-primary bg-primary/10 font-medium text-primary" : "text-muted-foreground hover:bg-accent",
                      )}
                    >
                      {text}
                    </button>
                  ))}
                </div>
              </div>
              {form.phasing === "MONTHLY" ? (
                <div className="grid grid-cols-4 gap-2 sm:col-span-6 sm:grid-cols-6 lg:grid-cols-12">
                  {MONTHS.map((month, i) => (
                    <div key={month}>
                      <Label htmlFor={`m-${i}`} className="text-[11px]">{month}</Label>
                      <Input
                        id={`m-${i}`}
                        inputMode="decimal"
                        className="px-2 text-right text-xs"
                        value={form.months[i]}
                        onChange={(e) => set("months", form.months.map((m, j) => (j === i ? e.target.value : m)))}
                      />
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground sm:col-span-6">
                  {usd(spread[0] ?? 0, 2)} a month{spread[11] !== spread[0] ? ` (${usd(spread[11] ?? 0, 2)} in the last months, so the year adds up)` : ""}.
                </p>
              )}
            </>
          )}

          <div className="sm:col-span-3">
            <SplitEditor companies={catalogs.companies} value={form.shares} onChange={(v) => set("shares", v)} error={fieldErrors.allocations} />
          </div>
          <div className="space-y-3 sm:col-span-3">
            <div>
              <Label htmlFor="line-location">Location code</Label>
              <Input id="line-location" value={form.locationCode} onChange={(e) => set("locationCode", e.target.value)} />
            </div>
            <div>
              <Label htmlFor="line-notes">Notes</Label>
              <Textarea id="line-notes" rows={2} value={form.notes} onChange={(e) => set("notes", e.target.value)} />
            </div>
          </div>
        </div>
        <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t pt-4">
          <p className="text-sm">
            <span className="text-muted-foreground">Line total </span>
            <span className="font-semibold tabular-nums">{usd(total, 2)}</span>
          </p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={submit} loading={loading}>{line ? "Save line" : "Add line"}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

export function MoveButton({
  budgetId, move, label, variant = "outline",
}: { budgetId: string; move: "submit" | "approve" | "return" | "reopen"; label: string; variant?: "outline" | "primary" }) {
  const { run, loading, fieldErrors } = useAction();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const needsReason = move === "return" || move === "reopen";
  const done = { submit: "Submitted for approval.", approve: "Budget approved.", return: "Returned to draft.", reopen: "Reopened as a draft." }[move];
  if (!needsReason) {
    return (
      <Button size="sm" variant={variant} loading={loading} onClick={() => run(() => moveBudgetAction(budgetId, move), { successMessage: done })}>
        {label}
      </Button>
    );
  }
  return (
    <Dialog open={open} onOpenChange={(next) => { if (next) setReason(""); setOpen(next); }}>
      <DialogTrigger asChild>
        <Button size="sm" variant={variant}>{label}</Button>
      </DialogTrigger>
      <DialogContent title={label} description="The reason is kept in the budget's history.">
        <Label htmlFor="move-reason" required>Reason</Label>
        <Textarea id="move-reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
        <FieldError message={fieldErrors.reason} />
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button loading={loading} onClick={() => run(() => moveBudgetAction(budgetId, move, { reason }), { successMessage: done, onSuccess: () => setOpen(false) })}>
            {label}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

export function BudgetImportDialog({ budgetId, kind, companies }: { budgetId: string; kind: Kind; companies: { id: string; name: string }[] }) {
  const { toast } = useToast();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [sheet, setSheet] = useState("");
  const [fileError, setFileError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<BudgetImportPreview | null>(null);
  const [shares, setShares] = useState<Share[]>(companies.length > 0 ? [{ companyId: companies[0]!.id, percent: "100" }] : []);

  async function read(sheetName = sheet) {
    if (!file) {
      setFileError("Choose a file first.");
      return;
    }
    setBusy(true);
    setFileError(undefined);
    try {
      const data = new FormData();
      data.set("file", file);
      data.set("budgetId", budgetId);
      data.set("sheet", sheetName);
      const response = await previewBudgetImportAction(data);
      if (!response.ok) {
        setFileError(response.fieldErrors?.file ?? response.error);
        return;
      }
      setPreview(response.data);
      setSheet(response.data.sheet);
    } finally {
      setBusy(false);
    }
  }

  async function commit() {
    if (!file || !preview) return;
    if (!sharesComplete(shares.map((s) => Number(s.percent) || 0))) {
      toast("error", "The shares must add up to 100%.");
      return;
    }
    setBusy(true);
    try {
      const data = new FormData();
      data.set("file", file);
      data.set("budgetId", budgetId);
      data.set("options", JSON.stringify({ sheet, allocations: shares.map((s) => ({ companyId: s.companyId, percent: Number(s.percent) })) }));
      const response = await commitBudgetImportAction(data);
      if (!response.ok) {
        toast("error", response.error);
        return;
      }
      toast("success", `${response.data.added} lines added.`);
      setOpen(false);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) {
          setFile(null);
          setPreview(null);
          setSheet("");
        }
        setOpen(next);
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" variant="outline"><Upload className="h-4 w-4" /> Import lines</Button>
      </DialogTrigger>
      <DialogContent
        title={`Import ${kind} lines`}
        description={
          kind === "OPEX"
            ? "The IT OPEX sheet as it is: one row per item, with department, vendor and the twelve months."
            : "The CAPEX wish list as it is: department sections with Ref#, Description, Priority, Q'ty and Unit Price."
        }
        wide
      >
        {!preview ? (
          <div className="space-y-4">
            <label
              htmlFor="budget-file"
              className="flex cursor-pointer items-center gap-3 rounded-2xl border border-dashed px-4 py-5 text-sm transition-colors hover:border-primary/40 hover:bg-accent/40"
            >
              <FileSpreadsheet className="h-6 w-6 shrink-0 text-muted-foreground" />
              <span className="min-w-0">
                <span className="block truncate font-medium">{file ? file.name : "Choose a spreadsheet"}</span>
                <span className="block text-xs text-muted-foreground">.xlsx, .xlsm or .csv</span>
              </span>
            </label>
            <input id="budget-file" type="file" accept=".xlsx,.xlsm,.csv" className="sr-only" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            <FieldError message={fileError} />
            <Button onClick={() => read("")} loading={busy}><Upload className="h-4 w-4" /> Read file</Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div className="text-sm">
                <p className="flex items-center gap-1.5 font-medium"><CheckCircle2 className="h-4 w-4 text-success" /> {preview.lines.length} lines, {usd(preview.total)}</p>
                <p className="text-xs text-muted-foreground">Sheet &ldquo;{preview.sheet}&rdquo;</p>
              </div>
              {preview.sheets.length > 1 ? (
                <div className="w-64">
                  <Label htmlFor="budget-sheet">Sheet</Label>
                  <Select id="budget-sheet" value={sheet} onChange={(e) => { setSheet(e.target.value); void read(e.target.value); }}>
                    {preview.sheets.map((s) => <option key={s.name} value={s.name}>{s.name} ({s.lines} lines)</option>)}
                  </Select>
                </div>
              ) : null}
            </div>
            <div className="max-h-72 overflow-auto rounded-xl border">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-card text-left text-xs text-muted-foreground">
                  <tr className="border-b">
                    <th className="px-3 py-2 font-medium">Item</th>
                    <th className="px-3 py-2 font-medium">Department</th>
                    <th className="px-3 py-2 font-medium">{kind === "OPEX" ? "Vendor" : "Category"}</th>
                    <th className="px-3 py-2 text-right font-medium">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.lines.map((l) => (
                    <tr key={l.row} className="border-b last:border-0">
                      <td className="px-3 py-1.5">
                        {l.reference && kind === "CAPEX" ? <span className="mr-1.5 font-mono text-xs text-muted-foreground">{l.reference}</span> : null}
                        {l.description}
                      </td>
                      <td className="px-3 py-1.5 text-xs">{l.department ?? ""}</td>
                      <td className="px-3 py-1.5 text-xs">{(kind === "OPEX" ? l.vendor : l.category) ?? ""}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">
                        {usd(l.amount, 2)}
                        <p className="text-[11px] text-muted-foreground">{l.detail}</p>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {preview.leftOut.length > 0 ? (
              <p className="text-xs text-muted-foreground">
                Left out: {preview.leftOut.map((l) => `row ${l.row} "${l.text}" (${l.reason.replace(/\.$/, "").toLowerCase()})`).join(", ")}.
              </p>
            ) : null}
            {preview.newVendors.length > 0 ? (
              <p className="text-xs text-muted-foreground">New vendors added to Settings: {preview.newVendors.join(", ")}.</p>
            ) : null}
            <div className="max-w-md">
              <SplitEditor companies={companies} value={shares} onChange={setShares} />
              <HelperText>Every imported line gets this split. Change single lines afterwards.</HelperText>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setPreview(null)}>Choose another file</Button>
              <Button onClick={commit} loading={busy} disabled={preview.lines.length === 0}>Add {preview.lines.length} lines</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
