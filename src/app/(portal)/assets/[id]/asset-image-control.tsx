"use client";

import { Upload, Trash2 } from "lucide-react";
import { uploadAssetImageAction, removeAssetImageAction } from "@/modules/assets/actions";
import { useAction } from "@/shared/ui/use-action";
import { Button } from "@/shared/ui/button";

/**
 * Per-asset image override. If the asset's model has a default image it is used
 * automatically; uploading here overrides it for this asset only.
 */
export function AssetImageControl({
  assetId,
  hasOverride,
  hasModelImage,
}: {
  assetId: string;
  hasOverride: boolean;
  hasModelImage: boolean;
}) {
  const { run, loading } = useAction();

  function onFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const data = new FormData();
    data.set("file", file);
    run(() => uploadAssetImageAction(assetId, data), { successMessage: "Asset image saved." });
    event.target.value = "";
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="inline-flex cursor-pointer items-center gap-1 rounded-md border bg-card px-2.5 py-1.5 text-xs hover:bg-accent">
        <Upload className="h-3.5 w-3.5" /> {hasOverride ? "Replace image" : "Upload image"}
        <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={onFile} disabled={loading} />
      </label>
      {hasOverride ? (
        <Button
          variant="ghost" size="icon" loading={loading} aria-label="Remove override" title="Remove override image"
          onClick={() => run(() => removeAssetImageAction(assetId), { successMessage: "Override removed." })}
        >
          <Trash2 className="h-4 w-4 text-destructive" />
        </Button>
      ) : null}
      {!hasOverride && hasModelImage ? (
        <span className="text-xs text-muted-foreground">Showing model default image.</span>
      ) : null}
    </div>
  );
}
