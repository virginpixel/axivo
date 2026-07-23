"use client";

import { useRef, useState } from "react";
import { Plus, FilePlus2 } from "lucide-react";
import { uploadDocumentAction, uploadNewVersionAction } from "@/modules/documents/actions";
import { useAction } from "@/shared/ui/use-action";
import { Button } from "@/shared/ui/button";
import { Input, Select, Textarea, Label, FieldError, HelperText } from "@/shared/ui/input";
import { Dialog, DialogContent, DialogTrigger } from "@/shared/ui/dialog";

export function UploadDocumentDialog({
  companies,
  categories,
  assets = [],
}: {
  companies: { id: string; name: string }[];
  categories: { id: string; name: string; companyId: string }[];
  assets?: { id: string; name: string; assetTag: string | null; companyName: string }[];
}) {
  const { run, loading, fieldErrors } = useAction();
  const [open, setOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const [companyId, setCompanyId] = useState(companies[0]?.id ?? "");
  const [assetQuery, setAssetQuery] = useState("");
  const [linkedAssetIds, setLinkedAssetIds] = useState<string[]>([]);
  const companyCategories = categories.filter((category) => category.companyId === companyId);
  // A single form (a signed discard form, say) often covers several assets, so
  // the upload can be linked to a whole batch at once.
  const matchingAssets = assets.filter((asset) => {
    if (linkedAssetIds.includes(asset.id)) return true;
    if (!assetQuery.trim()) return false;
    const needle = assetQuery.trim().toLowerCase();
    return asset.name.toLowerCase().includes(needle) || (asset.assetTag ?? "").toLowerCase().includes(needle);
  });

  function toggleAsset(id: string) {
    setLinkedAssetIds((current) =>
      current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id],
    );
  }

  async function submit() {
    const form = formRef.current;
    if (!form) return;
    const data = new FormData(form);
    data.set("companyId", companyId);
    for (const assetId of linkedAssetIds) data.append("linkAssetIds", assetId);
    await run(() => uploadDocumentAction(data), {
      successMessage: "Document uploaded.",
      onSuccess: () => {
        setOpen(false);
        setLinkedAssetIds([]);
        setAssetQuery("");
      },
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="h-4 w-4" /> Upload document
        </Button>
      </DialogTrigger>
      <DialogContent title="Upload document">
        <form ref={formRef} className="space-y-3" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
          <div>
            <Label htmlFor="doc-company" required>Company</Label>
            <Select id="doc-company" value={companyId} onChange={(event) => setCompanyId(event.target.value)}>
              {companies.map((company) => (
                <option key={company.id} value={company.id}>{company.name}</option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="doc-file" required>File</Label>
            <Input id="doc-file" name="file" type="file" />
            <FieldError message={fieldErrors.file} />
          </div>
          <div>
            <Label htmlFor="doc-name">Document name</Label>
            <Input id="doc-name" name="name" placeholder="Defaults to the file name" />
          </div>
          <div>
            <Label htmlFor="doc-category">Category</Label>
            <Select id="doc-category" name="categoryName" defaultValue="">
              <option value="">No category</option>
              {companyCategories.map((category) => (
                <option key={category.id} value={category.name}>{category.name}</option>
              ))}
            </Select>
          </div>
          {assets.length > 0 ? (
            <div>
              <Label htmlFor="doc-assets">Link to assets</Label>
              <Input
                id="doc-assets"
                value={assetQuery}
                onChange={(event) => setAssetQuery(event.target.value)}
                placeholder="Search by asset name or tag"
              />
              <HelperText>
                Linked assets show this document on their own page. Useful when one form covers several of them.
              </HelperText>
              {matchingAssets.length > 0 ? (
                <div className="mt-2 max-h-40 space-y-1 overflow-y-auto rounded-md border p-2">
                  {matchingAssets.map((asset) => (
                    <label key={asset.id} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        className="h-4 w-4"
                        checked={linkedAssetIds.includes(asset.id)}
                        onChange={() => toggleAsset(asset.id)}
                      />
                      <span className="truncate">
                        {asset.name}
                        {asset.assetTag ? ` (${asset.assetTag})` : ""}
                        <span className="text-muted-foreground"> · {asset.companyName}</span>
                      </span>
                    </label>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
          <div>
            <Label htmlFor="doc-notes">Notes</Label>
            <Textarea id="doc-notes" name="notes" />
          </div>
          <HelperText>
            Uploads are validated for type and size. Documents are never permanently deleted.
          </HelperText>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" loading={loading}>Upload</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function NewVersionDialog({ documentId, documentName }: { documentId: string; documentName: string }) {
  const { run, loading, fieldErrors } = useAction();
  const [open, setOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  async function submit() {
    const form = formRef.current;
    if (!form) return;
    await run(() => uploadNewVersionAction(documentId, new FormData(form)), {
      successMessage: "New version uploaded.",
      onSuccess: () => setOpen(false),
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={`Upload new version of ${documentName}`} title="Upload new version">
          <FilePlus2 className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent title={`New version: ${documentName}`} description="Previous versions remain available and read-only.">
        <form ref={formRef} className="space-y-3" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
          <div>
            <Label htmlFor={`ver-file-${documentId}`} required>File</Label>
            <Input id={`ver-file-${documentId}`} name="file" type="file" />
            <FieldError message={fieldErrors.file} />
          </div>
          <div>
            <Label htmlFor={`ver-summary-${documentId}`}>Change summary</Label>
            <Input id={`ver-summary-${documentId}`} name="changeSummary" placeholder="What changed in this version?" />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" loading={loading}>Upload version</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
