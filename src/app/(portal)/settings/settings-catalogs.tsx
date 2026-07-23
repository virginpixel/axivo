"use client";

import { useMemo, useState } from "react";
import { Plus, Power, Upload } from "lucide-react";
import {
  createCatalogItemAction,
  setCatalogItemActiveAction,
  updateCatalogItemAction,
  deleteCatalogItemAction,
  uploadBrandingLogoAction,
  uploadGeneratedLogoAction,
  removeGeneratedLogoAction,
  uploadRequestFormLogoAction,
  removeRequestFormLogoAction,
} from "@/modules/settings/actions";
import { Trash2, Pencil } from "lucide-react";
import { setAssetCategoryActiveAction } from "@/modules/assets/actions";
import { setSettingTimezoneAction, setPublicBaseUrlAction } from "@/modules/settings/general-actions";
import { useAction } from "@/shared/ui/use-action";
import type { ActionResult } from "@/shared/errors";
import { Button } from "@/shared/ui/button";
import { Input, Select, Label, HelperText } from "@/shared/ui/input";
import { Combobox } from "@/shared/ui/combobox";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/shared/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/shared/ui/table";

/** Build a "GMT +5 Karachi" style label for a IANA timezone id. */
function timezoneOption(zone: string): { value: string; label: string; offsetMinutes: number } {
  try {
    const now = new Date();
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: zone, timeZoneName: "shortOffset" }).formatToParts(now);
    const raw = parts.find((part) => part.type === "timeZoneName")?.value ?? "GMT";
    // raw looks like "GMT+5" / "GMT-3:30" / "GMT"; normalise to "GMT +5".
    const match = raw.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
    let offsetMinutes = 0;
    let pretty = "GMT ±0";
    if (match) {
      const sign = match[1] === "-" ? -1 : 1;
      const hours = Number(match[2]);
      const minutes = Number(match[3] ?? "0");
      offsetMinutes = sign * (hours * 60 + minutes);
      pretty = `GMT ${match[1]}${hours}${match[3] ? `:${match[3]}` : ""}`;
    }
    const city = zone.split("/").pop()?.replace(/_/g, " ") ?? zone;
    return { value: zone, label: `${pretty} ${city}`, offsetMinutes };
  } catch {
    return { value: zone, label: zone, offsetMinutes: 0 };
  }
}

export interface CatalogEntry {
  id: string;
  name: string;
  parentId: string | null;
  isActive: boolean;
}

/** Generic catalog list manager (manufacturers, models, suppliers, vendors, contract categories). */
/** Turn a plural section title into a singular noun for placeholders. */
function singularize(title: string): string {
  if (/ies$/i.test(title)) return title.replace(/ies$/i, "y");
  if (/ses$/i.test(title)) return title.replace(/es$/i, "");
  if (/s$/i.test(title)) return title.replace(/s$/i, "");
  return title;
}

