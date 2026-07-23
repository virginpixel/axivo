"use client";

import { useState } from "react";
import { setAssetStatusAction, setMaintenanceStatusAction } from "@/modules/assets/actions";
import { useAction } from "@/shared/ui/use-action";
import { Select, Label } from "@/shared/ui/input";
import { Button } from "@/shared/ui/button";
import { AssetDiscardDialog, type DiscardCandidate } from "./asset-discard-dialog";

/**
 * Manual status control following the lifecycle rules (SDS Doc 11 Ch4):
 * Assigned is entered via assignment; the remaining operational transitions are
 * available here. Discarded is offered too, but it opens the discard dialog so
 * the approved discard form is captured with it.
 */
const MANUAL_TRANSITIONS: Record<string, string[]> = {
  AVAILABLE: ["RESERVED", "OUT_OF_ORDER", "UNDER_REPAIR", "DISCARDED"],
  UNDER_REPAIR: ["AVAILABLE", "OUT_OF_ORDER", "DISCARDED"],
  OUT_OF_ORDER: ["AVAILABLE", "UNDER_REPAIR", "DISCARDED"],
  RESERVED: ["AVAILABLE", "DISCARDED"],
};

export function AssetStatusControl({
  asset,
  activeMaintenanceId,
  canMaintain,
  canDispose,
  otherAssets,
  documents,
}: {
  asset: { id: string; name: string; companyId: string; status: string };
  activeMaintenanceId: string | null;
  canMaintain: boolean;
  canDispose: boolean;
  otherAssets: DiscardCandidate[];
  documents: { id: string; name: string }[];
}) {
  const { run, loading } = useAction();
  const [discardOpen, setDiscardOpen] = useState(false);
  const [selected, setSelected] = useState("");
  const options = (MANUAL_TRANSITIONS[asset.status] ?? []).filter(
    (option) => option !== "DISCARDED" || canDispose,
  );

  if (asset.status === "ASSIGNED") {
    return (
      <p className="text-xs text-muted-foreground">
        Status changes are unavailable while the asset is assigned. Return it first.
      </p>
    );
  }

  return (
    <div>
      <Label htmlFor={`status-${asset.id}`} className="sr-only">Change status</Label>
      <div className="flex items-center gap-2">
        <Select
          id={`status-${asset.id}`}
          value={selected}
          disabled={loading || options.length === 0}
          className="w-52"
          onChange={(event) => {
            const next = event.target.value;
            if (!next) return;
            if (next === "DISCARDED") {
              setSelected("");
              setDiscardOpen(true);
              return;
            }
            setSelected("");
            void run(() => setAssetStatusAction(asset.id, next), {
              successMessage: `Status changed to ${next.replace(/_/g, " ").toLowerCase()}.`,
            });
          }}
        >
          <option value="">Select new status…</option>
          {options.map((option) => (
            <option key={option} value={option}>{option.replace(/_/g, " ")}</option>
          ))}
        </Select>
        {asset.status === "UNDER_REPAIR" && activeMaintenanceId && canMaintain ? (
          <Button
            variant="outline"
            size="sm"
            loading={loading}
            onClick={() =>
              run(() => setMaintenanceStatusAction(activeMaintenanceId, "COMPLETED"), {
                successMessage: "Maintenance completed; previous status restored.",
              })
            }
          >
            Complete maintenance
          </Button>
        ) : null}
      </div>
      <AssetDiscardDialog
        open={discardOpen}
        onOpenChange={setDiscardOpen}
        asset={asset}
        otherAssets={otherAssets}
        documents={documents}
      />
    </div>
  );
}
