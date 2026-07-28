"use client";

import { useState } from "react";
import { Pencil, Plus, KeyRound, UserPlus } from "lucide-react";
import {
  createPersonAction,
  updatePersonAction,
  setEmploymentStatusAction,
  createSystemUserAction,
  resetSystemUserPasswordAction,
  changeSystemUserRoleAction,
  setSystemUserEnabledAction,
} from "@/modules/people/actions";
import { useAction } from "@/shared/ui/use-action";
import { Button } from "@/shared/ui/button";
import { quickCreateDepartmentAction, quickCreatePositionAction, quickCreateLocationAction } from "@/modules/catalogs/actions";
import { useToast } from "@/shared/ui/toast";
import { Input, Select, Label, FieldError, HelperText } from "@/shared/ui/input";
import { Combobox } from "@/shared/ui/combobox";
import type { ActionResult } from "@/shared/errors";

function useCreateHandler() {
  const { toast } = useToast();
  return function handler(fn: (label: string) => Promise<ActionResult<{ value: string; label: string }>>) {
    return async (label: string) => {
      const result = await fn(label);
      if (result.ok) return result.data;
      toast("error", result.error);
      return null;
    };
  };
}
import { Dialog, DialogContent, DialogTrigger } from "@/shared/ui/dialog";

export interface OrgData {
  companies: { id: string; name: string }[];
  departments: { id: string; name: string; companyId: string }[];
  positions: { id: string; name: string; companyId: string }[];
  locations: { id: string; name: string; companyId: string }[];
}

export interface PersonRecord {
  id: string;
  companyId: string;
  departmentId: string | null;
  positionId: string | null;
  locationId: string | null;
  employeeId: string;
  firstName: string;
  lastName: string;
  email: string;
  personalEmail: string | null;
  phone: string | null;
  extension: string | null;
  employmentStatus: string;
}

