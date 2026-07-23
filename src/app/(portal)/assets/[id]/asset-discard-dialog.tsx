"use client";

import { useState } from "react";
import { discardAssetsAction } from "@/modules/assets/actions";
import { uploadDocumentAction } from "@/modules/documents/actions";
import { DISPOSAL_CATEGORY } from "@/modules/documents/categories";
import { useAction } from "@/shared/ui/use-action";
import { Button } from "@/shared/ui/button";
import { Input, Select, Textarea, Label, FieldError, HelperText } from "@/shared/ui/input";
import { Combobox } from "@/shared/ui/combobox";
import { Dialog, DialogContent } from "@/shared/ui/dialog";

export interface DiscardCandidate {
  id: string;
  name: string;
  assetTag: string | null;
  companyName: string;
}

/**
 * Discarding an asset always needs the approved discard form. One signed form
 * usually covers several assets at once, so the dialog lets the batch be picked
 * here and links the same document to every asset in it.
 */
export function AssetDiscardDialog({
  open,
  onOpenChange,
  asset,
  otherAssets,
  documents,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  asset: { id: string; name: string; companyId: string };
  otherAssets: DiscardCandidate[];
  documents: { id: string; name: string }[];
}) {
  const { run, loading, fieldErrors } = useAction();
  const [source, setSource] = useState<"upload" | "existing">("upload");
  const [file, setFile] = useState<File | null>(null);
  const [documentName, setDocumentName] = useState("");
  const [documentId, setDocumentId] = useState("");
  const [alsoDiscard, setAlsoDiscard] = useState<string[]>([]);
  const [form, setForm] = useState({
    method: "",
    reason: "",
    disposalDate: new Date().toISOString().slice(0, 10),
    disposalValue: "",
    currency: "",
  });

  const ready =
    !!form.method.trim() &&
    !!form.reason.trim() &&
    (source === "existing" ? !!documentId : !!file);

  function toggle(id: string) {
    setAlsoDiscard((current) =>
      current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id],
    );
  }

  async function submit() {
    const assetIds = [asset.id, ...alsoDiscard];
    let resolvedDocumentId = documentId;
    if (source === "upload" && file) {
      const payload = new FormData();
      payload.set("file", file);
      payload.set("companyId", asset.companyId);
      payload.set("name", documentName.trim() || file.name);
      payload.set("categoryName", DISPOSAL_CATEGORY);
      for (const id of assetIds) payload.append("linkAssetIds", id);
      const uploaded = await uploadDocumentAction(payload);
      if (!uploaded.ok) return uploaded;
      resolvedDocumentId = uploaded.data.id;
    }
    return discardAssetsAction({
      assetIds,
      disposalDate: form.disposalDate,
      method: form.method,
      reason: form.reason,
      disposalValue: form.disposalValue ? Number(form.disposalValue) : undefined,
      currency: form.currency || undefined,
      documentId: resolvedDocumentId,
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={`Discard ${asset.name}`}
        description="The approved discard form is kept in Documents and shown on every asset it covers."
        wide
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="discard-method" required>Discard method</Label>
            <Input id="discard-method" value={form.method}
              onChange={(e) => setForm({ ...form, method: e.target.value })}
              placeholder="e.g. E-waste recycling, Sold, Donated" />
            <FieldError message={fieldErrors.method} />
          </div>
          <div>
            <Label htmlFor="discard-date" required>Discard date</Label>
            <Input id="discard-date" type="date" value={form.disposalDate}
              onChange={(e) => setForm({ ...form, disposalDate: e.target.value })} />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="discard-reason" required>Reason</Label>
            <Textarea id="discard-reason" value={form.reason}
              onChange={(e) => setForm({ ...form, reason: e.target.value })} />
            <FieldError message={fieldErrors.reason} />
          </div>
          <div>
            <Label htmlFor="discard-value">Recovered value</Label>
            <Input id="discard-value" type="number" min="0" step="0.01" value={form.disposalValue}
              onChange={(e) => setForm({ ...form, disposalValue: e.target.value })} />
          </div>
          <div>
            <Label htmlFor="discard-currency">Currency</Label>
            <Input id="discard-currency" value={form.currency} maxLength={10}
              onChange={(e) => setForm({ ...form, currency: e.target.value.toUpperCase() })}
              placeholder="e.g. MVR" />
          </div>
        </div>

        <div className="mt-4 border-t pt-4">
          <Label htmlFor="discard-source" required>Approved discard form</Label>
          <Select id="discard-source" value={source} className="mb-2"
            onChange={(e) => setSource(e.target.value as "upload" | "existing")}>
            <option value="upload">Upload a new form</option>
            <option value="existing">Use a form already in Documents</option>
          </Select>
          {source === "upload" ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="discard-file" required>File</Label>
                <Input id="discard-file" type="file" accept=".pdf,.png,.jpg,.jpeg"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
                <FieldError message={fieldErrors.file} />
              </div>
              <div>
                <Label htmlFor="discard-doc-name">Document name</Label>
                <Input id="discard-doc-name" value={documentName}
                  onChange={(e) => setDocumentName(e.target.value)}
                  placeholder="Defaults to the file name" />
              </div>
            </div>
          ) : (
            <div>
              <Combobox
                id="discard-document" value={documentId}
                placeholder="Select a discard form…"
                options={documents.map((document) => ({ value: document.id, label: document.name }))}
                onChange={setDocumentId}
              />
              <HelperText>Only approved discard forms are listed. Pick one if it was already uploaded for another asset in the same batch.</HelperText>
            </div>
          )}
        </div>

        {otherAssets.length > 0 ? (
          <div className="mt-4 border-t pt-4">
            <p className="text-sm font-medium">Other assets covered by this form</p>
            <HelperText>Each one gets its own discard record and shows the same form.</HelperText>
            <div className="mt-2 max-h-48 space-y-1 overflow-y-auto rounded-md border p-2">
              {otherAssets.map((candidate) => (
                <label key={candidate.id} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" className="h-4 w-4"
                    checked={alsoDiscard.includes(candidate.id)}
                    onChange={() => toggle(candidate.id)} />
                  <span className="truncate">
                    {candidate.name}
                    {candidate.assetTag ? ` (${candidate.assetTag})` : ""}
                    <span className="text-muted-foreground"> · {candidate.companyName}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>
        ) : null}

        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            variant="destructive"
            loading={loading}
            disabled={!ready}
            onClick={() =>
              run(submit, {
                successMessage:
                  alsoDiscard.length > 0
                    ? `${alsoDiscard.length + 1} assets discarded.`
                    : "Asset discarded.",
                onSuccess: () => onOpenChange(false),
              })
            }
          >
            Discard {alsoDiscard.length > 0 ? `${alsoDiscard.length + 1} assets` : "asset"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
