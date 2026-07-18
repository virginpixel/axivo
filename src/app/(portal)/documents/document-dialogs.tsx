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
}: {
  companies: { id: string; name: string }[];
  categories: { id: string; name: string; companyId: string }[];
}) {
  const { run, loading, fieldErrors } = useAction();
  const [open, setOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const [companyId, setCompanyId] = useState(companies[0]?.id ?? "");
  const companyCategories = categories.filter((category) => category.companyId === companyId);

  async function submit() {
    const form = formRef.current;
    if (!form) return;
    const data = new FormData(form);
    data.set("companyId", companyId);
    await run(() => uploadDocumentAction(data), {
      successMessage: "Document uploaded.",
      onSuccess: () => setOpen(false),
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