export function PersonDialog({ orgData, person }: { orgData: OrgData; person?: PersonRecord }) {
  const { run, loading, fieldErrors } = useAction();
  const createHandler = useCreateHandler();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    companyId: person?.companyId ?? orgData.companies[0]?.id ?? "",
    departmentId: person?.departmentId ?? "",
    positionId: person?.positionId ?? "",
    locationId: person?.locationId ?? "",
    employeeId: person?.employeeId ?? "",
    firstName: person?.firstName ?? "",
    lastName: person?.lastName ?? "",
    email: person?.email ?? "",
    personalEmail: person?.personalEmail ?? "",
    phone: person?.phone ?? "",
    extension: person?.extension ?? "",
    employmentStatus: person?.employmentStatus ?? "ACTIVE",
  });

  const departments = orgData.departments.filter((d) => d.companyId === form.companyId);
  const positions = orgData.positions.filter((p) => p.companyId === form.companyId);
  const locations = orgData.locations.filter((l) => l.companyId === form.companyId);

  async function submit() {
    const payload = {
      companyId: form.companyId,
      departmentId: form.departmentId || undefined,
      positionId: form.positionId || undefined,
      locationId: form.locationId || undefined,
      employeeId: form.employeeId,
      firstName: form.firstName,
      lastName: form.lastName,
      email: form.email,
      personalEmail: form.personalEmail || undefined,
      phone: form.phone || undefined,
      extension: form.extension || undefined,
      employmentStatus: form.employmentStatus,
    };
    await run(
      () => (person ? updatePersonAction(person.id, payload) : createPersonAction(payload)),
      { successMessage: person ? "Employee updated." : "Employee created.", onSuccess: () => setOpen(false) },
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {person ? (
          <Button variant="outline" size="sm">
            <Pencil className="h-4 w-4" /> Edit profile
          </Button>
        ) : (
          <Button size="sm">
            <Plus className="h-4 w-4" /> New employee
          </Button>
        )}
      </DialogTrigger>
      <DialogContent title={person ? "Edit employee" : "New employee"} wide>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="p-company" required>Company</Label>
            <Combobox
              id="p-company"
              value={form.companyId}
              disabled={!!person}
              options={orgData.companies.map((company) => ({ value: company.id, label: company.name }))}
              onChange={(value) => setForm({ ...form, companyId: value, departmentId: "", positionId: "", locationId: "" })}
            />
            {person ? <HelperText>Use the company transfer function on the profile page.</HelperText> : null}
          </div>
          <div>
            <Label htmlFor="p-employee-id" required>Employee ID</Label>
            <Input id="p-employee-id" value={form.employeeId} onChange={(e) => setForm({ ...form, employeeId: e.target.value })} />
            <FieldError message={fieldErrors.employeeId} />
          </div>
          <div>
            <Label htmlFor="p-first" required>First name</Label>
            <Input id="p-first" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
            <FieldError message={fieldErrors.firstName} />
          </div>
          <div>
            <Label htmlFor="p-last" required>Last name</Label>
            <Input id="p-last" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
            <FieldError message={fieldErrors.lastName} />
          </div>
          <div>
            <Label htmlFor="p-email" required>Work email</Label>
            <Input id="p-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            <FieldError message={fieldErrors.email} />
          </div>
          <div>
            <Label htmlFor="p-personal-email">Personal email</Label>
            <Input id="p-personal-email" type="email" value={form.personalEmail} onChange={(e) => setForm({ ...form, personalEmail: e.target.value })} />
          </div>
          <div>
            <Label htmlFor="p-department">Department</Label>
            <Combobox
              id="p-department" value={form.departmentId}
              placeholder="No department" emptyLabel="No department"
              options={departments.map((department) => ({ value: department.id, label: department.name }))}
              onChange={(value) => setForm({ ...form, departmentId: value })}
              onCreate={form.companyId ? createHandler((label) => quickCreateDepartmentAction(form.companyId, label)) : undefined}
              createNoun="department"
            />
            <FieldError message={fieldErrors.departmentId} />
          </div>
          <div>
            <Label htmlFor="p-position">Position</Label>
            <Combobox
              id="p-position" value={form.positionId}
              placeholder="No position" emptyLabel="No position"
              options={positions.map((position) => ({ value: position.id, label: position.name }))}
              onChange={(value) => setForm({ ...form, positionId: value })}
              onCreate={form.companyId ? createHandler((label) => quickCreatePositionAction(form.companyId, label)) : undefined}
              createNoun="position"
            />
          </div>
          <div>
            <Label htmlFor="p-location">Location</Label>
            <Combobox
              id="p-location" value={form.locationId}
              placeholder="No location" emptyLabel="No location"
              options={locations.map((location) => ({ value: location.id, label: location.name }))}
              onChange={(value) => setForm({ ...form, locationId: value })}
              onCreate={form.companyId ? createHandler((label) => quickCreateLocationAction(form.companyId, label)) : undefined}
              createNoun="location"
            />
          </div>
          <div>
            <Label htmlFor="p-phone">Phone</Label>
            <Input id="p-phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </div>
          <div>
            <Label htmlFor="p-extension">Extension</Label>
            <Input
              id="p-extension"
              value={form.extension}
              onChange={(e) => setForm({ ...form, extension: e.target.value })}
              placeholder="Desk extension"
            />
          </div>
          <div>
            <Label htmlFor="p-status" required>Employment status</Label>
            <Select id="p-status" value={form.employmentStatus} onChange={(e) => setForm({ ...form, employmentStatus: e.target.value })}>
              {/* Resigned and Terminated are set by completing a clearance. */}
              {SELECTABLE_STATUSES.map((status) => (
                <option key={status} value={status}>{status.replace("_", " ")}</option>
              ))}
            </Select>
          </div>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={submit} loading={loading}>{person ? "Save changes" : "Create employee"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Clearance completion sets Resigned/Terminated, so they are not hand-picked. */
const SELECTABLE_STATUSES = ["ACTIVE", "ON_LEAVE", "SUSPENDED"];

export function EmploymentStatusSelect({ personId, current }: { personId: string; current: string }) {
  const { run, loading } = useAction();
  return (
    <Select
      value={current}
      disabled={loading}
      aria-label="Change employment status"
      className="w-44"
      onChange={(event) =>
        run(() => setEmploymentStatusAction(personId, event.target.value), {
          successMessage: "Employment status updated.",
        })
      }
    >
      {/* The current value may be Resigned/Terminated from a clearance; keep it
          listed so the control shows it, but do not offer it as a new choice. */}
      {(SELECTABLE_STATUSES.includes(current) ? SELECTABLE_STATUSES : [current, ...SELECTABLE_STATUSES]).map((status) => (
        <option key={status} value={status}>{status.replace("_", " ")}</option>
      ))}
    </Select>
  );
}

export function CreateAccountDialog({
  personId,
  roles,
}: {
  personId: string;
  roles: { id: string; name: string }[];
}) {
  const { run, loading, fieldErrors } = useAction();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ username: "", systemRoleId: roles[0]?.id ?? "", password: "" });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <UserPlus className="h-4 w-4" /> Create portal account
        </Button>
      </DialogTrigger>
      <DialogContent title="Create portal account" description="Only IT portal users can sign into Axivo.">
        <div className="space-y-3">
          <div>
            <Label htmlFor="acc-username" required>Username</Label>
            <Input id="acc-username" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} autoComplete="off" />
            <FieldError message={fieldErrors.username} />
          </div>
          <div>
            <Label htmlFor="acc-role" required>System role</Label>
            <Select id="acc-role" value={form.systemRoleId} onChange={(e) => setForm({ ...form, systemRoleId: e.target.value })}>
              {roles.map((role) => (
                <option key={role.id} value={role.id}>{role.name}</option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="acc-password" required>Initial password</Label>
            <Input id="acc-password" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} autoComplete="new-password" />
            <HelperText>Minimum 12 characters with uppercase, lowercase, number and special character.</HelperText>
            <FieldError message={fieldErrors.password} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              loading={loading}
              onClick={() =>
                run(() => createSystemUserAction({ personId, ...form }), {
                  successMessage: "Portal account created.",
                  onSuccess: () => setOpen(false),
                })
              }
            >
              Create account
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function AccountControls({
  systemUserId,
  isEnabled,
  currentRoleId,
  roles,
}: {
  systemUserId: string;
  isEnabled: boolean;
  currentRoleId: string;
  roles: { id: string; name: string }[];
}) {
  const { run, loading, fieldErrors } = useAction();
  const [resetOpen, setResetOpen] = useState(false);
  const [newPassword, setNewPassword] = useState("");

  return (
    <div className="flex w-full flex-col items-stretch gap-2 sm:w-44">
      <Select
        value={currentRoleId}
        disabled={loading}
        aria-label="Change system role"
        className="w-full"
        onChange={(event) =>
          run(() => changeSystemUserRoleAction({ systemUserId, systemRoleId: event.target.value }), {
            successMessage: "System role updated.",
          })
        }
      >
        {roles.map((role) => (
          <option key={role.id} value={role.id}>{role.name}</option>
        ))}
      </Select>
      <Button
        variant="outline"
        size="sm"
        className="w-full justify-center"
        loading={loading}
        onClick={() =>
          run(() => setSystemUserEnabledAction(systemUserId, !isEnabled), {
            successMessage: isEnabled ? "Account disabled." : "Account enabled.",
          })
        }
      >
        {isEnabled ? "Disable account" : "Enable account"}
      </Button>
      <Dialog open={resetOpen} onOpenChange={setResetOpen}>
        <DialogTrigger asChild>
          <Button variant="outline" size="sm" className="w-full justify-center">
            <KeyRound className="h-4 w-4" /> Reset password
          </Button>
        </DialogTrigger>
        <DialogContent title="Reset password" description="Existing sessions will be signed out.">
          <Label htmlFor="reset-password" required>New password</Label>
          <Input
            id="reset-password"
            type="password"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            autoComplete="new-password"
          />
          <FieldError message={fieldErrors.newPassword} />
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setResetOpen(false)}>Cancel</Button>
            <Button
              loading={loading}
              onClick={() =>
                run(() => resetSystemUserPasswordAction({ systemUserId, newPassword }), {
                  successMessage: "Password reset.",
                  onSuccess: () => {
                    setResetOpen(false);
                    setNewPassword("");
                  },
                })
              }
            >
              Reset password
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
