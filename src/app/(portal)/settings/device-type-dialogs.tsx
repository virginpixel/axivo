"use client";

import { useState } from "react";
import { Pencil, Plus } from "lucide-react";
import {
  createDeviceTypeAction,
  updateDeviceTypeAction,
  setDeviceTypeActiveAction,
} from "@/modules/infrastructure/actions";
import { DEVICE_KINDS, KIND_LABELS, type DeviceKind } from "@/modules/infrastructure/validators";
import { useAction } from "@/shared/ui/use-action";
import { Button } from "@/shared/ui/button";
import { Input, Select, Label, FieldError } from "@/shared/ui/input";
import { Dialog, DialogContent, DialogTrigger } from "@/shared/ui/dialog";

export function DeviceTypeDialog({ type }: { type?: { id: string; name: string; kind: DeviceKind } }) {
  const { run, loading, fieldErrors } = useAction();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(type?.name ?? "");
  const [kind, setKind] = useState<DeviceKind>(type?.kind ?? "NETWORK");

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) {
          setName(type?.name ?? "");
          setKind(type?.kind ?? "NETWORK");
        }
        setOpen(next);
      }}
    >
      <DialogTrigger asChild>
        {type ? (
          <Button variant="ghost" size="icon" aria-label={`Edit ${type.name}`}><Pencil className="h-4 w-4" /></Button>
        ) : (
          <Button size="sm"><Plus className="h-4 w-4" /> New device type</Button>
        )}
      </DialogTrigger>
      <DialogContent title={type ? `Edit ${type.name}` : "New device type"}>
        <div className="grid gap-3">
          <div>
            <Label htmlFor="dt-name" required>Name</Label>
            <Input id="dt-name" value={name} onChange={(e) => setName(e.target.value)} />
            <FieldError message={fieldErrors.name} />
          </div>
          <div>
            <Label htmlFor="dt-kind" required>Listed under</Label>
            <Select id="dt-kind" value={kind} onChange={(e) => setKind(e.target.value as DeviceKind)}>
              {DEVICE_KINDS.map((value) => (
                <option key={value} value={value}>{value === "NETWORK" ? "Network devices" : "Servers & hosts"}</option>
              ))}
            </Select>
            <FieldError message={fieldErrors.kind} />
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button
            loading={loading}
            onClick={() =>
              run(() => (type ? updateDeviceTypeAction(type.id, { name, kind }) : createDeviceTypeAction({ name, kind })), {
                successMessage: type ? "Saved." : `Added ${KIND_LABELS[kind].toLowerCase()} type.`,
                onSuccess: () => setOpen(false),
              })
            }
          >
            {type ? "Save" : "Add"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function DeviceTypeToggle({ id, isActive }: { id: string; isActive: boolean }) {
  const { run, loading } = useAction();
  return (
    <Button
      variant="ghost"
      size="sm"
      loading={loading}
      onClick={() => run(() => setDeviceTypeActiveAction(id, !isActive), { successMessage: isActive ? "Deactivated." : "Activated." })}
    >
      {isActive ? "Deactivate" : "Activate"}
    </Button>
  );
}
