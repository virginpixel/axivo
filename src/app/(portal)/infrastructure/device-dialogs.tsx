"use client";

import { useMemo, useState } from "react";
import { Pencil, Plus } from "lucide-react";
import {
  createDeviceAction,
  updateDeviceAction,
  setDeviceStatusAction,
  quickCreateManufacturerIdAction,
} from "@/modules/infrastructure/actions";
import { DEVICE_STATUSES, type DeviceKind, type DeviceStatus } from "@/modules/infrastructure/validators";
import { useAction } from "@/shared/ui/use-action";
import { useToast } from "@/shared/ui/toast";
import { Button } from "@/shared/ui/button";
import { Input, Select, Textarea, Label, FieldError, HelperText } from "@/shared/ui/input";
import { Combobox } from "@/shared/ui/combobox";
import { MultiSelect } from "@/shared/ui/multi-select";
import { Dialog, DialogContent, DialogTrigger } from "@/shared/ui/dialog";
import { enumLabel } from "@/shared/utils";

export interface DeviceCatalogs {
  companies: { id: string; name: string }[];
  types: { id: string; name: string; kind: string; isActive: boolean }[];
  locations: { id: string; companyId: string; label: string }[];
  manufacturers: { id: string; name: string }[];
  hosts: { id: string; name: string; companyId: string }[];
  applications: { id: string; name: string; companyId: string; isShared: boolean }[];
}

export interface DeviceRecord {
  id: string;
  companyId: string;
  typeId: string;
  name: string;
  hostname: string | null;
  ipAddress: string | null;
  locationId: string | null;
  manufacturerId: string | null;
  model: string | null;
  serialNumber: string | null;
  operatingSystem: string | null;
  version: string | null;
  domain: string | null;
  purpose: string | null;
  status: DeviceStatus;
  hostDeviceId: string | null;
  notes: string | null;
  applicationIds: string[];
}

function emptyForm(kind: DeviceKind, catalogs: DeviceCatalogs, device?: DeviceRecord) {
  const firstType = catalogs.types.find((type) => type.kind === kind && type.isActive);
  return {
    companyId: device?.companyId ?? (catalogs.companies.length === 1 ? catalogs.companies[0]!.id : ""),
    typeId: device?.typeId ?? firstType?.id ?? "",
    name: device?.name ?? "",
    hostname: device?.hostname ?? "",
    ipAddress: device?.ipAddress ?? "",
    locationId: device?.locationId ?? "",
    manufacturerId: device?.manufacturerId ?? "",
    model: device?.model ?? "",
    serialNumber: device?.serialNumber ?? "",
    operatingSystem: device?.operatingSystem ?? "",
    version: device?.version ?? "",
    domain: device?.domain ?? "",
    purpose: device?.purpose ?? "",
    status: device?.status ?? ("ACTIVE" as DeviceStatus),
    hostDeviceId: device?.hostDeviceId ?? "",
    notes: device?.notes ?? "",
    applicationIds: device?.applicationIds ?? [],
  };
}

