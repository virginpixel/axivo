"use client";

import { useEffect, useState } from "react";
import { ClipboardCheck, Undo2, FileText, Trash2 } from "lucide-react";
import {
  startClearanceAction,
  returnAssetAction,
  generateHandoverForAssetsAction,
  sendHandoverAction,
} from "@/modules/assets/actions";
import { removePersonDocumentAction } from "@/modules/people/actions";
import { useAction } from "@/shared/ui/use-action";
import { Button } from "@/shared/ui/button";
import { Dialog, DialogContent } from "@/shared/ui/dialog";
import { ClearancePanel, type ClearanceItemView } from "../../assets/asset-dialogs";

export interface AssignedAsset {
  assignmentId: string;
  label: string;
  reference: string | null;
}

/**
 * Single control for clearance: starts one when none is open (opening the modal
 * straight away) and reopens the in-progress clearance afterwards. Keeping it
 * as one component means the "open after starting" intent survives the refresh.
 */
export function ClearanceControl({
  personId,
  personName,
  clearance,
  canManage,
}: {
  personId: string;
  personName: string;
  clearance: { id: string; items: ClearanceItemView[] } | null;
  canManage: boolean;
}) {
  const { run, loading } = useAction();
  const [open, setOpen] = useState(false);
  const [openWhenReady, setOpenWhenReady] = useState(false);

  // Once the freshly started clearance arrives from the server, show it.
  useEffect(() => {
    if (openWhenReady && clearance) {
      setOpen(true);
      setOpenWhenReady(false);
    }
  }, [openWhenReady, clearance]);

  return (
    <>
      {clearance ? (
        <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
          <ClipboardCheck className="h-4 w-4" /> Manage clearance ({clearance.items.length})
        </Button>
      ) : (
        <Button
          variant="outline"
          size="sm"
          loading={loading}
          onClick={() =>
            run(() => startClearanceAction(personId), {
              successMessage: "Clearance started.",
              onSuccess: () => setOpenWhenReady(true),
            })
          }
        >
          <ClipboardCheck className="h-4 w-4" /> Start clearance
        </Button>
      )}
      <Dialog open={open && !!clearance} onOpenChange={setOpen}>
        <DialogContent title={`Clearance: ${personName}`} wide>
          {clearance ? (
            <ClearancePanel
              clearanceId={clearance.id}
              personName={personName}
              items={clearance.items}
              canManage={canManage}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}

/**
 * Handover: pick which of the person's assigned assets to include, generate the
 * form, review the PDF, then send it for acknowledgement.
 */
export function GenerateHandoverButton({
  personId,
  assets,
}: {
  personId: string;
  assets: AssignedAsset[];
}) {
  const { run, loading } = useAction();
  const { run: runSend, loading: sending } = useAction();
  const [picking, setPicking] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [preview, setPreview] = useState<{ handoverId: string; documentId: string | null } | null>(null);

  function openPicker() {
    setSelected(assets.map((asset) => asset.assignmentId));
    setPicking(true);
  }

  function toggle(assignmentId: string) {
    setSelected((current) =>
      current.includes(assignmentId) ? current.filter((id) => id !== assignmentId) : [...current, assignmentId],
    );
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={openPicker} disabled={assets.length === 0}>
        <FileText className="h-4 w-4" /> Generate handover form
      </Button>

      <Dialog open={picking} onOpenChange={setPicking}>
        <DialogContent title="Select assets for the handover form">
          <p className="mb-3 text-sm text-muted-foreground">
            Choose which of the assets currently assigned to this employee should appear on the form.
          </p>
          {assets.length === 0 ? (
            <p className="text-sm text-muted-foreground">This employee has no assigned assets.</p>
          ) : (
            <ul className="max-h-72 space-y-2 overflow-y-auto">
              {assets.map((asset) => (
                <li key={asset.assignmentId}>
                  <label className="flex cursor-pointer items-center gap-2 rounded-md border bg-card px-3 py-2 text-sm">
                    <input
                      type="checkbox"
                      className="h-4 w-4"
                      checked={selected.includes(asset.assignmentId)}
                      onChange={() => toggle(asset.assignmentId)}
                    />
                    <span className="font-medium">{asset.label}</span>
                    {asset.reference ? (
                      <span className="text-xs text-muted-foreground">{asset.reference}</span>
                    ) : null}
                  </label>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-4 flex justify-between gap-2">
            <button
              type="button"
              className="text-xs text-primary hover:underline"
              onClick={() =>
                setSelected(selected.length === assets.length ? [] : assets.map((asset) => asset.assignmentId))
              }
            >
              {selected.length === assets.length ? "Clear all" : "Select all"}
            </button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setPicking(false)}>Cancel</Button>
              <Button
                loading={loading}
                disabled={selected.length === 0}
                onClick={() =>
                  run(() => generateHandoverForAssetsAction(personId, selected), {
                    successMessage: "Handover form generated. Review, then send.",
                    onSuccess: (data) => {
                      setPicking(false);
                      setPreview({ handoverId: data.id, documentId: data.documentId });
                    },
                  })
                }
              >
                Generate form
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!preview} onOpenChange={(next) => (next ? undefined : setPreview(null))}>
        <DialogContent title="Handover form preview" wide>
          <p className="mb-3 text-sm text-muted-foreground">
            Review the generated handover form below. When ready, send it to the employee for acknowledgement.
          </p>
          {preview?.documentId ? (
            <>
              <object
                // Viewer chrome is hidden so only the page itself is shown.
                data={`/api/documents/${preview.documentId}/download?inline=1#toolbar=0&navpanes=0&scrollbar=0&view=FitH`}
                type="application/pdf"
                className="h-[60vh] w-full rounded-md border"
                aria-label="Handover form preview"
              >
                <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center text-sm text-muted-foreground">
                  <p>The preview cannot be shown inline in this browser.</p>
                  <a
                    href={`/api/documents/${preview.documentId}/download?inline=1`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary underline"
                  >
                    Open the form in a new tab
                  </a>
                </div>
              </object>
              <a
                href={`/api/documents/${preview.documentId}/download?inline=1`}
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-block text-xs text-primary hover:underline"
              >
                Open in a new tab
              </a>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Preview unavailable.</p>
          )}
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setPreview(null)}>Close without sending</Button>
            <Button
              loading={sending}
              onClick={() =>
                preview &&
                runSend(() => sendHandoverAction(preview.handoverId), {
                  successMessage: "Handover sent for acknowledgement.",
                  onSuccess: () => setPreview(null),
                })
              }
            >
              Send to employee
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Remove a document from this person's profile (unlinks it). */
export function PersonDocumentDelete({ personId, documentId }: { personId: string; documentId: string }) {
  const { run, loading } = useAction();
  return (
    <Button
      variant="ghost"
      size="icon"
      loading={loading}
      aria-label="Remove document"
      title="Remove from profile"
      onClick={() => {
        if (!window.confirm("Remove this document from the profile? The file stays in Documents.")) return;
        run(() => removePersonDocumentAction(personId, documentId), { successMessage: "Document removed." });
      }}
    >
      <Trash2 className="h-4 w-4 text-destructive" />
    </Button>
  );
}

export function ReturnAssetButton({ assignmentId }: { assignmentId: string }) {
  const { run, loading } = useAction();
  return (
    <Button
      variant="ghost"
      size="icon"
      loading={loading}
      aria-label="Return asset"
      title="Return asset"
      onClick={() => run(() => returnAssetAction(assignmentId), { successMessage: "Asset returned." })}
    >
      <Undo2 className="h-4 w-4" />
    </Button>
  );
}
