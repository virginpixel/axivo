"use client";

import { useState } from "react";
import { Pencil, Plus } from "lucide-react";
import { saveVlanAction, saveSubnetAction, saveIpAddressAction } from "@/modules/infrastructure/actions";
import { IP_PLAN_STATUSES, IP_PLAN_STATUS_LABELS } from "@/modules/infrastructure/validators";
import { parseCidr, subnetFacts } from "@/modules/infrastructure/ip-math";
import { useAction } from "@/shared/ui/use-action";
import { Button } from "@/shared/ui/button";
import { Input, Select, Textarea, Label, FieldError, HelperText } from "@/shared/ui/input";
import { Combobox } from "@/shared/ui/combobox";
import { Dialog, DialogContent, DialogTrigger } from "@/shared/ui/dialog";

export interface IpCatalogs {
  companies: { id: string; name: string }[];
  vlans: { id: string; companyId: string; number: number; name: string }[];
  locations: { id: string; companyId: string; label: string }[];
  devices: { id: string; companyId: string; name: string; ipAddress: string | null }[];
}

type PlanStatus = (typeof IP_PLAN_STATUSES)[number];

function Trigger({ editing, label, noun }: { editing: boolean; label?: string; noun: string }) {
  return editing ? (
    <Button variant="ghost" size="icon" aria-label={label ?? `Edit ${noun}`}><Pencil className="h-4 w-4" /></Button>
  ) : (
    <Button size="sm" variant={noun === "VLAN" ? "outline" : "primary"}><Plus className="h-4 w-4" /> Add {noun}</Button>
  );
}

function CompanyField({
  catalogs, value, disabled, onChange, error,
}: { catalogs: IpCatalogs; value: string; disabled: boolean; onChange: (value: string) => void; error?: string }) {
  if (catalogs.companies.length === 1 && value) return null;
  return (
    <div>
      <Label htmlFor="ip-company" required>Company</Label>
      <Combobox
        id="ip-company"
        value={value}
        disabled={disabled}
        placeholder="Select company"
        options={catalogs.companies.map((c) => ({ value: c.id, label: c.name }))}
        onChange={onChange}
      />
      <FieldError message={error} />
    </div>
  );
}

const firstCompany = (catalogs: IpCatalogs) => (catalogs.companies.length === 1 ? catalogs.companies[0]!.id : "");