export function DeviceDialog({
  kind,
  catalogs,
  device,
  trigger = "icon",
}: {
  kind: DeviceKind;
  catalogs: DeviceCatalogs;
  device?: DeviceRecord;
  trigger?: "icon" | "button";
}) {
  const { run, loading, fieldErrors } = useAction();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(() => emptyForm(kind, catalogs, device));
  const [manufacturers, setManufacturers] = useState(catalogs.manufacturers);
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm((prev) => ({ ...prev, [key]: value }));
  const isServer = kind === "SERVER";
  const noun = isServer ? "server" : "network device";

  const types = catalogs.types.filter((type) => type.kind === kind && (type.isActive || type.id === form.typeId));
  const locations = useMemo(() => catalogs.locations.filter((l) => l.companyId === form.companyId), [catalogs.locations, form.companyId]);
  const hosts = catalogs.hosts.filter((h) => h.companyId === form.companyId && h.id !== device?.id);
  const applications = catalogs.applications.filter((a) => a.companyId === form.companyId || a.isShared);

  function onOpenChange(next: boolean) {
    // Reopening starts from the record as saved, not from an abandoned edit.
    if (next) setForm(emptyForm(kind, catalogs, device));
    setOpen(next);
  }

  async function submit() {
    const payload = { ...form, applicationIds: isServer ? form.applicationIds : [] };
    await run(() => (device ? updateDeviceAction(device.id, payload) : createDeviceAction(payload)), {
      successMessage: device ? "Saved." : `Added the ${noun}.`,
      onSuccess: () => setOpen(false),
    });
  }

  async function createManufacturer(label: string) {
    const result = await quickCreateManufacturerIdAction(label);
    if (!result.ok) {
      toast("error", result.error);
      return null;
    }
    setManufacturers((prev) => (prev.some((m) => m.id === result.data.value) ? prev : [...prev, { id: result.data.value, name: result.data.label }]));
    return result.data;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        {device ? (
          trigger === "button" ? (
            <Button variant="outline" size="sm"><Pencil className="h-4 w-4" /> Edit</Button>
          ) : (
            <Button variant="ghost" size="icon" aria-label={`Edit ${device.name}`}><Pencil className="h-4 w-4" /></Button>
          )
        ) : (
          <Button size="sm"><Plus className="h-4 w-4" /> Add {noun}</Button>
        )}
      </DialogTrigger>
      <DialogContent title={device ? `Edit ${device.name}` : `Add ${noun}`} wide>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="dev-company" required>Company</Label>
            <Combobox
              id="dev-company"
              value={form.companyId}
              disabled={!!device}
              placeholder="Select company"
              options={catalogs.companies.map((c) => ({ value: c.id, label: c.name }))}
              onChange={(value) => setForm((prev) => ({ ...prev, companyId: value, locationId: "", hostDeviceId: "", applicationIds: [] }))}
            />
            <FieldError message={fieldErrors.companyId} />
          </div>
          <div>
            <Label htmlFor="dev-type" required>Device type</Label>
            <Select id="dev-type" value={form.typeId} onChange={(e) => set("typeId", e.target.value)}>
              <option value="" disabled>Select type</option>
              {types.map((type) => (
                <option key={type.id} value={type.id}>{type.name}{type.isActive ? "" : " (inactive)"}</option>
              ))}
            </Select>
            <FieldError message={fieldErrors.typeId} />
          </div>
          <div>
            <Label htmlFor="dev-name" required>Name</Label>
            <Input id="dev-name" value={form.name} onChange={(e) => set("name", e.target.value)} />
            <FieldError message={fieldErrors.name} />
          </div>
          <div>
            <Label htmlFor="dev-hostname">Hostname</Label>
            <Input id="dev-hostname" value={form.hostname} onChange={(e) => set("hostname", e.target.value)} />
            <HelperText>The DNS name, if it differs from the name above.</HelperText>
            <FieldError message={fieldErrors.hostname} />
          </div>
          <div>
            <Label htmlFor="dev-ip">IP address</Label>
            <Input id="dev-ip" inputMode="decimal" value={form.ipAddress} onChange={(e) => set("ipAddress", e.target.value)} />
            <FieldError message={fieldErrors.ipAddress} />
          </div>
          <div>
            <Label htmlFor="dev-status" required>Status</Label>
            <Select id="dev-status" value={form.status} onChange={(e) => set("status", e.target.value as DeviceStatus)}>
              {DEVICE_STATUSES.map((status) => (
                <option key={status} value={status}>{enumLabel(status)}</option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="dev-location">Location</Label>
            <Combobox
              id="dev-location"
              value={form.locationId}
              disabled={!form.companyId}
              placeholder={form.companyId ? "Select location" : "Choose the company first"}
              emptyLabel="No location"
              options={locations.map((l) => ({ value: l.id, label: l.label }))}
              onChange={(value) => set("locationId", value)}
            />
            <FieldError message={fieldErrors.locationId} />
          </div>
          <div>
            <Label htmlFor="dev-manufacturer">Manufacturer</Label>
            <Combobox
              id="dev-manufacturer"
              value={form.manufacturerId}
              placeholder="Select manufacturer"
              emptyLabel="None"
              options={manufacturers.map((m) => ({ value: m.id, label: m.name }))}
              onChange={(value) => set("manufacturerId", value)}
              onCreate={createManufacturer}
              createNoun="manufacturer"
            />
            <FieldError message={fieldErrors.manufacturerId} />
          </div>
          <div>
            <Label htmlFor="dev-model">Model</Label>
            <Input id="dev-model" value={form.model} onChange={(e) => set("model", e.target.value)} />
          </div>
          <div>
            <Label htmlFor="dev-serial">Serial number</Label>
            <Input id="dev-serial" value={form.serialNumber} onChange={(e) => set("serialNumber", e.target.value)} />
          </div>
          <div>
            <Label htmlFor="dev-os">Operating system</Label>
            <Input id="dev-os" value={form.operatingSystem} onChange={(e) => set("operatingSystem", e.target.value)} />
          </div>
          <div>
            <Label htmlFor="dev-version">{isServer ? "Version" : "Firmware"}</Label>
            <Input id="dev-version" value={form.version} onChange={(e) => set("version", e.target.value)} />
          </div>
          {isServer ? (
            <>
              <div>
                <Label htmlFor="dev-domain">Domain</Label>
                <Input id="dev-domain" value={form.domain} onChange={(e) => set("domain", e.target.value)} />
              </div>
              <div>
                <Label htmlFor="dev-host">Runs on</Label>
                <Combobox
                  id="dev-host"
                  value={form.hostDeviceId}
                  disabled={!form.companyId}
                  placeholder="Select the host"
                  emptyLabel="Not set"
                  options={hosts.map((h) => ({ value: h.id, label: h.name }))}
                  onChange={(value) => set("hostDeviceId", value)}
                />
                <HelperText>For a virtual machine: the server it runs on.</HelperText>
                <FieldError message={fieldErrors.hostDeviceId} />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="dev-apps">Applications on this server</Label>
                <MultiSelect
                  id="dev-apps"
                  values={form.applicationIds}
                  disabled={!form.companyId}
                  placeholder="Select applications"
                  options={applications.map((a) => ({ value: a.id, label: a.name }))}
                  onChange={(values) => set("applicationIds", values)}
                />
                <FieldError message={fieldErrors.applicationIds} />
              </div>
            </>
          ) : null}
          <div className="sm:col-span-2">
            <Label htmlFor="dev-purpose">Purpose</Label>
            <Input id="dev-purpose" value={form.purpose} onChange={(e) => set("purpose", e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="dev-notes">Notes</Label>
            <Textarea id="dev-notes" rows={3} value={form.notes} onChange={(e) => set("notes", e.target.value)} />
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={submit} loading={loading}>{device ? "Save changes" : `Add ${noun}`}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Status picker on the device page: Active, Standby, Decommissioned. */
export function DeviceStatusControl({ id, status }: { id: string; status: DeviceStatus }) {
  const { run, loading } = useAction();
  return (
    <Select
      aria-label="Device status"
      value={status}
      disabled={loading}
      className="h-9 w-44"
      onChange={(e) => {
        const next = e.target.value as DeviceStatus;
        void run(() => setDeviceStatusAction(id, next), { successMessage: `Status set to ${enumLabel(next).toLowerCase()}.` });
      }}
    >
      {DEVICE_STATUSES.map((value) => (
        <option key={value} value={value}>{enumLabel(value)}</option>
      ))}
    </Select>
  );
}
