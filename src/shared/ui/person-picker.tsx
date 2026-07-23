"use client";

import { useState } from "react";
import { UserPlus } from "lucide-react";
import { quickCreatePersonAction } from "@/modules/people/actions";
import { useAction } from "@/shared/ui/use-action";
import { Button } from "@/shared/ui/button";
import { Combobox } from "@/shared/ui/combobox";
import { Input, Label, FieldError } from "@/shared/ui/input";
import { Dialog, DialogContent, DialogTrigger } from "@/shared/ui/dialog";

export interface PersonOption {
  id: string;
  name: string;
}

/**
 * Searchable person picker with an inline "new person" mini-dialog, so a person
 * can be created on the fly from asset/contract forms without leaving the page.
 */
export function PersonPicker({
  id,
  value,
  onChange,
  people,
  companyId,
  placeholder = "Select person...",
  emptyLabel,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  people: PersonOption[];
  companyId: string;
  placeholder?: string;
  emptyLabel?: string;
}) {
  const [extra, setExtra] = useState<PersonOption[]>([]);
  const all = [...people, ...extra];

  return (
    <div className="flex items-center gap-2">
      <div className="min-w-0 flex-1">
        <Combobox
          id={id}
          value={value}
          placeholder={placeholder}
          emptyLabel={emptyLabel}
          options={all.map((person) => ({ value: person.id, label: person.name }))}
          onChange={onChange}
        />
      </div>
      <NewPersonDialog
        companyId={companyId}
        onCreated={(person) => {
          setExtra((current) => [...current, person]);
          onChange(person.id);
        }}
      />
    </div>
  );
}

function NewPersonDialog({ companyId, onCreated }: { companyId: string; onCreated: (person: PersonOption) => void }) {
  const { run, loading, fieldErrors } = useAction();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ firstName: "", lastName: "", email: "", employeeId: "" });

  function submit() {
    run(
      () =>
        quickCreatePersonAction({
          companyId,
          firstName: form.firstName,
          lastName: form.lastName,
          email: form.email,
          employeeId: form.employeeId,
        }),
      {
        successMessage: "Person created.",
        onSuccess: (data) => {
          onCreated({ id: data.value, name: data.label });
          setForm({ firstName: "", lastName: "", email: "", employeeId: "" });
          setOpen(false);
        },
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="icon" aria-label="Add new person" title="Add new person" disabled={!companyId}>
          <UserPlus className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent title="New person">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="qp-first" required>First name</Label>
              <Input id="qp-first" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
              <FieldError message={fieldErrors.firstName} />
            </div>
            <div>
              <Label htmlFor="qp-last" required>Last name</Label>
              <Input id="qp-last" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
              <FieldError message={fieldErrors.lastName} />
            </div>
          </div>
          <div>
            <Label htmlFor="qp-email" required>Work email</Label>
            <Input id="qp-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            <FieldError message={fieldErrors.email} />
          </div>
          <div>
            <Label htmlFor="qp-empid" required>Employee ID</Label>
            <Input id="qp-empid" value={form.employeeId} onChange={(e) => setForm({ ...form, employeeId: e.target.value })} />
            <FieldError message={fieldErrors.employeeId} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button loading={loading} onClick={submit} disabled={!form.firstName || !form.lastName || !form.email || !form.employeeId}>
              Create person
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
