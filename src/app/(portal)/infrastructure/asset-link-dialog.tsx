"use client";

import { useState } from "react";
import { Boxes } from "lucide-react";
import { previewAssetLinksAction, commitAssetLinksAction } from "@/modules/infrastructure/actions";
import type { AssetLinkRow } from "@/modules/infrastructure/asset-link";
import type { DeviceKind } from "@/modules/infrastructure/validators";
import { useAction } from "@/shared/ui/use-action";
import { Button } from "@/shared/ui/button";
import { Label, Select, HelperText } from "@/shared/ui/input";
import { Badge } from "@/shared/ui/badge";
import { Dialog, DialogContent, DialogTrigger } from "@/shared/ui/dialog";

const ACTION_BADGE = {
  link: { label: "Link", variant: "success" },
  create: { label: "New asset", variant: "primary" },
  skip: { label: "Skipped", variant: "default" },
} as const;

/**
 * Link every device of the register that has no asset yet: to the asset with
 * the same serial number or name, or to a new one. Shows what would happen
 * first; nothing changes until it is confirmed.
 */
export function AssetLinkDialog({ kind, categories }: { kind: DeviceKind; categories: { id: string; name: string }[] }) {
  const { run, loading } = useAction();
  const [open, setOpen] = useState(false);
  const pattern = kind === "NETWORK" ? /network|switch|router|firewall/i : /server|host/i;
  const [categoryId, setCategoryId] = useState(() => categories.find((c) => pattern.test(c.name))?.id ?? "");
  const [rows, setRows] = useState<AssetLinkRow[] | null>(null);

  function onOpenChange(next: boolean) {
    if (next) setRows(null);
    setOpen(next);
  }

  async function check(nextCategory = categoryId) {
    await run(() => previewAssetLinksAction({ kind, categoryId: nextCategory || null }), { onSuccess: setRows });
  }

  async function commit() {
    await run(() => commitAssetLinksAction({ kind, categoryId: categoryId || null }), {
      successMessage: "Devices linked to their assets.",
      onSuccess: () => setOpen(false),
    });
  }

  const linking = rows?.filter((row) => row.action === "link").length ?? 0;
  const creating = rows?.filter((row) => row.action === "create").length ?? 0;
  const skipping = rows?.filter((row) => row.action === "skip").length ?? 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm"><Boxes className="h-4 w-4" /> Link to assets</Button>
      </DialogTrigger>
      <DialogContent
        title="Link devices to assets"
        description="For each device without an asset: the asset with the same serial number, or else the same name. Only the same company's assets are used."
        wide
      >
        <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
          <div>
            <Label htmlFor="asset-link-category">When no asset matches</Label>
            <Select
              id="asset-link-category"
              value={categoryId}
              onChange={(e) => {
                setCategoryId(e.target.value);
                if (rows) void check(e.target.value);
              }}
            >
              <option value="">Leave the device without an asset</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>Create one in {category.name}</option>
              ))}
            </Select>
            {categories.length === 0 ? <HelperText>Creating assets needs the right to manage assets.</HelperText> : null}
          </div>
          <Button variant="outline" onClick={() => check()} loading={loading && !rows}>Check</Button>
        </div>

        {rows ? (
          rows.length === 0 ? (
            <p className="mt-4 rounded-xl border bg-muted/40 px-3 py-2 text-sm">Every device here already has an asset.</p>
          ) : (
            <>
              <p className="mt-4 text-sm">
                <span className="font-medium">{linking}</span> to link,{" "}
                <span className="font-medium">{creating}</span> new asset{creating === 1 ? "" : "s"},{" "}
                <span className="font-medium">{skipping}</span> skipped.
              </p>
              <div className="mt-2 max-h-80 overflow-auto rounded-xl border">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-card text-left text-xs text-muted-foreground">
                    <tr className="border-b">
                      <th className="px-3 py-2 font-medium">Device</th>
                      <th className="px-3 py-2 font-medium">Result</th>
                      <th className="px-3 py-2 font-medium">Asset / reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.deviceId} className="border-b last:border-0">
                        <td className="px-3 py-2">
                          <span className="font-medium">{row.deviceName}</span>
                          {row.serialNumber ? <p className="font-mono text-[11px] text-muted-foreground">{row.serialNumber}</p> : null}
                        </td>
                        <td className="px-3 py-2"><Badge variant={ACTION_BADGE[row.action].variant}>{ACTION_BADGE[row.action].label}</Badge></td>
                        <td className="px-3 py-2 text-xs">
                          {row.assetLabel ? <p className="font-medium">{row.assetLabel}</p> : null}
                          <p className="text-muted-foreground">{row.reason}</p>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )
        ) : null}

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={commit} loading={loading && !!rows} disabled={!rows || linking + creating === 0}>
            {linking > 0 && creating > 0
              ? `Link ${linking} and create ${creating}`
              : creating > 0
                ? `Create ${creating}`
                : linking > 0
                  ? `Link ${linking}`
                  : "Link"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
