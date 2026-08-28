"use client";

import { checkInAssetCheckoutAction } from "@/modules/assets/actions";

import { useEffect, useState } from "react";
import { ClipboardCheck, Undo2, FileText, Trash2, Unlink } from "lucide-react";
import {
  startClearanceAction,
  returnAssetAction,
  sendHandoverForAssetsAction,
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
  // What is being reviewed: the chosen assignments, not a stored form. The
  // handover is only created when it is sent.
  const [preview, setPreview] = useState<string[] | null>(null);

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
                disabled={selected.length === 0}
                onClick={() => {
                  setPicking(false);
                  setPreview(selected);
                }}
              >
                Preview form
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!preview} onOpenChange={(next) => (next ? undefined : setPreview(null))}>
        <DialogContent title="Handover form preview" wide>
          <p className="mb-3 text-sm text-muted-foreground">
            Review the form below. Nothing is filed yet — it is added to Documents only when you send
            it to the employee for acknowledgement.
          </p>
          {preview && preview.length > 0 ? (
            <>
              <object
                // Viewer chrome is hidden so only the page itself is shown.
                data={`/api/people/${personId}/handover-preview?assignments=${preview.join(",")}#toolbar=0&navpanes=0&scrollbar=0&view=FitH`}
                type="application/pdf"
                className="h-[60vh] w-full rounded-md border"
                aria-label="Handover form preview"
              >
                <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center text-sm text-muted-foreground">
                  <p>The preview cannot be shown inline in this browser.</p>
                  <a
                    href={`/api/people/${personId}/handover-preview?assignments=${preview.join(",")}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary underline"
                  >
                    Open the form in a new tab
                  </a>
                </div>
              </object>
              <a
                href={`/api/people/${personId}/handover-preview?assignments=${preview.join(",")}`}
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
            <Button variant="outline" onClick={() => setPreview(null)}>Discard</Button>
            <Button
              loading={sending}
              onClick={() =>
                preview &&
                runSend(() => sendHandoverForAssetsAction(personId, preview), {
                  successMessage: "Handover recorded and sent for acknowledgement.",
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
      aria-label="Remove document from this profile"
      title="Remove from this profile (keeps the document)"
      onClick={() => {
        if (!window.confirm("Remove this document from this profile? The document itself is kept — use Delete to remove it everywhere.")) return;
        run(() => removePersonDocumentAction(personId, documentId), { successMessage: "Document removed." });
      }}
    >
      <Unlink className="h-4 w-4" />
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

/** Mark an asset that went off site on leave as back in the building. */
export function CheckInButton({ checkoutId }: { checkoutId: string }) {
  const { run, loading } = useAction();
  return (
    <Button
      variant="outline"
      size="sm"
      loading={loading}
      onClick={() =>
        run(() => checkInAssetCheckoutAction(checkoutId), { successMessage: "Asset checked back in." })
      }
    >
      Check in
    </Button>
  );
}
