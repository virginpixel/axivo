"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, FileSpreadsheet, TriangleAlert, Upload } from "lucide-react";
import { previewIpamImportAction, commitIpamImportAction } from "@/modules/infrastructure/actions";
import type { IpamImportPreview, IpamImportResult } from "@/modules/infrastructure/ipam";
import { useToast } from "@/shared/ui/toast";
import { Button, buttonVariants } from "@/shared/ui/button";
import { Label, FieldError, HelperText } from "@/shared/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/shared/ui/card";
import { SampleLink } from "@/shared/ui/sample-link";

/** VLAN plan and address list import (SDS Doc 24). */
export function IpamImport() {
  const { toast } = useToast();
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<IpamImportPreview | null>(null);
  const [result, setResult] = useState<IpamImportResult | null>(null);

  async function send(commit: boolean) {
    if (!file) {
      setFileError("Choose a file first.");
      return;
    }
    setFileError(undefined);
    setBusy(true);
    try {
      const data = new FormData();
      data.set("file", file);
      if (commit) {
        const response = await commitIpamImportAction(data);
        if (!response.ok) {
          toast("error", response.error);
          return;
        }
        setResult(response.data);
        router.refresh();
      } else {
        const response = await previewIpamImportAction(data);
        if (!response.ok) {
          setFileError(response.fieldErrors?.file ?? response.error);
          return;
        }
        setPreview(response.data);
      }
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
          <CardTitle className="flex items-center gap-2"><CheckCircle2 className="h-5 w-5 text-success" /> Imported</CardTitle>
          <CardDescription>
            {result.vlansCreated} VLANs added, {result.vlansRenamed} renamed; {result.subnetsCreated} subnets added,{" "}
            {result.subnetsUpdated} updated; {result.addressesCreated.toLocaleString()} addresses added, {result.addressesUpdated.toLocaleString()} updated.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Link href="/infrastructure/ip" className={buttonVariants()}>Open IP &amp; VLANs</Link>
          <Button variant="ghost" onClick={startOver}>Import another file</Button>
        </CardContent>
      </Card>
    );
  }

  if (!preview) {
    return (
      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>Choose a VLAN plan or an address list</CardTitle>
          <CardDescription>
            The discovery workbooks work as they are: &ldquo;2 VLANs and IP ranges&rdquo; (its VLAN plan sheet), then &ldquo;3 Live
            devices&rdquo;. Import the VLAN plan first: an address is only kept when it falls inside a known subnet, which also decides its
            company.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div>
            <Label htmlFor="ipam-file" required>File</Label>
            <label
              htmlFor="ipam-file"
              className="flex cursor-pointer items-center gap-3 rounded-2xl border border-dashed px-4 py-5 text-sm transition-colors hover:border-primary/40 hover:bg-accent/40"
            >
              <FileSpreadsheet className="h-6 w-6 shrink-0 text-muted-foreground" />
              <span className="min-w-0">
                <span className="block truncate font-medium">{file ? file.name : "Choose a spreadsheet"}</span>
                <span className="block text-xs text-muted-foreground">{file ? `${(file.size / 1024).toFixed(0)} KB` : ".xlsx or .csv"}</span>
              </span>
            </label>
            <input
              id="ipam-file"
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
              A plain sheet works too. For VLANs: VLAN, Name, Subnet (10.1.0.0/24, or Subnet and Mask), Gateway, DHCP relay, Site or
              Company, Status. For addresses: IP, DNS name, MAC, Vendor, Switch, Port.
            </HelperText>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={() => send(false)} loading={busy}><Upload className="h-4 w-4" /> Read file</Button>
            <SampleLink kind="vlans" label="VLAN plan sample" />
            <SampleLink kind="ip-addresses" label="Address list sample" />
          </div>
        </CardContent>
      </Card>
    );
  }

  const plan = preview.plan;
  const addresses = preview.addresses;
  const changes =
    (plan ? plan.vlansNew + plan.vlansRenamed.length + plan.subnetsNew + plan.subnetsChanged.length : 0) +
    (addresses ? addresses.new + addresses.updated : 0);

  return (
    <div className="space-y-5">
      {plan ? (
        <Card>
          <CardHeader>
            <CardTitle>VLAN plan</CardTitle>
            <CardDescription>Sheet &ldquo;{plan.sheet}&rdquo;, {plan.rows} rows.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Figure label="New VLANs" value={plan.vlansNew} />
              <Figure label="VLANs renamed" value={plan.vlansRenamed.length} />
              <Figure label="New subnets" value={plan.subnetsNew} />
              <Figure label="Subnets changed" value={plan.subnetsChanged.length} />
            </div>
            <p className="text-muted-foreground">
              {plan.vlansSame} VLANs and {plan.subnetsSame} subnets are already recorded as they are.
            </p>
            {plan.unmatched.length > 0 ? (
              <Warning>
                No company matches {plan.unmatched.map((u) => `"${u.text}" (${u.rows} rows)`).join(", ")}. Those rows are left out.
              </Warning>
            ) : null}
            {plan.vlansRenamed.length > 0 ? (
              <List title="Renamed to the file's name" items={plan.vlansRenamed.map((r) => `${r.company} VLAN ${r.number}: ${r.from} → ${r.to}`)} />
            ) : null}
            {plan.subnetsChanged.length > 0 ? (
              <List title="Subnets that change" items={plan.subnetsChanged.map((s) => `${s.company} ${s.cidr}: ${s.change}`)} />
            ) : null}
            {plan.problems.length > 0 ? (
              <List title="Rows left out" items={plan.problems.map((p) => `Row ${p.row}: ${p.error}`)} tone="warning" />
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {addresses ? (
        <Card>
          <CardHeader>
            <CardTitle>Addresses</CardTitle>
            <CardDescription>Sheet &ldquo;{addresses.sheet}&rdquo;, {addresses.rows.toLocaleString()} rows.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Figure label="New" value={addresses.new} />
              <Figure label="Updated" value={addresses.updated} />
              <Figure label="Linked to a device" value={addresses.devicesLinked} />
              <Figure label="Outside every subnet" value={addresses.noSubnet} />
            </div>
            <p className="text-muted-foreground">
              Discovery facts (name, MAC, vendor, switch and port) are taken from the file. Status and descriptions already typed in are kept.
              {addresses.noSubnet > 0 ? " Addresses outside every known subnet are left out: add or import the subnet first." : ""}
            </p>
          </CardContent>
        </Card>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button onClick={() => send(true)} loading={busy} disabled={changes === 0}>
          {changes === 0 ? "Nothing to change" : "Import"}
        </Button>
        <Button variant="ghost" onClick={startOver}>Choose another file</Button>
      </div>
    </div>
  );
}

function Figure({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-display text-2xl tabular-nums">{value.toLocaleString()}</p>
    </div>
  );
}

function Warning({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex gap-2 rounded-xl border border-warning/40 bg-warning/10 px-3 py-2">
      <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" /> <span>{children}</span>
    </p>
  );
}

function List({ title, items, tone }: { title: string; items: string[]; tone?: "warning" }) {
  return (
    <details className={tone === "warning" ? "rounded-xl border border-warning/40 px-3 py-2" : "rounded-xl border px-3 py-2"}>
      <summary className="cursor-pointer font-medium">{title} ({items.length})</summary>
      <ul className="mt-2 max-h-60 space-y-1 overflow-auto text-xs">
        {items.map((item, index) => <li key={index}>{item}</li>)}
      </ul>
    </details>
  );
}
