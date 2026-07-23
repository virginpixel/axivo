"use client";

import { useState } from "react";
import { Pencil, Plus, Power, Trash2, X } from "lucide-react";
import {
  createCompanyAction,
  updateCompanyAction,
  setCompanyActiveAction,
  createDepartmentAction,
  updateDepartmentAction,
  setDepartmentActiveAction,
  createLocationAction,
  updateLocationAction,
  setLocationActiveAction,
  createPositionAction,
  updatePositionAction,
  setPositionActiveAction,
  createApprovalRoleAction,
  updateApprovalRoleAction,
  setApprovalRoleActiveAction,
  assignApprovalRolePeopleAction,
  removeApprovalRoleAssignmentAction,
  assignDepartmentHeadAction,
  removeDepartmentHeadAction,
} from "@/modules/organization/actions";
import { Combobox } from "@/shared/ui/combobox";
import { useAction } from "@/shared/ui/use-action";
import { Button } from "@/shared/ui/button";
import { Input, Textarea, Select, Label, FieldError } from "@/shared/ui/input";
import { Dialog, DialogContent, DialogTrigger } from "@/shared/ui/dialog";

// ---------------------------------------------------------------------------
// Companies
// ---------------------------------------------------------------------------

export function CompanyDialog({
  company,
}: {
  company?: {
    id: string;
    name: string;
    code: string;
    description: string | null;
  };
}) {
  const { run, loading, fieldErrors } = useAction();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    name: company?.name ?? "",
    code: company?.code ?? "",
    description: company?.description ?? "",
  });

  async function submit() {
    // Timezone and currency are global settings (Settings → General), not per company.
    const payload = {
      name: form.name,
      code: form.code,
      description: form.description || undefined,
    };
    await run(
      () => (company ? updateCompanyAction(company.id, payload) : createCompanyAction(payload)),
      {
        successMessage: company ? "Company updated." : "Company created.",
        onSuccess: () => setOpen(false),
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {company ? (
          <Button variant="ghost" size="icon" aria-label={`Edit ${company.name}`}>
            <Pencil className="h-4 w-4" />
          </Button>
        ) : (
          <Button size="sm">
            <Plus className="h-4 w-4" /> New company
          </Button>
        )}
      </DialogTrigger>
      <DialogContent title={company ? "Edit company" : "New company"}>
        <div className="space-y-3">
          <div>
            <Label htmlFor="company-name" required>Name</Label>
            <Input id="company-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <FieldError message={fieldErrors.name} />
          </div>
          <div>
            <Label htmlFor="company-code" required>Code</Label>
            <Input id="company-code" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
            <FieldError message={fieldErrors.code} />
          </div>
          <div>
            <Label htmlFor="company-description">Description</Label>
            <Textarea id="company-description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={submit} loading={loading}>{company ? "Save changes" : "Create company"}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Departments (with inline Department Heads, SDS Doc 06 Ch3/7)
// ---------------------------------------------------------------------------

export function DepartmentDialog({
  companies,
  peopleByCompany,
  department,
}: {
  companies: { id: string; name: string }[];
  peopleByCompany: Record<string, { id: string; name: string }[]>;
  department?: {
    id: string;
    companyId: string;
    name: string;
    description: string | null;
    headPersonIds: string[];
  };
}) {
  const { run, loading, fieldErrors } = useAction();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    companyId: department?.companyId ?? companies[0]?.id ?? "",
    name: department?.name ?? "",
    description: department?.description ?? "",
    headPersonIds: department?.headPersonIds ?? [],
  });
  const people = peopleByCompany[form.companyId] ?? [];

  async function submit() {
    const payload = {
      companyId: form.companyId,
      name: form.name,
      description: form.description || undefined,
      headPersonIds: form.headPersonIds,
    };
    await run(
      () => (department ? updateDepartmentAction(department.id, payload) : createDepartmentAction(payload)),
      {
        successMessage: department ? "Department updated." : "Department created.",
        onSuccess: () => setOpen(false),
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {department ? (
          <Button variant="ghost" size="icon" aria-label={`Edit ${department.name}`}>
            <Pencil className="h-4 w-4" />
          </Button>
        ) : (
          <Button size="sm">
            <Plus className="h-4 w-4" /> New department
          </Button>
        )}
      </DialogTrigger>
      <DialogContent
        title={department ? "Edit department" : "New department"}
        description="Department Head approval steps route to the heads selected here."
      >
        <div className="space-y-3">
          <div>
            <Label htmlFor="dept-company" required>Company</Label>
            <Select
              id="dept-company"
              value={form.companyId}
              disabled={!!department}
              onChange={(e) => setForm({ ...form, companyId: e.target.value, headPersonIds: [] })}
            >
              {companies.map((company) => (
                <option key={company.id} value={company.id}>{company.name}</option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="dept-name" required>Department name</Label>
            <Input id="dept-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <FieldError message={fieldErrors.name} />
          </div>
          <div>
            <Label htmlFor="dept-description">Description</Label>
            <Textarea id="dept-description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          <div>
            <Label>Department Head(s)</Label>
            {people.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Add employees to this company first, then assign heads here.
              </p>
            ) : (
              <div className="mt-1 grid max-h-48 gap-1.5 overflow-y-auto rounded-md border bg-muted/30 p-3 sm:grid-cols-2">
                {people.map((person) => (
                  <label key={person.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={form.headPersonIds.includes(person.id)}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          headPersonIds: event.target.checked
                            ? [...current.headPersonIds, person.id]
                            : current.headPersonIds.filter((id) => id !== person.id),
                        }))
                      }
                      className="h-4 w-4"
                    />
                    {person.name}
                  </label>
                ))}
              </div>
            )}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={submit} loading={loading}>
              {department ? "Save changes" : "Create department"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Locations / Positions (shared dialog; locations are managed under Settings)
// ---------------------------------------------------------------------------

const ENTITY_ACTIONS = {
  location: { create: createLocationAction, update: updateLocationAction },
  position: { create: createPositionAction, update: updatePositionAction },
} as const;

export function OrgEntityDialog({
  entity,
  companies,
  record,
}: {
  entity: "location" | "position";
  companies: { id: string; name: string }[];
  record?: { id: string; companyId: string; name: string; code: string | null; description: string | null };
}) {
  const { run, loading, fieldErrors } = useAction();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    companyId: record?.companyId ?? companies[0]?.id ?? "",
    name: record?.name ?? "",
    code: record?.code ?? "",
    description: record?.description ?? "",
  });
  const label = entity.charAt(0).toUpperCase() + entity.slice(1);

  async function submit() {
    const payload = {
      companyId: form.companyId,
      name: form.name,
      code: form.code || undefined,
      description: form.description || undefined,
    };
    const actions = ENTITY_ACTIONS[entity];
    await run(
      () => (record ? actions.update(record.id, payload) : actions.create(payload)),
      { successMessage: `${label} ${record ? "updated" : "created"}.`, onSuccess: () => setOpen(false) },
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {record ? (
          <Button variant="ghost" size="icon" aria-label={`Edit ${record.name}`}>
            <Pencil className="h-4 w-4" />
          </Button>
        ) : (
          <Button size="sm">
            <Plus className="h-4 w-4" /> New {entity}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent title={record ? `Edit ${entity}` : `New ${entity}`}>
        <div className="space-y-3">
          <div>
            <Label htmlFor={`${entity}-company`} required>Company</Label>
            <Select
              id={`${entity}-company`}
              value={form.companyId}
              disabled={!!record}
              onChange={(e) => setForm({ ...form, companyId: e.target.value })}
            >
              {companies.map((company) => (
                <option key={company.id} value={company.id}>{company.name}</option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor={`${entity}-name`} required>Name</Label>
            <Input id={`${entity}-name`} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <FieldError message={fieldErrors.name} />
          </div>
          {entity !== "location" ? (
            <div>
              <Label htmlFor={`${entity}-code`}>Code</Label>
              <Input id={`${entity}-code`} value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
            </div>
          ) : null}
          <div>
            <Label htmlFor={`${entity}-description`}>Description</Label>
            <Textarea id={`${entity}-description`} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={submit} loading={loading}>{record ? "Save changes" : `Create ${entity}`}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Enable / disable toggle
// ---------------------------------------------------------------------------

const TOGGLE_ACTIONS = {
  company: setCompanyActiveAction,
  department: setDepartmentActiveAction,
  location: setLocationActiveAction,
  position: setPositionActiveAction,
  approvalRole: setApprovalRoleActiveAction,
} as const;

export function ToggleActiveButton({
  entity,
  id,
  isActive,
}: {
  entity: keyof typeof TOGGLE_ACTIONS;
  id: string;
  isActive: boolean;
}) {
  const { run, loading } = useAction();
  return (
    <Button
      variant="ghost"
      size="icon"
      loading={loading}
      aria-label={isActive ? "Disable" : "Enable"}
      title={isActive ? "Disable" : "Enable"}
      onClick={() =>
        run(() => TOGGLE_ACTIONS[entity](id, !isActive), {
          successMessage: isActive ? "Disabled." : "Enabled.",
        })
      }
    >
      <Power className={`h-4 w-4 ${isActive ? "text-success" : "text-muted-foreground"}`} />
    </Button>
  );
}

// ---------------------------------------------------------------------------
// Approval roles
// ---------------------------------------------------------------------------

export function ApprovalRoleDialog({
  role,
}: {
  role?: { id: string; name: string; description: string | null };
}) {
  const { run, loading, fieldErrors } = useAction();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: role?.name ?? "", description: role?.description ?? "" });

  async function submit() {
    const payload = { name: form.name, description: form.description || undefined };
    await run(
      () => (role ? updateApprovalRoleAction(role.id, payload) : createApprovalRoleAction(payload)),
      { successMessage: role ? "Approval role updated." : "Approval role created.", onSuccess: () => setOpen(false) },
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {role ? (
          <Button variant="ghost" size="icon" aria-label={`Edit ${role.name}`}>
            <Pencil className="h-4 w-4" />
          </Button>
        ) : (
          <Button size="sm">
            <Plus className="h-4 w-4" /> New approval role
          </Button>
        )}
      </DialogTrigger>
      <DialogContent title={role ? "Edit approval role" : "New approval role"}>
        <div className="space-y-3">
          <div>
            <Label htmlFor="role-name" required>Role name</Label>
            <Input id="role-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <FieldError message={fieldErrors.name} />
          </div>
          <div>
            <Label htmlFor="role-description">Description</Label>
            <Textarea id="role-description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={submit} loading={loading}>{role ? "Save changes" : "Create role"}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Approval role assignments & department heads
// ---------------------------------------------------------------------------

export function AssignRoleDialog({
  companies,
  roles,
  peopleByCompany,
}: {
  companies: { id: string; name: string }[];
  roles: { id: string; name: string }[];
  peopleByCompany: Record<string, { id: string; name: string }[]>;
}) {
  const { run, loading } = useAction();
  const [open, setOpen] = useState(false);
  const [companyId, setCompanyId] = useState(companies[0]?.id ?? "");
  const [approvalRoleId, setApprovalRoleId] = useState(roles[0]?.id ?? "");
  const [personIds, setPersonIds] = useState<string[]>([]);
  const people = peopleByCompany[companyId] ?? [];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="h-4 w-4" /> Assign approver
        </Button>
      </DialogTrigger>
      <DialogContent title="Assign approval role" description="Assign one or more people; approvers act through secure email links and do not need portal accounts.">
        <div className="space-y-3">
          <div>
            <Label htmlFor="assign-company" required>Company</Label>
            <Select id="assign-company" value={companyId} onChange={(e) => { setCompanyId(e.target.value); setPersonIds([]); }}>
              {companies.map((company) => (
                <option key={company.id} value={company.id}>{company.name}</option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="assign-role" required>Approval role</Label>
            <Select id="assign-role" value={approvalRoleId} onChange={(e) => setApprovalRoleId(e.target.value)}>
              {roles.map((role) => (
                <option key={role.id} value={role.id}>{role.name}</option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="assign-person" required>People</Label>
            {/* Several at once, so a company can have two IT Implementation
                staff without adding a record each. */}
            <Combobox
              id="assign-person"
              value=""
              placeholder="Search people to add…"
              options={people
                .filter((person) => !personIds.includes(person.id))
                .map((person) => ({ value: person.id, label: person.name }))}
              onChange={(value) => {
                if (value) setPersonIds((current) => [...current, value]);
              }}
            />
            {personIds.length > 0 ? (
              <ul className="mt-2 flex flex-wrap gap-1">
                {personIds.map((id) => {
                  const person = people.find((entry) => entry.id === id);
                  return (
                    <li
                      key={id}
                      className="flex items-center gap-1 rounded-full border bg-muted/40 py-1 pl-3 pr-1 text-xs"
                    >
                      {person?.name ?? id}
                      <button
                        type="button"
                        aria-label={`Remove ${person?.name ?? "person"}`}
                        className="rounded-full p-0.5 hover:bg-accent"
                        onClick={() => setPersonIds((current) => current.filter((entry) => entry !== id))}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              loading={loading}
              disabled={personIds.length === 0}
              onClick={() =>
                run(() => assignApprovalRolePeopleAction({ companyId, approvalRoleId, personIds }), {
                  successMessage: personIds.length > 1 ? "Approvers assigned." : "Approver assigned.",
                  onSuccess: () => {
                    setPersonIds([]);
                    setOpen(false);
                  },
                })
              }
            >
              Assign
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function RemoveAssignmentButton({ assignmentId }: { assignmentId: string }) {
  const { run, loading } = useAction();
  return (
    <Button
      variant="ghost"
      size="icon"
      loading={loading}
      aria-label="Remove assignment"
      title="Remove assignment"
      onClick={() =>
        run(() => removeApprovalRoleAssignmentAction(assignmentId), { successMessage: "Assignment removed." })
      }
    >
      <Trash2 className="h-4 w-4 text-destructive" />
    </Button>
  );
}

export function AssignHeadDialog({
  departmentsByCompany,
  peopleByCompany,
  companies,
}: {
  companies: { id: string; name: string }[];
  departmentsByCompany: Record<string, { id: string; name: string }[]>;
  peopleByCompany: Record<string, { id: string; name: string }[]>;
}) {
  const { run, loading } = useAction();
  const [open, setOpen] = useState(false);
  const [companyId, setCompanyId] = useState(companies[0]?.id ?? "");
  const [departmentId, setDepartmentId] = useState("");
  const [personId, setPersonId] = useState("");

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="h-4 w-4" /> Assign department head
        </Button>
      </DialogTrigger>
      <DialogContent title="Assign Department Head" description="Department Head approval steps route to the Requested For employee's department heads.">
        <div className="space-y-3">
          <div>
            <Label htmlFor="head-company" required>Company</Label>
            <Select
              id="head-company"
              value={companyId}
              onChange={(e) => { setCompanyId(e.target.value); setDepartmentId(""); setPersonId(""); }}
            >
              {companies.map((company) => (
                <option key={company.id} value={company.id}>{company.name}</option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="head-department" required>Department</Label>
            <Select id="head-department" value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
              <option value="">Select a department…</option>
              {(departmentsByCompany[companyId] ?? []).map((department) => (
                <option key={department.id} value={department.id}>{department.name}</option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="head-person" required>Person</Label>
            <Select id="head-person" value={personId} onChange={(e) => setPersonId(e.target.value)}>
              <option value="">Select a person…</option>
              {(peopleByCompany[companyId] ?? []).map((person) => (
                <option key={person.id} value={person.id}>{person.name}</option>
              ))}
            </Select>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              loading={loading}
              disabled={!departmentId || !personId}
              onClick={() =>
                run(() => assignDepartmentHeadAction({ departmentId, personId }), {
                  successMessage: "Department Head assigned.",
                  onSuccess: () => setOpen(false),
                })
              }
            >
              Assign
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function RemoveHeadButton({ assignmentId }: { assignmentId: string }) {
  const { run, loading } = useAction();
  return (
    <Button
      variant="ghost"
      size="icon"
      loading={loading}
      aria-label="Remove Department Head"
      title="Remove Department Head"
      onClick={() => run(() => removeDepartmentHeadAction(assignmentId), { successMessage: "Assignment removed." })}
    >
      <Trash2 className="h-4 w-4 text-destructive" />
    </Button>
  );
}
