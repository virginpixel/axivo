"use client";

import { useState } from "react";
import { Upload, Eye, Download, Trash2 } from "lucide-react";
import { attachContractPdfAction, removeContractPdfAction } from "@/modules/contracts/actions";
import { useAction } from "@/shared/ui/use-action";
import { Button } from "@/shared/ui/button";
import { Table, THead, TBody, TR, TH, TD, EmptyState } from "@/shared/ui/table";

export interface ContractDocumentRow {
  id: string;
  name: string;
  createdAt: string;
}

/**
 * Per-contract documents: attach new PDFs (e.g. after each renewal) and view,
 * download or remove existing ones. Files live in Documents with version history.
 */
export function ContractDocuments({
  contractId,
  documents,
  canManage,
}: {
  contractId: string;
  documents: ContractDocumentRow[];
  canManage: boolean;
}) {
  const { run, loading } = useAction();
  const { run: runRemove, loading: removing } = useAction();

  function onFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const data = new FormData();
    data.set("file", file);
    run(() => attachContractPdfAction(contractId, data), { successMessage: "Contract PDF attached." });
    event.target.value = "";
  }

  return (
    <div>
      {canManage ? (
        <div className="mb-3 flex justify-end">
          <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border bg-card px-3 py-1.5 text-sm hover:bg-accent">
            <Upload className="h-4 w-4" /> Attach PDF
            <input type="file" accept="application/pdf" className="hidden" onChange={onFile} disabled={loading} />
          </label>
        </div>
      ) : null}
      {documents.length === 0 ? (
        <EmptyState title="No documents" description="Attach the signed contract PDF. Add a new one after each renewal to keep a per-year history." />
      ) : (
        <Table>
          <THead><TR><TH>Document</TH><TH>Added</TH><TH className="text-right">Actions</TH></TR></THead>
          <TBody>
            {documents.map((document) => (
              <TR key={document.id}>
                <TD className="font-medium">{document.name}</TD>
                <TD>{document.createdAt}</TD>
                <TD className="text-right">
                  <div className="flex justify-end gap-2">
                    <a href={`/api/documents/${document.id}/download?inline=1`} target="_blank" rel="noreferrer" className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-accent" aria-label="View PDF" title="View">
                      <Eye className="h-4 w-4 text-primary" />
                    </a>
                    <a href={`/api/documents/${document.id}/download`} className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-accent" aria-label="Download PDF" title="Download">
                      <Download className="h-4 w-4" />
                    </a>
                    {canManage ? (
                      <Button
                        variant="ghost" size="icon" loading={removing} aria-label="Remove PDF" title="Remove"
                        onClick={() => runRemove(() => removeContractPdfAction(contractId, document.id), { successMessage: "Document removed." })}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    ) : null}
                  </div>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </div>
  );
}
