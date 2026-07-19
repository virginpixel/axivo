"use client";

import { setAssetStatusAction, setMaintenanceStatusAction } from "@/modules/assets/actions";
import { useAction } from "@/shared/ui/use-action";
import { Select, Label } from "@/shared/ui/input";
import { Button } from "@/shared/ui/button";

/**
 * Manual status control following the lifecycle rules (SDS Doc 11 Ch4):
 * Assigned is entered via assignment, Discarded via disposal; the remaining
 * operational transitions are available here.
 */
const MANUAL_TRANSITIONS: Record<string, string[]> = {
  AVAILABLE: ["RESERVED", "OUT_OF_ORDER", "UNDER_REPAIR"],
  UNDER_REPAIR: ["AVAILABLE", "OUT_OF_ORDER"],
  OUT_OF_ORDER: ["AVAILABLE", "UNDER_REPAIR"],
  RESERVED: ["AVAILABLE"],
};

export function AssetStatusControl({
  assetId,
  status,
  activeMaintenanceId,
  canMaintain,
}: {
  assetId: string;
  status: string;
  activeMaintenanceId: string | null;
  canMaintain: boolean;
}) {
  const { run, loading } = useAction();
  const options = MANUAL_TRANSITIONS[status] ?? [];

  if (status === "ASSIGNED") {
    return (
      <p className="text-xs text-muted-foreground">
        Status changes are unavailable while the asset is assigned — return it first.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <Label htmlFor={`status-${assetId}`}>Change status</Label>
      <div className="flex items-center gap-2">
        <Select
          id={`status-${assetId}`}
          value=""
          disabled={loading || options.length === 0}
          className="w-52"
          onChange={(event) => {
            const next = event.target.value;
            if (!next) return;
            void run(() => setAssetStatusAction(assetId, next), {
              successMessage: `Status changed to ${next.replace(/_/g, " ").toLowerCase()}.`,
            });
          }}
        >
          <option value="">Select new status…</option>
          {options.map((option) => (
            <option key={option} value={option}>{option.replace(/_/g, " ")}</option>
          ))}
        </Select>
        {status === "UNDER_REPAIR" && activeMaintenanceId && canMaintain ? (
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
    </div>
  );
}
