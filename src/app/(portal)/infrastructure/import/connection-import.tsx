"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, CheckCircle2, FileSpreadsheet, TriangleAlert, Upload } from "lucide-react";
import { previewLinkImportAction, commitLinkImportAction } from "@/modules/infrastructure/actions";
import type { LinkImportPreview, LinkImportResult } from "@/modules/infrastructure/topology";
import { useToast } from "@/shared/ui/toast";
import { Button, buttonVariants } from "@/shared/ui/button";
import { Label, FieldError, HelperText } from "@/shared/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/shared/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/shared/ui/table";
import { Badge } from "@/shared/ui/badge";
import { cn } from "@/shared/utils";

type Filter = "all" | "new" | "changed" | "known";

const OUTCOME: Record<LinkImportPreview["links"][number]["outcome"], { label: string; tone: "success" | "warning" | "default" }> = {
  new: { label: "New", tone: "success" },
  changed: { label: "Replaces", tone: "warning" },
  known: { label: "Already recorded", tone: "default" },
};

/** Neighbour-table import: which port goes to which (SDS Doc 24). */
export function ConnectionImport() {
  const { toast } = useToast();
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<LinkImportPreview | null>(null);
  const [removeStale, setRemoveStale] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [result, setResult] = useState<LinkImportResult | null>(null);

  const counts = useMemo(() => {
    const c = { new: 0, changed: 0, known: 0, loops: 0 };
    for (const row of preview?.links ?? []) {
      c[row.outcome] += 1;
      if (row.loop) c.loops += 1;
    }
    return c;
  }, [preview]);

  const unmatchedByType = useMemo(() => {
    const groups = new Map<string, number>();
    for (const entry of preview?.unmatched ?? []) {
      const type = entry.side === "device" ? "Devices in the file's first column" : entry.type ?? "Unknown type";
      groups.set(type, (groups.get(type) ?? 0) + 1);
    }
    return [...groups.entries()].sort((a, b) => b[1] - a[1]);
  }, [preview]);

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
      const response = await previewLinkImportAction(data);
      if (!response.ok) {
        setFileError(response.fieldErrors?.file ?? response.error);
        return;
      }
      setPreview(response.data);
      setRemoveStale(false);
      setFilter("all");
    } finally {
      setBusy(false);
    }
  }

  async function runImport() {
    if (!file) return;
    setBusy(true);
    try {
      const data = new FormData();
      data.set("file", file);
      data.set("removeStale", String(removeStale));
      const response = await commitLinkImportAction(data);
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
  }

  if (result) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><CheckCircle2 className="h-5 w-5 text-success" /> Connections imported</CardTitle>
          <CardDescription>
            {result.created} cable{result.created === 1 ? "" : "s"} added, {result.confirmed} confirmed as still there
            {result.replaced > 0 ? `, ${result.replaced} old record${result.replaced === 1 ? "" : "s"} replaced` : ""}
            {result.removed > 0 ? `, ${result.removed} removed` : ""}.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Link href="/infrastructure/topology" className={buttonVariants()}>Open the topology</Link>
          <Button variant="ghost" onClick={startOver}>Import another file</Button>
        </CardContent>
      </Card>
    );
  }

  if (!preview) {
    return (
      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>Choose a neighbour table</CardTitle>
          <CardDescription>
            One row per cable a switch sees: the switch, its port, the neighbour and the neighbour&rsquo;s port. The Neighbours sheet of the
            discovery workbook works as it is. Import the devices first; cables are only recorded between devices in the register.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div>
            <Label htmlFor="links-file" required>File</Label>
            <label
              htmlFor="links-file"
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
              id="links-file"
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
              Columns are matched by their headings: Switch or Device, Local port, Neighbour or Connected to, Neighbour port, and
              optionally Switch IP, Neighbour IP and Neighbour type. Names are matched first, then IP addresses.
            </HelperText>
          </div>
          <Button onClick={readFile} loading={busy}><Upload className="h-4 w-4" /> Read file</Button>
        </CardContent>
      </Card>
    );
  }

  const shown = preview.links.filter((row) => filter === "all" || row.outcome === filter);
  const toWrite = counts.new + counts.changed;

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle>{preview.fileName}</CardTitle>
          <CardDescription>
            Sheet &ldquo;{preview.sheetName}&rdquo;, headings on row {preview.headerRow}, {preview.totalRows} rows, {preview.links.length} cables between
            devices in the register.
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
          {counts.loops > 0 ? (
            <p className="flex items-start gap-2 rounded-xl border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs">
              <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />
              {counts.loops} cable{counts.loops === 1 ? " goes" : "s go"} from a switch back to itself. They are recorded and shown in red on the map.
            </p>
          ) : null}
          {preview.unmatched.length > 0 ? (
            <details className="rounded-xl border px-3 py-2">
              <summary className="cursor-pointer">
                {preview.unmatched.length} name{preview.unmatched.length === 1 ? " is" : "s are"} not in the register, so their cables are left out
                <span className="text-muted-foreground"> ({unmatchedByType.map(([type, n]) => `${n} ${type.toLowerCase()}`).join(", ")})</span>
              </summary>
              <ul className="mt-2 grid max-h-64 gap-x-6 gap-y-1 overflow-y-auto text-xs sm:grid-cols-2">
                {preview.unmatched.map((entry) => (
                  <li key={`${entry.side}|${entry.name}`} className="flex justify-between gap-2">
                    <span className="truncate font-medium">{entry.name}</span>
                    <span className="shrink-0 text-muted-foreground">
                      {entry.side === "device" ? "device column" : entry.type ?? "neighbour"}{entry.count > 1 ? ` · ${entry.count} rows` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
          {preview.stale.length > 0 ? (
            <label className="flex items-start gap-2 rounded-xl border px-3 py-2">
              <input type="checkbox" className="mt-0.5" checked={removeStale} onChange={(e) => setRemoveStale(e.target.checked)} />
              <span>
                Remove {preview.stale.length} imported cable{preview.stale.length === 1 ? "" : "s"} this file no longer shows
                <span className="block text-xs text-muted-foreground">
                  Only cables from an earlier import, on switches whose table is in this file. Cables added by hand are never removed.
                </span>
                <details className="mt-1 text-xs text-muted-foreground">
                  <summary className="cursor-pointer">Which ones</summary>
                  <ul className="mt-1 space-y-0.5">{preview.stale.map((s) => <li key={s.id}>{s.description}</li>)}</ul>
                </details>
              </span>
            </label>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Show">
            {([["all", `All ${preview.links.length}`], ["new", `New ${counts.new}`], ["changed", `Replaces ${counts.changed}`], ["known", `Already recorded ${counts.known}`]] as const).map(
              ([value, label]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={filter === value}
                  onClick={() => setFilter(value)}
                  className={cn(
                    "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                    filter === value ? "bg-primary text-primary-foreground" : "border text-muted-foreground hover:text-foreground",
                  )}
                >
                  {label}
                </button>
              ),
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={startOver}><ArrowLeft className="h-4 w-4" /> Back</Button>
            <Button onClick={runImport} loading={busy} disabled={toWrite === 0 && !(removeStale && preview.stale.length > 0) && counts.known === 0}>
              {toWrite > 0 ? `Import ${toWrite} cable${toWrite === 1 ? "" : "s"}` : "Confirm cables"}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <THead>
              <TR><TH>Device</TH><TH>Port</TH><TH>Connects to</TH><TH>Its port</TH><TH>Seen from</TH><TH>Result</TH></TR>
            </THead>
            <TBody>
              {shown.length === 0 ? (
                <TR><TD colSpan={6} className="py-8 text-center text-muted-foreground">Nothing in this group.</TD></TR>
              ) : shown.map((row) => (
                <TR key={row.key}>
                  <TD className="font-medium">{row.a.name}</TD>
                  <TD className="font-mono text-xs">{row.portA ?? "?"}</TD>
                  <TD>{row.loop ? <span className="text-xs font-medium text-destructive">Back to itself</span> : row.b.name}</TD>
                  <TD className="font-mono text-xs">{row.portB ?? "?"}</TD>
                  <TD className="text-xs text-muted-foreground">{row.loop ? "Itself" : row.seenFromBothEnds ? "Both ends" : "One end"}</TD>
                  <TD>
                    <Badge variant={OUTCOME[row.outcome].tone}>{OUTCOME[row.outcome].label}</Badge>
                    {row.replaces.length > 0 ? <p className="mt-1 text-xs text-muted-foreground">{row.replaces.join("; ")}</p> : null}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
