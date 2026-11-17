"use client";

import { useState } from "react";
import { Cable, Pencil, Trash2 } from "lucide-react";
import { createLinkAction, updateLinkAction, deleteLinkAction } from "@/modules/infrastructure/actions";
import { useAction } from "@/shared/ui/use-action";
import { Button } from "@/shared/ui/button";
import { Input, Textarea, Label, FieldError, HelperText } from "@/shared/ui/input";
import { Combobox } from "@/shared/ui/combobox";
import { Dialog, DialogContent, DialogTrigger, ConfirmDialog } from "@/shared/ui/dialog";

export interface LinkRecord {
  id: string;
  deviceAId: string;
  portA: string | null;
  deviceBId: string;
  portB: string | null;
  notes: string | null;
}

export interface DeviceOption {
  id: string;
  name: string;
  hint?: string;
}

/**
 * Record or change one cable. With `fixedDeviceId` (a device's own page) the
 * first end is that device and only the far end is picked.
 */
export function LinkDialog({
  devices,
  fixedDeviceId,
  link,
  trigger = "button",
}: {
  devices: DeviceOption[];
  fixedDeviceId?: string;
  link?: LinkRecord;
  trigger?: "button" | "icon";
}) {
  const { run, loading, fieldErrors } = useAction();
  const [open, setOpen] = useState(false);
  const initial = () => {
    // Show the fixed device as "this end" whichever way round the cable was stored.
    const flip = !!link && !!fixedDeviceId && link.deviceBId === fixedDeviceId && link.deviceAId !== fixedDeviceId;
    return {
      deviceAId: (flip ? link?.deviceBId : link?.deviceAId) ?? fixedDeviceId ?? "",
      portA: (flip ? link?.portB : link?.portA) ?? "",
      deviceBId: (flip ? link?.deviceAId : link?.deviceBId) ?? "",
      portB: (flip ? link?.portA : link?.portB) ?? "",
      notes: link?.notes ?? "",
      flip,
    };
  };
  const [form, setForm] = useState(initial);
  const set = (patch: Partial<ReturnType<typeof initial>>) => setForm((f) => ({ ...f, ...patch }));
  const options = devices.map((d) => ({ value: d.id, label: d.name, hint: d.hint }));
  const fixedName = devices.find((d) => d.id === fixedDeviceId)?.name;
  // Field errors name the stored ends; map them back when the dialog shows them swapped.
  const errorA = form.flip ? fieldErrors.portB : fieldErrors.portA;
  const errorB = form.flip ? fieldErrors.portA : fieldErrors.portB;

  function save() {
    const payload = { deviceAId: form.deviceAId, portA: form.portA, deviceBId: form.deviceBId, portB: form.portB, notes: form.notes };
    const stored = form.flip
      ? { deviceAId: payload.deviceBId, portA: payload.portB, deviceBId: payload.deviceAId, portB: payload.portA, notes: payload.notes }
      : payload;
    run(() => (link ? updateLinkAction(link.id, stored) : createLinkAction(stored)), {
      successMessage: link ? "Connection updated." : "Connection added.",
      onSuccess: () => setOpen(false),
    });
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (next) setForm(initial()); setOpen(next); }}>
      <DialogTrigger asChild>
        {trigger === "icon" ? (
          <Button variant="ghost" size="icon" aria-label="Edit connection" title="Edit"><Pencil className="h-4 w-4" /></Button>
        ) : (
          <Button size="sm" variant="outline"><Cable className="h-4 w-4" /> Add connection</Button>
        )}
      </DialogTrigger>
      <DialogContent
        title={link ? "Edit connection" : "Add connection"}
        description="Which port on one device the cable goes to, and which port on the other end."
      >
        <div className="grid gap-4">
          <div className="grid gap-3 sm:grid-cols-[1fr_9rem]">
            <div>
              <Label htmlFor="link-a" required>{fixedDeviceId ? "This device" : "Device"}</Label>
              {fixedDeviceId ? (
                <p id="link-a" className="flex h-9 items-center truncate text-sm font-medium">{fixedName}</p>
              ) : (
                <Combobox id="link-a" value={form.deviceAId} placeholder="Select device" options={options} onChange={(v) => set({ deviceAId: v })} />
              )}
              <FieldError message={form.flip ? fieldErrors.deviceBId : fieldErrors.deviceAId} />
            </div>
            <div>
              <Label htmlFor="link-port-a">Port</Label>
              <Input id="link-port-a" value={form.portA} placeholder="Gi1/0/1" onChange={(e) => set({ portA: e.target.value })} />
            </div>
          </div>
          {errorA ? <FieldError message={errorA} /> : null}
          <div className="grid gap-3 sm:grid-cols-[1fr_9rem]">
            <div>
              <Label htmlFor="link-b" required>Connects to</Label>
              <Combobox id="link-b" value={form.deviceBId} placeholder="Select device" options={options} onChange={(v) => set({ deviceBId: v })} />
              <FieldError message={form.flip ? fieldErrors.deviceAId : fieldErrors.deviceBId} />
            </div>
            <div>
              <Label htmlFor="link-port-b">Its port</Label>
              <Input id="link-port-b" value={form.portB} placeholder="Te1/0/14" onChange={(e) => set({ portB: e.target.value })} />
            </div>
          </div>
          {errorB ? <FieldError message={errorB} /> : null}
          <HelperText>Long names are shortened, so GigabitEthernet1/0/1 is saved as Gi1/0/1.</HelperText>
          <div>
            <Label htmlFor="link-notes">Notes</Label>
            <Textarea id="link-notes" rows={2} value={form.notes} onChange={(e) => set({ notes: e.target.value })} />
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button loading={loading} disabled={!form.deviceAId || !form.deviceBId} onClick={save}>
            {link ? "Save" : "Add"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function RemoveLinkButton({ linkId, label }: { linkId: string; label: string }) {
  const { run, loading } = useAction();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="ghost" size="icon" aria-label={`Remove connection ${label}`} title="Remove" onClick={() => setOpen(true)}>
        <Trash2 className="h-4 w-4" />
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Remove this connection?"
        message={`${label}. Both devices stay in the register; only the cable record goes.`}
        confirmLabel="Remove"
        loading={loading}
        onConfirm={() => run(() => deleteLinkAction(linkId), { successMessage: "Connection removed.", onSuccess: () => setOpen(false) })}
      />
    </>
  );
}
