"use client";

import { useState } from "react";
import { Radar } from "lucide-react";
import { requestArpScanAction, setArpScanAction } from "@/modules/infrastructure/actions";
import { useAction } from "@/shared/ui/use-action";
import { Button } from "@/shared/ui/button";
import { Combobox } from "@/shared/ui/combobox";
import { Label } from "@/shared/ui/input";

/**
 * The subnet's ARP reading: on or off for the nightly run, which switch to
 * read, and a button to read it now.
 */
export function ArpControls({
  subnetId, enabled, chosenDeviceId, found, switches, canManage,
}: {
  subnetId: string;
  enabled: boolean;
  /** The switch picked by hand, if any. */
  chosenDeviceId: string | null;
  /** The switch found from the saved configurations, if any. */
  found: { id: string; name: string } | null;
  switches: { id: string; name: string }[];
  canManage: boolean;
}) {
  const { run, loading } = useAction();
  const scan = useAction();
  const [picking, setPicking] = useState(false);
  const save = (next: { enabled: boolean; deviceId: string | null }) =>
    run(() => setArpScanAction(subnetId, next), {
      successMessage: next.enabled !== enabled ? (next.enabled ? "This subnet is read every night." : "Nightly read turned off.") : "Switch saved.",
      onSuccess: () => setPicking(false),
    });
  const readFrom = chosenDeviceId ? switches.find((s) => s.id === chosenDeviceId)?.name : found?.name;

  return (
    <div className="space-y-3">
      <label className={`flex items-center gap-2 text-sm ${canManage ? "cursor-pointer" : ""}`}>
        <input
          type="checkbox"
          className="h-4 w-4 accent-[hsl(var(--primary))]"
          checked={enabled}
          disabled={!canManage || loading}
          onChange={(e) => save({ enabled: e.target.checked, deviceId: chosenDeviceId })}
        />
        Read the ARP table every night
      </label>
      <p className="text-xs text-muted-foreground">
        {readFrom ? (
          <>
            Read from <span className="font-medium text-foreground">{readFrom}</span>
            {chosenDeviceId ? " (chosen here)." : ", the switch that routes it (from its saved configuration)."}
          </>
        ) : (
          "No switch is known to route this subnet yet. It is found from the core switch's saved configuration after its first backup, or choose it here."
        )}
        {canManage && !picking ? (
          <button type="button" className="ml-1 font-medium text-primary hover:underline" onClick={() => setPicking(true)}>
            {chosenDeviceId ? "Change" : "Choose"}
          </button>
        ) : null}
      </p>
      {picking ? (
        <div>
          <Label htmlFor="arp-switch">Switch that routes this subnet</Label>
          <Combobox
            id="arp-switch"
            value={chosenDeviceId ?? ""}
            placeholder="Select switch"
            emptyLabel={found ? `Use ${found.name}, from its configuration` : "None"}
            options={switches.map((s) => ({ value: s.id, label: s.name }))}
            onChange={(value) => save({ enabled, deviceId: value || null })}
          />
        </div>
      ) : null}
      {canManage ? (
        <Button
          size="sm"
          variant="outline"
          loading={scan.loading}
          disabled={!readFrom}
          onClick={() => scan.run(() => requestArpScanAction(subnetId), { successMessage: "Reading the ARP table. Refresh in a minute." })}
        >
          <Radar className="h-4 w-4" /> Scan now
        </Button>
      ) : null}
    </div>
  );
}
