"use client";

import { useState } from "react";
import { Trash2, Undo2, AlertTriangle, ShieldAlert } from "lucide-react";
import { deleteDocumentAction, restoreDocumentAction, purgeDocumentAction } from "@/modules/documents/actions";
import { useAction } from "@/shared/ui/use-action";
import { Button } from "@/shared/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/shared/ui/dialog";

/** Signed or completed records this document is the evidence for. */
export interface DocumentEvidenceSummary {
  acknowledgedHandovers: number;
  completedClearances: number;
  disposals: number;
  checkouts: number;
}

function evidenceLines(evidence: DocumentEvidenceSummary): string[] {
  const lines: string[] = [];
  const plural = (count: number, one: string, many: string) => (count === 1 ? one : many);
  if (evidence.acknowledgedHandovers > 0) {
    lines.push(
      `${evidence.acknowledgedHandovers} acknowledged asset ${plural(evidence.acknowledgedHandovers, "handover", "handovers")} — this is the signed proof that the employee accepted responsibility for the asset/s.`,
    );
  }
  if (evidence.completedClearances > 0) {
    lines.push(
      `${evidence.completedClearances} completed ${plural(evidence.completedClearances, "clearance", "clearances")} — the record that company property was recovered.`,
    );
  }
  if (evidence.disposals > 0) {
    lines.push(
      `${evidence.disposals} asset ${plural(evidence.disposals, "disposal", "disposals")} — the approval the discard was made against.`,
    );
  }
  if (evidence.checkouts > 0) {
    lines.push(`${evidence.checkouts} asset ${plural(evidence.checkouts, "checkout", "checkouts")}.`);
  }
  return lines;
}

/**
 * Delete a document from every screen. The delete is soft, so the warning can be
 * honest on both counts: signing evidence would disappear from view, but nothing
 * is destroyed and the document can be restored from Documents.
 */
export function DocumentDelete({
  documentId,
  documentName,
  evidence,
}: {
  documentId: string;
  documentName: string;
  evidence: DocumentEvidenceSummary;
}) {
  const { run, loading } = useAction();
  const [open, setOpen] = useState(false);
  const warnings = evidenceLines(evidence);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={`Delete ${documentName}`} title="Delete document">
          <Trash2 className="h-4 w-4 text-destructive" />
        </Button>
      </DialogTrigger>
      <DialogContent
        title={`Delete ${documentName}`}
        description="This removes the document from Documents, employee profiles and asset pages."
      >
        <div className="space-y-3">
          {warnings.length > 0 ? (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3">
              <p className="flex items-center gap-2 text-sm font-semibold text-destructive">
                <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
                This document is signed evidence
              </p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
                {warnings.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
              <p className="mt-2 text-sm">
                Deleting it removes that proof from the record an auditor would be shown.
              </p>
            </div>
          ) : null}
          <p className="text-sm text-muted-foreground">
            The stored file and its history are kept, and the document can be restored later from
            Documents using the <strong>Show deleted</strong> filter.
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              variant="destructive"
              loading={loading}
              onClick={() =>
                run(() => deleteDocumentAction(documentId), {
                  successMessage: "Document deleted.",
                  onSuccess: () => setOpen(false),
                })
              }
            >
              Delete document
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function DocumentRestore({ documentId, documentName }: { documentId: string; documentName: string }) {
  const { run, loading } = useAction();
  return (
    <Button
      variant="ghost"
      size="icon"
      loading={loading}
      aria-label={`Restore ${documentName}`}
      title="Restore document"
      onClick={() => run(() => restoreDocumentAction(documentId), { successMessage: "Document restored." })}
    >
      <Undo2 className="h-4 w-4" />
    </Button>
  );
}

/**
 * Destroy a deleted document for good. Unlike the soft delete, nothing survives
 * this: the file is removed from storage and the record is gone, so the dialog
 * says so plainly and names the evidence being destroyed.
 */
export function DocumentPurge({
  documentId,
  documentName,
  evidence,
}: {
  documentId: string;
  documentName: string;
  evidence: DocumentEvidenceSummary;
}) {
  const { run, loading } = useAction();
  const [open, setOpen] = useState(false);
  const warnings = evidenceLines(evidence);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Permanently delete ${documentName}`}
          title="Delete permanently"
        >
          <ShieldAlert className="h-4 w-4 text-destructive" />
        </Button>
      </DialogTrigger>
      <DialogContent
        title={`Permanently delete ${documentName}`}
        description="This cannot be undone."
      >
        <div className="space-y-3">
          <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
            <p className="flex items-center gap-2 font-semibold text-destructive">
              <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
              The file and its history will be destroyed
            </p>
            <p className="mt-2">
              The stored file is removed from disk and every version is deleted. There is no
              restore after this.
            </p>
            {warnings.length > 0 ? (
              <ul className="mt-2 list-disc space-y-1 pl-5">
                {warnings.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            ) : null}
          </div>
          <p className="text-sm text-muted-foreground">
            An audit entry recording what was destroyed is kept.
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              variant="destructive"
              loading={loading}
              onClick={() =>
                run(() => purgeDocumentAction(documentId), {
                  successMessage: "Document permanently deleted.",
                  onSuccess: () => setOpen(false),
                })
              }
            >
              Delete permanently
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
