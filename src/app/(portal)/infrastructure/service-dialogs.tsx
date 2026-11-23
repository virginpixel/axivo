"use client";

import { useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { createServiceAction, updateServiceAction, deleteServiceAction } from "@/modules/infrastructure/actions";
import { useAction } from "@/shared/ui/use-action";
import { Button } from "@/shared/ui/button";
import { Input, Textarea, Label, FieldError, HelperText } from "@/shared/ui/input";
import { Dialog, DialogContent, DialogTrigger, ConfirmDialog } from "@/shared/ui/dialog";

export interface ServiceRecord {
  id: string;
  name: string;
  ports: string | null;
  url: string | null;
  notes: string | null;
}

/** Add or change one service on a server: a Docker stack, a web app, a database. */
export function ServiceDialog({ deviceId, service }: { deviceId: string; service?: ServiceRecord }) {
  const { run, loading, fieldErrors } = useAction();
  const [open, setOpen] = useState(false);
  const initial = () => ({
    name: service?.name ?? "",
    ports: service?.ports ?? "",
    url: service?.url ?? "",
    notes: service?.notes ?? "",
  });
  const [form, setForm] = useState(initial);
  const set = (patch: Partial<ReturnType<typeof initial>>) => setForm((f) => ({ ...f, ...patch }));

  function save() {
    const payload = { deviceId, ...form };
    run(() => (service ? updateServiceAction(service.id, payload) : createServiceAction(payload)), {
      successMessage: service ? "Service updated." : "Service added.",
      onSuccess: () => setOpen(false),
    });
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (next) setForm(initial()); setOpen(next); }}>
      <DialogTrigger asChild>
        {service ? (
          <Button variant="ghost" size="icon" aria-label={`Edit ${service.name}`} title="Edit"><Pencil className="h-4 w-4" /></Button>
        ) : (
          <Button size="sm" variant="outline"><Plus className="h-4 w-4" /> Add service</Button>
        )}
      </DialogTrigger>
      <DialogContent
        title={service ? "Edit service" : "Add service"}
        description="Something this server offers on the network, such as a Docker stack, and where to reach it."
      >
        <div className="grid gap-4">
          <div>
            <Label htmlFor="service-name" required>Name</Label>
            <Input id="service-name" value={form.name} placeholder="e.g. Portainer" onChange={(e) => set({ name: e.target.value })} />
            <FieldError message={fieldErrors.name} />
          </div>
          <div>
            <Label htmlFor="service-ports">Ports</Label>
            <Input id="service-ports" value={form.ports} placeholder="e.g. 9443, 8000-8010, 53/udp" onChange={(e) => set({ ports: e.target.value })} />
            <FieldError message={fieldErrors.ports} />
            <HelperText>Separate ports with commas. A range is written 8000-8010.</HelperText>
          </div>
          <div>
            <Label htmlFor="service-url">Address</Label>
            <Input id="service-url" value={form.url} placeholder="https://10.100.100.107:9443" onChange={(e) => set({ url: e.target.value })} />
            <FieldError message={fieldErrors.url} />
          </div>
          <div>
            <Label htmlFor="service-notes">Notes</Label>
            <Textarea id="service-notes" rows={2} value={form.notes} onChange={(e) => set({ notes: e.target.value })} />
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button loading={loading} disabled={!form.name.trim()} onClick={save}>{service ? "Save" : "Add"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function RemoveServiceButton({ serviceId, name }: { serviceId: string; name: string }) {
  const { run, loading } = useAction();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="ghost" size="icon" aria-label={`Remove ${name}`} title="Remove" onClick={() => setOpen(true)}>
        <Trash2 className="h-4 w-4" />
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Remove this service?"
        message={`${name} is taken off this server's list. The server itself stays.`}
        confirmLabel="Remove"
        loading={loading}
        onConfirm={() => run(() => deleteServiceAction(serviceId), { successMessage: "Service removed.", onSuccess: () => setOpen(false) })}
      />
    </>
  );
}
