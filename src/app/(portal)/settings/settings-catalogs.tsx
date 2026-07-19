"use client";

import { useState } from "react";
import { Plus, Power, Upload } from "lucide-react";
import {
  createCatalogItemAction,
  setCatalogItemActiveAction,
  uploadBrandingLogoAction,
} from "@/modules/settings/actions";
import { setAssetCategoryActiveAction } from "@/modules/assets/actions";
import { setSettingTimezoneAction } from "@/modules/settings/general-actions";
import { useAction } from "@/shared/ui/use-action";
import { Button } from "@/shared/ui/button";
import { Input, Select, Label, HelperText } from "@/shared/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/shared/ui/card";

export interface CatalogEntry {
  id: string;
  name: string;
  parentId: string | null;
  isActive: boolean;
}

/** Generic catalog list manager (manufacturers, models, suppliers, vendors, contract categories). */
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
              placeholder={`New ${title.toLowerCase().replace(/s$/, "")}`}
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
          <ul className="flex flex-wrap gap-1.5">
            {items.map((item) => {
              const parent = manufacturers?.find((manufacturer) => manufacturer.id === item.parentId);
              return (
                <li
                  key={item.id}
                  className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs ${item.isActive ? "" : "opacity-50"}`}
                >
                  {parent ? <span className="text-muted-foreground">{parent.name} ·</span> : null}
                  {item.name}
                  <button
                    type="button"
                    aria-label={item.isActive ? `Disable ${item.name}` : `Enable ${item.name}`}
                    title={item.isActive ? "Disable" : "Enable"}
                    className="text-muted-foreground hover:text-foreground"
                    onClick={() =>
                      run(() => setCatalogItemActiveAction(item.id, !item.isActive), {
                        successMessage: item.isActive ? "Disabled." : "Enabled.",
                      })
                    }
                  >
                    <Power className={`h-3 w-3 ${item.isActive ? "text-success" : ""}`} />
                  </button>
                </li>
              );
            })}
          </ul>
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
        <CardTitle>Logo</CardTitle>
        <CardDescription>
          Shown on the login page and public request forms. PNG, JPG, SVG or WEBP up to 2 MB.
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

export function TimezoneForm({ current, timezones }: { current: string; timezones: string[] }) {
  const { run, loading } = useAction();
  const [timezone, setTimezone] = useState(current);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Regional settings</CardTitle>
        <CardDescription>The default timezone applies platform-wide.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-end gap-2">
          <div className="w-72">
            <Label htmlFor="general-timezone">Default timezone</Label>
            <Select id="general-timezone" value={timezone} onChange={(event) => setTimezone(event.target.value)}>
              {timezones.map((zone) => (
                <option key={zone} value={zone}>{zone}</option>
              ))}
            </Select>
            <HelperText>All timestamps are stored in UTC; this controls display defaults.</HelperText>
          </div>
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