export function VlanDialog({
  catalogs,
  vlan,
}: {
  catalogs: IpCatalogs;
  vlan?: { id: string; companyId: string; number: number; name: string; purpose: string | null; status: PlanStatus; notes: string | null };
}) {
  const { run, loading, fieldErrors } = useAction();
  const [open, setOpen] = useState(false);
  const blank = () => ({
    companyId: vlan?.companyId ?? firstCompany(catalogs),
    number: vlan ? String(vlan.number) : "",
    name: vlan?.name ?? "",
    purpose: vlan?.purpose ?? "",
    status: vlan?.status ?? ("ACTIVE" as PlanStatus),
    notes: vlan?.notes ?? "",
  });
  const [form, setForm] = useState(blank);
  const set = <K extends keyof ReturnType<typeof blank>>(key: K, value: ReturnType<typeof blank>[K]) => setForm((p) => ({ ...p, [key]: value }));
  return (
    <Dialog open={open} onOpenChange={(next) => { if (next) setForm(blank()); setOpen(next); }}>
      <DialogTrigger asChild><span><Trigger editing={!!vlan} noun="VLAN" label={vlan ? `Edit VLAN ${vlan.number}` : undefined} /></span></DialogTrigger>
      <DialogContent title={vlan ? `Edit VLAN ${vlan.number}` : "Add VLAN"}>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <CompanyField catalogs={catalogs} value={form.companyId} disabled={!!vlan} onChange={(v) => set("companyId", v)} error={fieldErrors.companyId} />
          </div>
          <div>
            <Label htmlFor="vlan-number" required>VLAN ID</Label>
            <Input id="vlan-number" inputMode="numeric" value={form.number} onChange={(e) => set("number", e.target.value)} />
            <FieldError message={fieldErrors.number} />
          </div>
          <div>
            <Label htmlFor="vlan-name" required>Name</Label>
            <Input id="vlan-name" value={form.name} onChange={(e) => set("name", e.target.value)} />
            <FieldError message={fieldErrors.name} />
          </div>
          <div>
            <Label htmlFor="vlan-status">Status</Label>
            <Select id="vlan-status" value={form.status} onChange={(e) => set("status", e.target.value as PlanStatus)}>
              {IP_PLAN_STATUSES.map((s) => <option key={s} value={s}>{IP_PLAN_STATUS_LABELS[s]}</option>)}
            </Select>
          </div>
          <div>
            <Label htmlFor="vlan-purpose">Purpose</Label>
            <Input id="vlan-purpose" value={form.purpose} onChange={(e) => set("purpose", e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="vlan-notes">Notes</Label>
            <Textarea id="vlan-notes" rows={2} value={form.notes} onChange={(e) => set("notes", e.target.value)} />
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button
            loading={loading}
            onClick={() => run(() => saveVlanAction(vlan?.id ?? null, form), { successMessage: vlan ? "Saved." : "VLAN added.", onSuccess: () => setOpen(false) })}
          >
            {vlan ? "Save changes" : "Add VLAN"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function SubnetDialog({
  catalogs,
  subnet,
}: {
  catalogs: IpCatalogs;
  subnet?: {
    id: string; companyId: string; cidr: string; vlanId: string | null; gateway: string | null; dhcpRelay: string | null;
    locationId: string | null; purpose: string | null; status: PlanStatus; notes: string | null;
  };
}) {
  const { run, loading, fieldErrors } = useAction();
  const [open, setOpen] = useState(false);
  const blank = () => ({
    companyId: subnet?.companyId ?? firstCompany(catalogs),
    cidr: subnet?.cidr ?? "",
    vlanId: subnet?.vlanId ?? "",
    gateway: subnet?.gateway ?? "",
    dhcpRelay: subnet?.dhcpRelay ?? "",
    locationId: subnet?.locationId ?? "",
    purpose: subnet?.purpose ?? "",
    status: subnet?.status ?? ("ACTIVE" as PlanStatus),
    notes: subnet?.notes ?? "",
  });
  const [form, setForm] = useState(blank);
  const set = <K extends keyof ReturnType<typeof blank>>(key: K, value: ReturnType<typeof blank>[K]) => setForm((p) => ({ ...p, [key]: value }));
  const parsed = form.cidr.trim() ? parseCidr(form.cidr) : null;
  const facts = parsed?.ok ? subnetFacts(parsed.cidr.network, parsed.cidr.prefix) : null;
  const vlans = catalogs.vlans.filter((v) => v.companyId === form.companyId);
  const locations = catalogs.locations.filter((l) => l.companyId === form.companyId);
  return (
    <Dialog open={open} onOpenChange={(next) => { if (next) setForm(blank()); setOpen(next); }}>
      <DialogTrigger asChild>
        <span><Trigger editing={!!subnet} noun="subnet" /></span>
      </DialogTrigger>
      <DialogContent title={subnet ? `Edit ${subnet.cidr}` : "Add subnet"} wide>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <CompanyField
              catalogs={catalogs}
              value={form.companyId}
              disabled={!!subnet}
              onChange={(v) => setForm((p) => ({ ...p, companyId: v, vlanId: "", locationId: "" }))}
              error={fieldErrors.companyId}
            />
          </div>
          <div>
            <Label htmlFor="subnet-cidr" required>Subnet</Label>
            <Input id="subnet-cidr" placeholder="10.100.100.0/24" value={form.cidr} onChange={(e) => set("cidr", e.target.value)} />
            {facts ? (
              <HelperText>{facts.mask} · {facts.usable.toLocaleString()} usable · {facts.firstUsable} to {facts.lastUsable}</HelperText>
            ) : parsed && !parsed.ok ? (
              <FieldError message={parsed.error} />
            ) : null}
            <FieldError message={fieldErrors.cidr} />
          </div>
          <div>
            <Label htmlFor="subnet-vlan">VLAN</Label>
            <Combobox
              id="subnet-vlan"
              value={form.vlanId}
              disabled={!form.companyId}
              placeholder="Select VLAN"
              emptyLabel="No VLAN"
              options={vlans.map((v) => ({ value: v.id, label: `${v.number} · ${v.name}` }))}
              onChange={(v) => set("vlanId", v)}
            />
            <FieldError message={fieldErrors.vlanId} />
          </div>
          <div>
            <Label htmlFor="subnet-gateway">Gateway</Label>
            <Input id="subnet-gateway" value={form.gateway} onChange={(e) => set("gateway", e.target.value)} />
            <FieldError message={fieldErrors.gateway} />
          </div>
          <div>
            <Label htmlFor="subnet-relay">DHCP relay</Label>
            <Input id="subnet-relay" value={form.dhcpRelay} onChange={(e) => set("dhcpRelay", e.target.value)} />
          </div>
          <div>
            <Label htmlFor="subnet-location">Location</Label>
            <Combobox
              id="subnet-location"
              value={form.locationId}
              disabled={!form.companyId}
              placeholder="Select location"
              emptyLabel="No location"
              options={locations.map((l) => ({ value: l.id, label: l.label }))}
              onChange={(v) => set("locationId", v)}
            />
          </div>
          <div>
            <Label htmlFor="subnet-status">Status</Label>
            <Select id="subnet-status" value={form.status} onChange={(e) => set("status", e.target.value as PlanStatus)}>
              {IP_PLAN_STATUSES.map((s) => <option key={s} value={s}>{IP_PLAN_STATUS_LABELS[s]}</option>)}
            </Select>
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="subnet-purpose">Purpose</Label>
            <Input id="subnet-purpose" value={form.purpose} onChange={(e) => set("purpose", e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="subnet-notes">Notes</Label>
            <Textarea id="subnet-notes" rows={2} value={form.notes} onChange={(e) => set("notes", e.target.value)} />
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button
            loading={loading}
            onClick={() => run(() => saveSubnetAction(subnet?.id ?? null, form), { successMessage: subnet ? "Saved." : "Subnet added.", onSuccess: () => setOpen(false) })}
          >
            {subnet ? "Save changes" : "Add subnet"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function AddressDialog({
  catalogs,
  companyId,
  record,
  suggested,
  trigger = "button",
}: {
  catalogs: IpCatalogs;
  companyId: string;
  record?: { id: string; address: string; status: "USED" | "RESERVED"; hostname: string | null; macAddress: string | null; deviceId: string | null; description: string | null };
  /** The next free address, offered for a new record. */
  suggested?: string | null;
  trigger?: "button" | "icon" | "free";
}) {
  const { run, loading, fieldErrors } = useAction();
  const [open, setOpen] = useState(false);
  const blank = () => ({
    companyId,
    address: record?.address ?? suggested ?? "",
    status: record?.status ?? ("USED" as "USED" | "RESERVED"),
    hostname: record?.hostname ?? "",
    macAddress: record?.macAddress ?? "",
    deviceId: record?.deviceId ?? "",
    description: record?.description ?? "",
  });
  const [form, setForm] = useState(blank);
  const set = <K extends keyof ReturnType<typeof blank>>(key: K, value: ReturnType<typeof blank>[K]) => setForm((p) => ({ ...p, [key]: value }));
  const devices = catalogs.devices.filter((d) => d.companyId === companyId);
  return (
    <Dialog open={open} onOpenChange={(next) => { if (next) setForm(blank()); setOpen(next); }}>
      <DialogTrigger asChild>
        <span>
          {trigger === "icon" ? (
            <Button variant="ghost" size="icon" aria-label={`Edit ${record?.address ?? "address"}`}><Pencil className="h-4 w-4" /></Button>
          ) : trigger === "free" ? (
            <Button size="sm">Use {suggested}</Button>
          ) : (
            <Button size="sm" variant="outline"><Plus className="h-4 w-4" /> Record an address</Button>
          )}
        </span>
      </DialogTrigger>
      <DialogContent title={record ? `Edit ${record.address}` : "Record an address"}>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="ip-address" required>IP address</Label>
            <Input id="ip-address" value={form.address} onChange={(e) => set("address", e.target.value)} />
            <FieldError message={fieldErrors.address} />
          </div>
          <div>
            <Label htmlFor="ip-status">Status</Label>
            <Select id="ip-status" value={form.status} onChange={(e) => set("status", e.target.value as "USED" | "RESERVED")}>
              <option value="USED">Used</option>
              <option value="RESERVED">Reserved</option>
            </Select>
          </div>
          <div>
            <Label htmlFor="ip-hostname">Name</Label>
            <Input id="ip-hostname" value={form.hostname} onChange={(e) => set("hostname", e.target.value)} />
          </div>
          <div>
            <Label htmlFor="ip-mac">MAC address</Label>
            <Input id="ip-mac" value={form.macAddress} onChange={(e) => set("macAddress", e.target.value)} />
            <FieldError message={fieldErrors.macAddress} />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="ip-device">Device</Label>
            <Combobox
              id="ip-device"
              value={form.deviceId}
              placeholder="Select a device from the register"
              emptyLabel="None"
              options={devices.map((d) => ({ value: d.id, label: d.ipAddress ? `${d.name} (${d.ipAddress})` : d.name }))}
              onChange={(v) => set("deviceId", v)}
            />
            <FieldError message={fieldErrors.deviceId} />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="ip-description">Description</Label>
            <Input id="ip-description" value={form.description} onChange={(e) => set("description", e.target.value)} />
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button
            loading={loading}
            onClick={() => run(() => saveIpAddressAction(record?.id ?? null, form), { successMessage: record ? "Saved." : "Address recorded.", onSuccess: () => setOpen(false) })}
          >
            {record ? "Save changes" : "Record"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
