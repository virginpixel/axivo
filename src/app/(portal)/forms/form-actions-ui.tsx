"use client";

import { useState } from "react";
import Link from "next/link";
import { Copy, Pencil, Plus, Rocket, Archive, Files, Trash2 } from "lucide-react";
import {
  publishFormAction,
  archiveFormAction,
  duplicateFormAction,
  deleteFormAction,
  createRequestTypeAction,
} from "@/modules/forms/actions";
import { useAction } from "@/shared/ui/use-action";
import { Button } from "@/shared/ui/button";
import { Input, Select, Textarea, Label, FieldError } from "@/shared/ui/input";
import { Dialog, DialogContent, DialogTrigger } from "@/shared/ui/dialog";
import { useToast } from "@/shared/ui/toast";

export function CopyLinkButton({ url }: { url: string }) {
  const { toast } = useToast();
  return (
    <button
      type="button"
      aria-label="Copy public link"
      title="Copy public link"
      className="text-muted-foreground hover:text-foreground"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(url);
          toast("success", "Public link copied.");
        } catch {
          toast("error", "Could not copy the link.");
        }
      }}
    >
      <Copy className="h-3.5 w-3.5" />
    </button>
  );
}

export function FormRowActions({ formId, status }: { formId: string; status: string }) {
  const { run, loading } = useAction();
  return (
    <div className="flex justify-end gap-1">
      {status !== "ARCHIVED" ? (
        <Link href={`/forms/builder?id=${formId}`}>
          <Button variant="ghost" size="icon" aria-label="Edit form">
            <Pencil className="h-4 w-4" />
          </Button>
        </Link>
      ) : null}
      {status === "DRAFT" ? (
        <Button
          variant="ghost"
          size="icon"
          loading={loading}
          aria-label="Publish form"
          title="Publish"
          onClick={() => run(() => publishFormAction(formId), { successMessage: "Form published." })}
        >
          <Rocket className="h-4 w-4 text-success" />
        </Button>
      ) : null}
      <Button
        variant="ghost"
        size="icon"
        loading={loading}
        aria-label="Duplicate form"
        title="Duplicate"
        onClick={() => run(() => duplicateFormAction(formId), { successMessage: "Form duplicated." })}
      >
        <Files className="h-4 w-4" />
      </Button>
      {status !== "ARCHIVED" ? (
        <Button
          variant="ghost"
          size="icon"
          loading={loading}
          aria-label="Archive form"
          title="Archive"
          onClick={() => run(() => archiveFormAction(formId), { successMessage: "Form archived." })}
        >
          <Archive className="h-4 w-4 text-muted-foreground" />
        </Button>
      ) : null}
      <Button
        variant="ghost"
        size="icon"
        loading={loading}
        aria-label="Delete form"
        title="Delete"
        onClick={() => {
          if (!window.confirm("Delete this form? Requests already submitted keep their own record, so their history stays intact.")) return;
          run(() => deleteFormAction(formId), { successMessage: "Form deleted." });
        }}
      >
        <Trash2 className="h-4 w-4 text-destructive" />
      </Button>
    </div>
  );
}

export function RequestTypeDialog({ companies }: { companies: { id: string; name: string }[] }) {
  const { run, loading, fieldErrors } = useAction();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    companyId: companies[0]?.id ?? "",
    name: "",
    kind: "APPLICATION_ACCESS",
    description: "",
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Plus className="h-4 w-4" /> New request type
        </Button>
      </DialogTrigger>
      <DialogContent title="New request type">
        <div className="space-y-3">
          <div>
            <Label htmlFor="rt-company" required>Company</Label>
            <Select id="rt-company" value={form.companyId} onChange={(e) => setForm({ ...form, companyId: e.target.value })}>
              {companies.map((company) => (
                <option key={company.id} value={company.id}>{company.name}</option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="rt-name" required>Name</Label>
            <Input id="rt-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <FieldError message={fieldErrors.name} />
          </div>
          <div>
            <Label htmlFor="rt-kind" required>Kind</Label>
            <Select id="rt-kind" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
              <option value="APPLICATION_ACCESS">Application Access</option>
              <option value="ASSET_REQUEST">Asset Request</option>
              <option value="ASSET_HANDOVER">Asset Handover</option>
              <option value="ROLE_CHANGE">Role Change</option>
              <option value="CLEARANCE">Clearance</option>
              <option value="GENERAL">General Request</option>
            </Select>
          </div>
          <div>
            <Label htmlFor="rt-description">Description</Label>
            <Textarea id="rt-description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              loading={loading}
              onClick={() =>
                run(
                  () =>
                    createRequestTypeAction({
                      companyId: form.companyId,
                      name: form.name,
                      kind: form.kind,
                      description: form.description || undefined,
                    }),
                  { successMessage: "Request type created.", onSuccess: () => setOpen(false) },
                )
              }
            >
              Create request type
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
