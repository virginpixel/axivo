"use client";

import { useState } from "react";
import { ArrowLeftRight } from "lucide-react";
import { transferAssetAction } from "@/modules/assets/actions";
import { useAction } from "@/shared/ui/use-action";
import { Button } from "@/shared/ui/button";
import { Textarea, Label, FieldError, HelperText } from "@/shared/ui/input";
import { Combobox } from "@/shared/ui/combobox";
import { Dialog, DialogContent, DialogTrigger } from "@/shared/ui/dialog";

export interface TransferPerson {
  id: string;
  name: string;
  companyId: string;
  companyName: string;
}

/**
 * Moving an asset to another company, location or holder in one step, the way
 * it happens when someone physically carries it somewhere else. Returning the
 * current holder is optional: an employee of one company may legitimately keep
 * holding an asset owned by another.
 */
export function AssetTransferDialog({
  asset,
  companies,
  locations,
  people,
  currentHolder,
}: {
  asset: { id: string; name: string; companyId: string; locationId: string | null };
  companies: { id: string; name: string }[];
  locations: { id: string; name: string; companyId: string }[];
  people: TransferPerson[];
  currentHolder: { assignmentId: string; name: string } | null;
}) {
  const { run, loading, fieldErrors } = useAction();
  const [open, setOpen] = useState(false);
  const [companyId, setCompanyId] = useState(asset.companyId);
  const [locationId, setLocationId] = useState("");
  const [personId, setPersonId] = useState("");
  const [returnCurrent, setReturnCurrent] = useState(false);
  const [notes, setNotes] = useState("");

  const targetLocations = locations.filter((location) => location.companyId === companyId);
  const companyChanged = companyId !== asset.companyId;
  const changed = companyChanged || !!locationId || !!personId;
  // Handing the asset to someone new requires closing the current assignment.
  const mustReturn = !!currentHolder && !!personId;
  // "Unassigned" is wrong when somebody is already holding the asset.
  const keepHolderLabel = currentHolder
    ? `Keep it with ${currentHolder.name}`
    : "Nobody, keep it unassigned";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <ArrowLeftRight className="h-4 w-4" /> Transfer
        </Button>
      </DialogTrigger>
      <DialogContent title={`Transfer ${asset.name}`} description="Move the asset to another company, location or employee.">
        <div className="space-y-3">
          <div>
            <Label htmlFor="transfer-company">Company</Label>
            <Combobox
              id="transfer-company" value={companyId}
              options={companies.map((company) => ({ value: company.id, label: company.name }))}
              onChange={(value) => {
                setCompanyId(value);
                setLocationId("");
                setPersonId("");
              }}
            />
            <FieldError message={fieldErrors.companyId} />
            {companyChanged ? (
              <HelperText>The asset&apos;s location is cleared unless you pick a new one below.</HelperText>
            ) : null}
          </div>
          <div>
            <Label htmlFor="transfer-location">Location</Label>
            <Combobox
              id="transfer-location" value={locationId}
              placeholder="Keep current location"
              emptyLabel="Keep current location"
              options={targetLocations.map((location) => ({ value: location.id, label: location.name }))}
              onChange={setLocationId}
            />
          </div>
          <div>
            <Label htmlFor="transfer-person">Hand over to</Label>
            <Combobox
              id="transfer-person" value={personId}
              placeholder={keepHolderLabel}
              emptyLabel={keepHolderLabel}
              options={people.map((person) => ({
                value: person.id,
                label: person.name,
                hint: person.companyName,
              }))}
              onChange={setPersonId}
            />
          </div>

          {currentHolder ? (
            <label className="flex items-start gap-2 rounded-md border bg-muted/40 p-3 text-sm">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4"
                checked={returnCurrent || mustReturn}
                disabled={mustReturn}
                onChange={(e) => setReturnCurrent(e.target.checked)}
              />
              <span>
                Return the asset from {currentHolder.name} first.
                <span className="block text-xs text-muted-foreground">
                  {mustReturn
                    ? "Required, because you are handing it to someone else."
                    : "Leave this off to let them keep holding it after the transfer."}
                </span>
              </span>
            </label>
          ) : null}

          <div>
            <Label htmlFor="transfer-notes">Notes</Label>
            <Textarea id="transfer-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              loading={loading}
              disabled={!changed}
              onClick={() =>
                run(
                  () =>
                    transferAssetAction({
                      assetId: asset.id,
                      companyId: companyChanged ? companyId : undefined,
                      locationId: locationId || undefined,
                      personId: personId || undefined,
                      returnCurrentAssignment: returnCurrent || mustReturn,
                      notes: notes || undefined,
                    }),
                  { successMessage: "Asset transferred.", onSuccess: () => setOpen(false) },
                )
              }
            >
              Transfer asset
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
