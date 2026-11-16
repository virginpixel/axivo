"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FileSpreadsheet, Upload, ArrowLeft, CheckCircle2 } from "lucide-react";
import { previewImportAction, commitImportAction } from "@/modules/infrastructure/actions";
import type { ImportPreview, ImportResult } from "@/modules/infrastructure/import";
import { KIND_PATHS, type DeviceKind } from "@/modules/infrastructure/validators";
import { useToast } from "@/shared/ui/toast";
import { Button, buttonVariants } from "@/shared/ui/button";
import { Label, Select, FieldError, HelperText } from "@/shared/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/shared/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/shared/ui/table";
import { Badge } from "@/shared/ui/badge";
import { cn } from "@/shared/utils";

interface Props {
  companies: { id: string; name: string }[];
  types: { id: string; name: string; kind: string }[];
  canImportLogins: boolean;
}

type Outcome = { label: string; tone: "success" | "info" | "default" | "warning" };

export function ImportWizard({ companies, types, canImportLogins }: Props) {
  const { toast } = useToast();
  const router = useRouter();
  const [kind, setKind] = useState<DeviceKind>("NETWORK");
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [companyMap, setCompanyMap] = useState<Record<string, string>>({});
  const [typeMap, setTypeMap] = useState<Record<string, string>>({});
  const [existing, setExisting] = useState<"update" | "skip">("update");
  const [importLogins, setImportLogins] = useState(true);
  const [excluded, setExcluded] = useState<Set<number>>(new Set());
  const [result, setResult] = useState<ImportResult | null>(null);

  const companyName = useMemo(() => new Map(companies.map((c) => [c.id, c.name])), [companies]);
  const typeName = useMemo(() => new Map(types.map((t) => [t.id, t.name])), [types]);
  const kindTypes = types.filter((t) => t.kind === kind);

  async function readFile() {
    if (!file) {
      setFileError("Choose a file first.");
      return;
    }
    setFileError(undefined);
    setBusy(true);
    try {
      const data = new FormData();
      data.set("file", file);
      data.set("kind", kind);
      const response = await previewImportAction(data);
      if (!response.ok) {
        setFileError(response.fieldErrors?.file ?? response.error);
        return;
      }
      const p = response.data;
      setPreview(p);
      setCompanyMap(Object.fromEntries(p.companyKeys.map((k) => [k.key, k.suggestedCompanyId ?? ""])));
      setTypeMap(Object.fromEntries(p.typeKeys.map((k) => [k.key, k.suggestedTypeId ?? ""])));
      setExcluded(new Set(p.rows.filter((r) => !r.name).map((r) => r.row)));
      setImportLogins(canImportLogins && p.rows.some((r) => r.loginFingerprint));
    } finally {
      setBusy(false);
    }
  }

  function outcomeOf(row: ImportPreview["rows"][number]): Outcome {
    if (!row.name) return { label: "Skipped: no name", tone: "default" };
    if (excluded.has(row.row)) return { label: "Left out", tone: "default" };
    const companyId = companyMap[row.companyKey];
    if (!companyId) return { label: "Skipped: no company", tone: "warning" };
    if (!typeMap[row.typeKey]) return { label: "Skipped: no type", tone: "warning" };
    if (row.existsIn.includes(companyId)) {
      return existing === "update" ? { label: "Update", tone: "info" } : { label: "Skipped: exists", tone: "default" };
    }
    return { label: "New", tone: "success" };
  }

  const summary = useMemo(() => {
    if (!preview) return null;
    const counts = { New: 0, Update: 0, skipped: 0 };
    const logins = new Set<string>();
    let loginRows = 0;
    for (const row of preview.rows) {
      const outcome = outcomeOf(row);
      if (outcome.label === "New") counts.New += 1;
      else if (outcome.label === "Update") counts.Update += 1;
      else counts.skipped += 1;
      if ((outcome.label === "New" || outcome.label === "Update") && row.loginFingerprint) {
        loginRows += 1;
        logins.add(`${companyMap[row.companyKey]}|${row.loginFingerprint}`);
      }
    }
    return { ...counts, loginRows, loginSets: logins.size };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preview, companyMap, typeMap, existing, excluded]);

  async function runImport() {
    if (!file || !preview) return;
    setBusy(true);
    try {
      const data = new FormData();
      data.set("file", file);
      data.set(
        "options",
        JSON.stringify({
          kind,
          companyMap,
          typeMap,
          existing,
          importLogins: importLogins && canImportLogins,
          excludedRows: [...excluded],
        }),
      );
      const response = await commitImportAction(data);
      if (!response.ok) {
        toast("error", response.error);
        return;
      }
      setResult(response.data);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  function startOver() {
    setPreview(null);
    setResult(null);
    setFile(null);
    setExcluded(new Set());
  }

  // ------------------------------------------------------------------ result
  if (result) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><CheckCircle2 className="h-5 w-5 text-success" /> Import finished</CardTitle>
          <CardDescription>
            {result.created} added, {result.updated} updated, {result.skipped.length} skipped.
            {result.credentialSetsCreated + result.credentialSetsReused > 0
              ? ` Logins: ${result.credentialSetsCreated} credential set${result.credentialSetsCreated === 1 ? "" : "s"} created, ${result.credentialSetsReused} reused, ${result.credentialLinks} device link${result.credentialLinks === 1 ? "" : "s"}.`
              : ""}
            {result.manufacturersCreated.length > 0 ? ` New manufacturers: ${result.manufacturersCreated.join(", ")}.` : ""}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {result.skipped.length > 0 ? (
            <details className="mb-4 text-sm">
              <summary className="cursor-pointer font-medium">Skipped rows ({result.skipped.length})</summary>
              <ul className="mt-2 space-y-1 text-muted-foreground">
                {result.skipped.map((s) => (
                  <li key={s.row}>Row {s.row}{s.name ? ` - ${s.name}` : ""}: {s.reason}</li>
                ))}
              </ul>
            </details>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Link href={KIND_PATHS[kind]} className={buttonVariants()}>Open {kind === "NETWORK" ? "network devices" : "servers & hosts"}</Link>
            {result.credentialSetsCreated > 0 ? (
              <Link href="/infrastructure/credentials" className={buttonVariants({ variant: "outline" })}>Open the credential vault</Link>
            ) : null}
            <Button variant="ghost" onClick={startOver}>Import another file</Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // ------------------------------------------------------------------ step 1
  if (!preview) {
    return (
      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>Choose a file</CardTitle>
          <CardDescription>
            An Excel (.xlsx) or CSV file with one device per row. Nothing is saved until you have checked the preview.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <fieldset>
            <legend className="mb-2 text-sm font-medium">What is in it?</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {(["NETWORK", "SERVER"] as const).map((value) => (
                <label
                  key={value}
                  className={cn(
                    "flex cursor-pointer items-start gap-3 rounded-2xl border p-4 transition-colors",
                    kind === value ? "border-primary bg-primary/5" : "hover:border-primary/40",
                  )}
                >
                  <input type="radio" name="kind" className="mt-1" checked={kind === value} onChange={() => setKind(value)} />
                  <span>
                    <span className="block text-sm font-medium">{value === "NETWORK" ? "Network devices" : "Servers & hosts"}</span>
                    <span className="block text-xs text-muted-foreground">
                      {value === "NETWORK" ? "Switches, firewalls, routers, controllers" : "Servers, VMs, NAS, appliances. Logins are picked up too."}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <div>
            <Label htmlFor="import-file" required>File</Label>
            <label
              htmlFor="import-file"
              className="flex cursor-pointer items-center gap-3 rounded-2xl border border-dashed px-4 py-5 text-sm transition-colors hover:border-primary/40 hover:bg-accent/40"
            >
              <FileSpreadsheet className="h-6 w-6 shrink-0 text-muted-foreground" />
              <span className="min-w-0">
                <span className="block truncate font-medium">{file ? file.name : "Choose a spreadsheet"}</span>
                <span className="block text-xs text-muted-foreground">
                  {file ? `${(file.size / 1024).toFixed(0)} KB` : ".xlsx or .csv, up to 5 MB"}
                </span>
              </span>
            </label>
            <input
              id="import-file"
              type="file"
              accept=".xlsx,.xlsm,.csv"
              className="sr-only"
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null);
                setFileError(undefined);
              }}
            />
            <FieldError message={fileError} />
            <HelperText>
              Columns are matched by their headings: Name or Description, Hostname, IP Address, Company, Vendor, Model, Serial, OS,
              Firmware or Version, Domain, Location, Remark, Username and Password.
            </HelperText>
          </div>
          <Button onClick={readFile} loading={busy}><Upload className="h-4 w-4" /> Read file</Button>
        </CardContent>
      </Card>
    );
  }

  // ------------------------------------------------------------------ step 2
  const hasLogins = preview.rows.some((r) => r.loginFingerprint);
  const toImport = (summary?.New ?? 0) + (summary?.Update ?? 0);

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle>{preview.fileName}</CardTitle>
          <CardDescription>
            Sheet &ldquo;{preview.sheetName}&rdquo;, headings on row {preview.headerRow}, {preview.rows.length} rows.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex flex-wrap gap-1.5">
            {preview.columns.map((column) => (
              <Badge key={column.field} variant="primary" title={`From column "${column.header}"`}>
                {column.label}{column.header && column.header.toLowerCase() !== column.label.toLowerCase() ? ` ← ${column.header}` : ""}
              </Badge>
            ))}
          </div>
          {preview.ignoredHeaders.length > 0 ? (
            <p className="text-xs text-muted-foreground">Not imported: {preview.ignoredHeaders.join(", ")}.</p>
          ) : null}
        </CardContent>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Companies</CardTitle>
            <CardDescription>
              {preview.companyKeys.some((k) => k.key !== "(blank)") && preview.columns.some((c) => c.field === "company")
                ? "Each value in the Company column, and the company it means."
                : "There is no Company column, so rows are grouped by how their name starts."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <MappingTable
              entries={preview.companyKeys.map((k) => ({ key: k.key, count: k.count }))}
              value={companyMap}
              onChange={setCompanyMap}
              options={companies.map((c) => ({ value: c.id, label: c.name }))}
              placeholder="Skip these rows"
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Device types</CardTitle>
            <CardDescription>
              {preview.columns.some((c) => c.field === "type")
                ? "Each value in the Type column, and the device type it means."
                : preview.columns.some((c) => c.field === "operatingSystem")
                  ? "There is no Type column, so rows are grouped by operating system."
                  : "There is no Type column, so one type is used for every row."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <MappingTable
              entries={preview.typeKeys.map((k) => ({ key: k.key, count: k.count }))}
              value={typeMap}
              onChange={setTypeMap}
              options={kindTypes.map((t) => ({ value: t.id, label: t.name }))}
              placeholder="Skip these rows"
            />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Options</CardTitle></CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex flex-wrap items-center gap-3">
            <Label htmlFor="import-existing" className="mb-0">Devices already in the register</Label>
            <Select id="import-existing" className="h-9 w-64" value={existing} onChange={(e) => setExisting(e.target.value as "update" | "skip")}>
              <option value="update">Update them from the file</option>
              <option value="skip">Leave them as they are</option>
            </Select>
          </div>
          <p className="text-xs text-muted-foreground">
            A device already exists when its company has one with the same name. Updating only fills in cells that have a value: a blank cell never clears anything.
          </p>
          {hasLogins ? (
            canImportLogins ? (
              <label className="flex items-start gap-2">
                <input type="checkbox" className="mt-0.5" checked={importLogins} onChange={(e) => setImportLogins(e.target.checked)} />
                <span>
                  Import the logins into the credential vault. {summary?.loginRows ?? 0} row{summary?.loginRows === 1 ? " has" : "s have"}{" "}
                  <strong>{summary?.loginSets ?? 0} different login{summary?.loginSets === 1 ? "" : "s"}</strong>, which become
                  {summary?.loginSets === 1 ? " one credential set" : ` ${summary?.loginSets ?? 0} credential sets`} (an identical one already in the
                  vault is reused). Passwords are encrypted on the server and never shown here.
                </span>
              </label>
            ) : (
              <p className="rounded-xl border border-warning/40 bg-warning/10 px-3 py-2 text-xs">
                This file has logins, but you cannot manage credential sets, so they will not be imported.
              </p>
            )
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Rows</CardTitle>
          <CardDescription>
            {summary?.New ?? 0} new, {summary?.Update ?? 0} to update, {summary?.skipped ?? 0} skipped. Untick a row to leave it out.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="max-h-[32rem] overflow-auto scrollbar-thin">
            <Table>
              <THead>
                <TR>
                  <TH className="w-8"><span className="sr-only">Include</span></TH>
                  <TH>Row</TH><TH>Name</TH><TH>IP address</TH><TH>Company</TH><TH>Type</TH><TH>Make / model</TH>
                  {hasLogins ? <TH>Login</TH> : null}
                  <TH>Result</TH>
                </TR>
              </THead>
              <TBody>
                {preview.rows.map((row) => {
                  const outcome = outcomeOf(row);
                  const companyId = companyMap[row.companyKey];
                  const typeId = typeMap[row.typeKey];
                  return (
                    <TR key={row.row} className={cn(outcome.label.startsWith("Skipped") || outcome.label === "Left out" ? "opacity-60" : "")}>
                      <TD>
                        <input
                          type="checkbox"
                          aria-label={`Include row ${row.row}`}
                          disabled={!row.name}
                          checked={!excluded.has(row.row)}
                          onChange={(e) =>
                            setExcluded((prev) => {
                              const next = new Set(prev);
                              if (e.target.checked) next.delete(row.row);
                              else next.add(row.row);
                              return next;
                            })
                          }
                        />
                      </TD>
                      <TD className="tabular-nums text-xs text-muted-foreground">{row.row}</TD>
                      <TD>
                        <span className="font-medium">{row.name || "None"}</span>
                        {row.hostname ? <p className="text-xs text-muted-foreground">{row.hostname}</p> : null}
                      </TD>
                      <TD className="font-mono text-xs">{row.ipAddress ?? "None"}</TD>
                      <TD className="text-xs">{companyId ? companyName.get(companyId) : <span className="text-muted-foreground">{row.companyKey}</span>}</TD>
                      <TD className="text-xs">{typeId ? typeName.get(typeId) : <span className="text-muted-foreground">{row.typeKey}</span>}</TD>
                      <TD className="text-xs">{[row.manufacturer, row.model].filter(Boolean).join(" ") || "None"}</TD>
                      {hasLogins ? (
                        <TD className="font-mono text-xs">{row.loginFingerprint ? (row.username ?? "(no username)") : ""}</TD>
                      ) : null}
                      <TD>
                        <Badge variant={outcome.tone}>{outcome.label}</Badge>
                        {row.problems.map((problem) => (
                          <p key={problem} className="mt-1 text-xs text-warning">{problem}</p>
                        ))}
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button variant="ghost" onClick={startOver}><ArrowLeft className="h-4 w-4" /> Choose another file</Button>
        <Button onClick={runImport} loading={busy} disabled={toImport === 0}>
          Import {toImport} device{toImport === 1 ? "" : "s"}
        </Button>
      </div>
    </div>
  );
}

function MappingTable({
  entries,
  value,
  onChange,
  options,
  placeholder,
}: {
  entries: { key: string; count: number }[];
  value: Record<string, string>;
  onChange: (next: Record<string, string>) => void;
  options: { value: string; label: string }[];
  placeholder: string;
}) {
  return (
    <div className="max-h-80 space-y-2 overflow-y-auto pr-1 scrollbar-thin">
      {entries.map((entry) => (
        <div key={entry.key} className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium" title={entry.key}>{entry.key}</p>
            <p className="text-xs text-muted-foreground">{entry.count} row{entry.count === 1 ? "" : "s"}</p>
          </div>
          <Select
            aria-label={`Mapping for ${entry.key}`}
            className={cn("h-9 w-52", !value[entry.key] && "text-muted-foreground")}
            value={value[entry.key] ?? ""}
            onChange={(e) => onChange({ ...value, [entry.key]: e.target.value })}
          >
            <option value="">{placeholder}</option>
            {options.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </Select>
        </div>
      ))}
    </div>
  );
}
