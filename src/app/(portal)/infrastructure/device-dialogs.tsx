"use client";

import { useMemo, useState } from "react";
import { Pencil, Plus } from "lucide-react";
import {
  createDeviceAction,
  updateDeviceAction,
  setDeviceStatusAction,
  quickCreateManufacturerIdAction,
} from "@/modules/infrastructure/actions";
import { DEVICE_STATUSES, type AssetMode, type DeviceKind, type DeviceStatus } from "@/modules/infrastructure/validators";
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
  assetCategories: { id: string; name: string }[];
  /** Creating an asset needs the asset register's own right. */
  canCreateAssets: boolean;
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
  /** The linked asset, as "Name (TAG)". */
  assetLabel: string | null;
}

/** A category that looks like it is meant for this kind of device, to save a click. */
function likelyCategory(catalogs: DeviceCatalogs, kind: DeviceKind) {
  const pattern = kind === "NETWORK" ? /network|switch|router|firewall/i : /server|host/i;
  return catalogs.assetCategories.find((category) => pattern.test(category.name))?.id ?? "";
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
    // A new device gets its asset by default; an existing one keeps what it has.
    assetMode: (device ? "keep" : catalogs.canCreateAssets && catalogs.assetCategories.length > 0 ? "create" : "none") as AssetMode,
    assetCategoryId: likelyCategory(catalogs, kind),
    assetLookup: "",
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
    const payload = {
      ...form,
      applicationIds: isServer ? form.applicationIds : [],
      // "No asset" on a device that never had one changes nothing.
      assetMode: form.assetMode === "none" && !device?.assetLabel ? "keep" : form.assetMode,
    };
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
          <AssetChoice form={form} set={set} catalogs={catalogs} linked={device?.assetLabel ?? null} errors={fieldErrors} />
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={submit} loading={loading}>{device ? "Save changes" : `Add ${noun}`}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

type DeviceForm = ReturnType<typeof emptyForm>;

/** The asset part of the device form: create one, link one, or none. */
function AssetChoice({
  form,
  set,
  catalogs,
  linked,
  errors,
}: {
  form: DeviceForm;
  set: <K extends keyof DeviceForm>(key: K, value: DeviceForm[K]) => void;
  catalogs: DeviceCatalogs;
  linked: string | null;
  errors: Record<string, string | undefined>;
}) {
  const choices: { mode: AssetMode; label: string }[] = [
    ...(linked ? [{ mode: "keep" as const, label: "Keep it" }] : []),
    ...(catalogs.canCreateAssets ? [{ mode: "create" as const, label: "Create a new asset" }] : []),
    { mode: "link", label: linked ? "Link a different asset" : "Link an existing asset" },
    { mode: "none", label: linked ? "Unlink" : "No asset" },
  ];
  const mode = !linked && form.assetMode === "keep" ? "none" : form.assetMode;
  return (
    <fieldset className="rounded-xl border p-3 sm:col-span-2">
      <legend className="px-1 text-sm font-medium">Asset</legend>
      <p className="mb-2 text-xs text-muted-foreground">
        {linked ? <>Linked to <span className="font-medium text-foreground">{linked}</span>. </> : null}
        The asset register keeps the tag, purchase and warranty. This record keeps how it is wired and set up.
      </p>
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Asset">
        {choices.map((choice) => (
          <button
            key={choice.mode}
            type="button"
            role="radio"
            aria-checked={mode === choice.mode}
            onClick={() => set("assetMode", choice.mode)}
            className={
              mode === choice.mode
                ? "rounded-full border border-primary bg-primary/10 px-3 py-1 text-xs font-medium text-primary"
                : "rounded-full border px-3 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            }
          >
            {choice.label}
          </button>
        ))}
      </div>
      {mode === "create" ? (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="dev-asset-category" required>Asset category</Label>
            <Select id="dev-asset-category" value={form.assetCategoryId} onChange={(e) => set("assetCategoryId", e.target.value)}>
              <option value="" disabled>Select category</option>
              {catalogs.assetCategories.map((category) => (
                <option key={category.id} value={category.id}>{category.name}</option>
              ))}
            </Select>
            <FieldError message={errors.assetCategoryId} />
          </div>
          <div>
            <Label htmlFor="dev-asset-tag">Asset tag</Label>
            <Input id="dev-asset-tag" value={form.assetLookup} onChange={(e) => set("assetLookup", e.target.value)} />
            <HelperText>Optional. Name, serial, model and location are taken from this form.</HelperText>
            <FieldError message={errors.assetLookup} />
          </div>
        </div>
      ) : mode === "link" ? (
        <div className="mt-3">
          <Label htmlFor="dev-asset-lookup" required>Asset tag, serial number or name</Label>
          <Input id="dev-asset-lookup" value={form.assetLookup} onChange={(e) => set("assetLookup", e.target.value)} />
          <FieldError message={errors.assetLookup} />
        </div>
      ) : null}
    </fieldset>
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