export function CatalogSection({
  kind,
  title,
  description,
  items,
  manufacturers,
}: {
  kind: string;
  title: string;
  description: string;
  items: CatalogEntry[];
  /** Present only for ASSET_MODEL: parent manufacturer options. */
  manufacturers?: CatalogEntry[];
}) {
  const { run, loading } = useAction();
  const [name, setName] = useState("");
  const [parentId, setParentId] = useState("");

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-end gap-2">
          {kind === "ASSET_MODEL" ? (
            <div className="w-52">
              <Label htmlFor={`catalog-parent-${kind}`} required>Manufacturer</Label>
              <Select
                id={`catalog-parent-${kind}`}
                value={parentId}
                onChange={(event) => setParentId(event.target.value)}
              >
                <option value="">Select…</option>
                {(manufacturers ?? []).filter((m) => m.isActive).map((manufacturer) => (
                  <option key={manufacturer.id} value={manufacturer.id}>{manufacturer.name}</option>
                ))}
              </Select>
            </div>
          ) : null}
          <div className="w-64">
            <Label htmlFor={`catalog-name-${kind}`} required>Name</Label>
            <Input
              id={`catalog-name-${kind}`}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={`New ${singularize(title).toLowerCase()}`}
            />
          </div>
          <Button
            size="sm"
            loading={loading}
            disabled={!name.trim() || (kind === "ASSET_MODEL" && !parentId)}
            onClick={() =>
              run(
                () =>
                  createCatalogItemAction({
                    kind,
                    name: name.trim(),
                    parentId: parentId || undefined,
                  }),
                { successMessage: `${title.replace(/s$/, "")} added.`, onSuccess: () => setName("") },
              )
            }
          >
            <Plus className="h-4 w-4" /> Add
          </Button>
        </div>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing added yet.</p>
        ) : (
          <Table>
            <THead>
              <TR>
                {manufacturers ? <TH>Manufacturer</TH> : null}
                <TH>Name</TH>
                <TH>Status</TH>
                <TH className="text-right">Actions</TH>
              </TR>
            </THead>
            <TBody>
              {items.map((item) => {
                const parent = manufacturers?.find((manufacturer) => manufacturer.id === item.parentId);
                return (
                  <TR key={item.id} className={item.isActive ? "" : "opacity-60"}>
                    {manufacturers ? <TD>{parent?.name ?? "None"}</TD> : null}
                    <TD className="font-medium">{item.name}</TD>
                    <TD>{item.isActive ? "Active" : "Inactive"}</TD>
                    <TD className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Rename ${item.name}`}
                          title="Rename"
                          onClick={() => {
                            const next = window.prompt(`Rename "${item.name}" to:`, item.name);
                            if (!next || next.trim() === item.name) return;
                            run(() => updateCatalogItemAction(item.id, next.trim()), { successMessage: "Renamed." });
                          }}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={item.isActive ? `Disable ${item.name}` : `Enable ${item.name}`}
                          title={item.isActive ? "Disable" : "Enable"}
                          onClick={() =>
                            run(() => setCatalogItemActiveAction(item.id, !item.isActive), {
                              successMessage: item.isActive ? "Disabled." : "Enabled.",
                            })
                          }
                        >
                          <Power className={`h-4 w-4 ${item.isActive ? "text-success" : "text-muted-foreground"}`} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Delete ${item.name}`}
                          title="Delete"
                          onClick={() => {
                            if (!window.confirm(`Delete "${item.name}"? Entries still in use cannot be deleted.`)) return;
                            run(() => deleteCatalogItemAction(item.id), { successMessage: "Deleted." });
                          }}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

export function LogoUploadForm({ hasLogo }: { hasLogo: boolean }) {
  const { run, loading } = useAction();
  const [file, setFile] = useState<File | null>(null);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Login page logo</CardTitle>
        <CardDescription>
          Shown on the sign-in screen. PNG, JPG, SVG or WEBP up to 2 MB. Request forms use their own logos below.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {hasLogo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src="/api/branding/logo" alt="Current logo" className="max-h-16 w-auto rounded border bg-white p-1" />
        ) : (
          <p className="text-sm text-muted-foreground">No logo uploaded yet.</p>
        )}
        <div className="flex items-end gap-2">
          <div className="w-72">
            <Label htmlFor="logo-file">Logo image</Label>
            <Input
              id="logo-file"
              type="file"
              accept="image/png,image/jpeg,image/svg+xml,image/webp"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            />
          </div>
          <Button
            size="sm"
            loading={loading}
            disabled={!file}
            onClick={() => {
              if (!file) return;
              const data = new FormData();
              data.set("file", file);
              void run(() => uploadBrandingLogoAction(data), { successMessage: "Logo updated." });
            }}
          >
            <Upload className="h-4 w-4" /> Upload logo
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function AssetCategoryToggle({ id, isActive }: { id: string; isActive: boolean }) {
  const { run, loading } = useAction();
  return (
    <Button
      variant="ghost"
      size="icon"
      loading={loading}
      aria-label={isActive ? "Disable category" : "Enable category"}
      title={isActive ? "Disable" : "Enable"}
      onClick={() =>
        run(() => setAssetCategoryActiveAction(id, !isActive), {
          successMessage: isActive ? "Category disabled." : "Category enabled.",
        })
      }
    >
      <Power className={`h-4 w-4 ${isActive ? "text-success" : "text-muted-foreground"}`} />
    </Button>
  );
}

/** Public base URL used for links in emails and public request forms. */
export function PublicBaseUrlForm({ current, envValue }: { current: string; envValue: string }) {
  const { run, loading } = useAction();
  const [value, setValue] = useState(current);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Public base URL</CardTitle>
        <CardDescription>
          The address people reach Axivo on. Used for links in emails and for public request form links.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="max-w-md">
          <Label htmlFor="public-base-url">Base URL</Label>
          <Input
            id="public-base-url"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder={envValue || "http://127.0.0.1:8080"}
          />
          <HelperText>
            Include the protocol and port, for example http://127.0.0.1:8080. Leave as configured to keep using the
            deployment default ({envValue || "not set"}).
          </HelperText>
        </div>
        <div className="mt-4 flex justify-start">
          <Button
            size="sm"
            loading={loading}
            disabled={!value.trim() || value.trim() === current}
            onClick={() => run(() => setPublicBaseUrlAction(value.trim()), { successMessage: "Public base URL saved." })}
          >
            Save base URL
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/** Upload the three logos (left/center/right) stamped on generated PDFs. */
export function GeneratedLogosForm({ present }: { present: { left: boolean; center: boolean; right: boolean } }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Generated document logos</CardTitle>
        <CardDescription>Shown in the header of generated PDFs such as asset handover and clearance forms.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 sm:grid-cols-3">
          {(["left", "center", "right"] as const).map((position) => (
            <LogoSlot
              key={position}
              position={position}
              hasLogo={present[position]}
              src={`/api/branding/generated-logo/${position}`}
              accept="image/png,image/jpeg"
              onUpload={(data) => uploadGeneratedLogoAction(position, data)}
              onRemove={() => removeGeneratedLogoAction(position)}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

/** Upload the three logos shown across the header of every public request form. */
export function RequestFormLogosForm({ present }: { present: { left: boolean; center: boolean; right: boolean } }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Request form logos</CardTitle>
        <CardDescription>
          Shown across the top of every public request form (left, center, right). Set once here rather than per form.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 sm:grid-cols-3">
          {(["left", "center", "right"] as const).map((position) => (
            <LogoSlot
              key={position}
              position={position}
              hasLogo={present[position]}
              src={`/api/branding/form-logo/${position}`}
              accept="image/png,image/jpeg,image/webp,image/svg+xml"
              onUpload={(data) => uploadRequestFormLogoAction(position, data)}
              onRemove={() => removeRequestFormLogoAction(position)}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function LogoSlot({
  position,
  hasLogo,
  src,
  accept,
  onUpload,
  onRemove,
}: {
  position: "left" | "center" | "right";
  hasLogo: boolean;
  src: string;
  accept: string;
  onUpload: (data: FormData) => Promise<ActionResult<undefined>>;
  onRemove: () => Promise<ActionResult<undefined>>;
}) {
  const { run, loading } = useAction();
  function onFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const data = new FormData();
    data.set("file", file);
    run(() => onUpload(data), { successMessage: "Logo saved." });
    event.target.value = "";
  }
  return (
    <div className="rounded-md border p-3">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{position}</p>
      <div className="mb-2 flex h-16 items-center justify-center rounded bg-muted/40">
        {hasLogo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt={`${position} logo`} className="max-h-14 max-w-full object-contain" />
        ) : (
          <span className="text-xs text-muted-foreground">No logo</span>
        )}
      </div>
      <div className="flex items-center gap-2">
        <label className="inline-flex cursor-pointer items-center gap-1 rounded-md border bg-card px-2.5 py-1.5 text-xs hover:bg-accent">
          <Upload className="h-3.5 w-3.5" /> {hasLogo ? "Replace" : "Upload"}
          <input type="file" accept={accept} className="hidden" onChange={onFile} disabled={loading} />
        </label>
        {hasLogo ? (
          <Button variant="ghost" size="icon" loading={loading} aria-label="Remove logo" title="Remove"
            onClick={() => run(() => onRemove(), { successMessage: "Logo removed." })}>
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        ) : null}
      </div>
    </div>
  );
}

export function TimezoneForm({ current, timezones }: { current: string; timezones: string[] }) {
  const { run, loading } = useAction();
  const [timezone, setTimezone] = useState(current);

  const options = useMemo(() => {
    const list = timezones.includes(current) ? timezones : [current, ...timezones];
    return list
      .map(timezoneOption)
      .sort((a, b) => a.offsetMinutes - b.offsetMinutes || a.label.localeCompare(b.label))
      .map(({ value, label }) => ({ value, label }));
  }, [timezones, current]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Regional settings</CardTitle>
        <CardDescription>The default timezone applies platform-wide.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="w-full max-w-sm">
          <Label htmlFor="general-timezone">Default timezone</Label>
          <Combobox
            id="general-timezone"
            value={timezone}
            options={options}
            onChange={setTimezone}
            placeholder="Select timezone…"
          />
          <HelperText>All timestamps are stored in UTC; this controls display defaults.</HelperText>
        </div>
        <div className="mt-4 flex justify-start">
          <Button
            size="sm"
            loading={loading}
            onClick={() => run(() => setSettingTimezoneAction(timezone), { successMessage: "Timezone saved." })}
          >
            Save timezone
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
