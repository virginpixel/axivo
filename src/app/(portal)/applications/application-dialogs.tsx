"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, Power, PauseCircle, PlayCircle, Trash2 } from "lucide-react";
import {
  createApplicationAction,
  updateApplicationAction,
  setApplicationActiveAction,
  deleteApplicationAction,
  createApplicationRoleAction,
  updateApplicationRoleAction,
  setApplicationRoleActiveAction,
  saveCredentialFieldAction,
  setCredentialFieldActiveAction,
  createAssignmentAction,
  setAssignmentStatusAction,
  removeAssignmentAction,
} from "@/modules/applications/actions";
import { useAction } from "@/shared/ui/use-action";
import { Button } from "@/shared/ui/button";
import { Input, Select, Textarea, Label, FieldError, HelperText } from "@/shared/ui/input";
import { Combobox } from "@/shared/ui/combobox";
import { Dialog, DialogContent, DialogTrigger } from "@/shared/ui/dialog";

export function ApplicationDialog({
  companies,
  workflows = [],
  application,
}: {
  companies: { id: string; name: string }[];
  workflows?: { id: string; name: string; companyId: string }[];
  application?: {
    id: string;
    companyId: string;
    name: string;
    description: string | null;
    allowMultipleAssignments: boolean;
    requiresLicense: boolean;
    isShared: boolean;
    workflowId: string | null;
  };
}) {
  const { run, loading, fieldErrors } = useAction();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    companyId: application?.companyId ?? companies[0]?.id ?? "",
    name: application?.name ?? "",
    description: application?.description ?? "",
    allowMultipleAssignments: application?.allowMultipleAssignments ?? false,
    requiresLicense: application?.requiresLicense ?? false,
    isShared: application?.isShared ?? false,
    workflowId: application?.workflowId ?? "",
  });

  async function submit() {
    const payload = {
      companyId: form.companyId,
      name: form.name,
      description: form.description || undefined,
      workflowId: form.workflowId || undefined,
      allowMultipleAssignments: form.allowMultipleAssignments,
      requiresLicense: form.requiresLicense,
      isShared: form.isShared,
    };
    await run(
      () => (application ? updateApplicationAction(application.id, payload) : createApplicationAction(payload)),
      { successMessage: application ? "Application updated." : "Application created.", onSuccess: () => setOpen(false) },
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {application ? (
          <Button variant="ghost" size="icon" aria-label={`Edit ${application.name}`}>
            <Pencil className="h-4 w-4" />
          </Button>
        ) : (
          <Button size="sm">
            <Plus className="h-4 w-4" /> New application
          </Button>
        )}
      </DialogTrigger>
      <DialogContent title={application ? "Edit application" : "New application"}>
        <div className="space-y-3">
          <div>
            <Label htmlFor="app-company" required>Owning company</Label>
            <Combobox
              id="app-company"
              value={form.companyId}
              disabled={!!application}
              onChange={(value) => setForm({ ...form, companyId: value })}
              options={companies.map((company) => ({ value: company.id, label: company.name }))}
            />
          </div>
          <div>
            <Label htmlFor="app-name" required>Application name</Label>
            <Input id="app-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <FieldError message={fieldErrors.name} />
          </div>
          <div>
            <Label htmlFor="app-description">Description</Label>
            <Textarea id="app-description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            <HelperText>Add a login URL and any other details as custom credential fields.</HelperText>
          </div>
          {workflows.length > 0 ? (
            <div>
              <Label htmlFor="app-workflow">Approval chain</Label>
              <Select
                id="app-workflow"
                value={form.workflowId}
                onChange={(e) => setForm({ ...form, workflowId: e.target.value })}
              >
                <option value="">Use the form&apos;s approval chain</option>
                {workflows
                  .filter((workflow) => workflow.companyId === form.companyId)
                  .map((workflow) => (
                    <option key={workflow.id} value={workflow.id}>{workflow.name}</option>
                  ))}
              </Select>
              <HelperText>
                Set this so requests for this application route to its own approvers, even when they
                arrive through an all-in-one form.
              </HelperText>
            </div>
          ) : null}
          <div className="flex flex-col gap-2 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={form.isShared}
                onChange={(e) => setForm({ ...form, isShared: e.target.checked })}
                className="h-4 w-4"
              />
              Shared: can be assigned to employees of any company
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={form.requiresLicense}
                onChange={(e) => setForm({ ...form, requiresLicense: e.target.checked })}
                className="h-4 w-4"
              />
              Implementation consumes a license seat
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={form.allowMultipleAssignments}
                onChange={(e) => setForm({ ...form, allowMultipleAssignments: e.target.checked })}
                className="h-4 w-4"
              />
              Allow multiple simultaneous assignments per person
            </label>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={submit} loading={loading}>{application ? "Save changes" : "Create application"}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function ApplicationToggle({ id, isActive }: { id: string; isActive: boolean }) {
  const { run, loading } = useAction();
  return (
    <Button
      variant="ghost"
      size="icon"
      loading={loading}
      aria-label={isActive ? "Disable application" : "Enable application"}
      onClick={() =>
        run(() => setApplicationActiveAction(id, !isActive), {
          successMessage: isActive ? "Application disabled." : "Application enabled.",
        })
      }
    >
      <Power className={`h-4 w-4 ${isActive ? "text-success" : "text-muted-foreground"}`} />
    </Button>
  );
}

/** Requests snapshot the application name, so history survives the delete. */
export function ApplicationDeleteButton({ id, name }: { id: string; name: string }) {
  const { run, loading } = useAction();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="ghost" size="icon" aria-label={`Delete ${name}`} title="Delete" onClick={() => setOpen(true)}>
        <Trash2 className="h-4 w-4 text-destructive" />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          title={`Delete ${name}`}
          description="Existing requests keep their own record of this application, so their history stays readable. Active assignments must be removed first."
        >
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              variant="destructive"
              loading={loading}
              onClick={() =>
                run(() => deleteApplicationAction(id), {
                  successMessage: "Application deleted.",
                  onSuccess: () => {
                    setOpen(false);
                    router.push("/applications");
                  },
                })
              }
            >
              Delete application
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function AppRoleDialog({
  applicationId,
  role,
}: {
  applicationId: string;
  role?: { id: string; name: string; description: string | null };
}) {
  const { run, loading, fieldErrors } = useAction();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(role?.name ?? "");
  const [description, setDescription] = useState(role?.description ?? "");

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {role ? (
          <Button variant="ghost" size="icon" className="h-6 w-6" aria-label={`Edit ${role.name}`}>
            <Pencil className="h-3 w-3" />
          </Button>
        ) : (
          <Button variant="ghost" size="sm" className="h-6 px-2 text-xs">
            <Plus className="h-3 w-3" /> Add role
          </Button>
        )}
      </DialogTrigger>
      <DialogContent title={role ? "Edit application role" : "New application role"}>
        <div className="space-y-3">
          <div>
            <Label htmlFor="approle-name" required>Role name</Label>
            <Input id="approle-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. User, Supervisor, Manager" />
            <FieldError message={fieldErrors.name} />
          </div>
          <div>
            <Label htmlFor="approle-description">Description</Label>
            <Textarea id="approle-description" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              loading={loading}
              onClick={() =>
                run(
                  () =>
                    role
                      ? updateApplicationRoleAction(role.id, { applicationId, name, description: description || undefined })
                      : createApplicationRoleAction({ applicationId, name, description: description || undefined }),
                  {
                    successMessage: role ? "Role updated." : "Role created.",
                    onSuccess: () => setOpen(false),
                  },
                )
              }
            >
              {role ? "Save changes" : "Create role"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function RoleToggle({ id, isActive }: { id: string; isActive: boolean }) {
  const { run, loading } = useAction();
  return (
    <button
      type="button"
      disabled={loading}
      aria-label={isActive ? "Disable role" : "Enable role"}
      title={isActive ? "Disable role" : "Enable role"}
      className="text-muted-foreground hover:text-foreground"
      onClick={() =>
        run(() => setApplicationRoleActiveAction(id, !isActive), {
          successMessage: isActive ? "Role disabled." : "Role enabled.",
        })
      }
    >
      <Power className={`h-3 w-3 ${isActive ? "text-success" : ""}`} />
    </button>
  );
}

const CREDENTIAL_FIELD_TYPES = [
  ["TEXT", "Text"],
  ["URL", "URL"],
  ["NUMBER", "Number"],
  ["EMAIL", "Email"],
  ["COMPANY_CODE", "Company Code"],
  ["TENANT_ID", "Tenant ID"],
  ["API_ENDPOINT", "API Endpoint"],
  ["NOTES", "Notes"],
] as const;

export function CredentialFieldDialog({
  applicationId,
  field,
}: {
  applicationId: string;
  field?: { id: string; fieldName: string; fieldType: string; isRequired: boolean; helpText: string | null };
}) {
  const { run, loading, fieldErrors } = useAction();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    fieldName: field?.fieldName ?? "",
    fieldType: field?.fieldType ?? "TEXT",
    isRequired: field?.isRequired ?? false,
    helpText: field?.helpText ?? "",
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {field ? (
          <Button variant="ghost" size="icon" className="h-6 w-6" aria-label={`Edit ${field.fieldName}`}>
            <Pencil className="h-3 w-3" />
          </Button>
        ) : (
          <Button variant="ghost" size="sm" className="h-6 px-2 text-xs">
            <Plus className="h-3 w-3" /> Add field
          </Button>
        )}
      </DialogTrigger>
      <DialogContent
        title={field ? "Edit credential field" : "New credential field"}
        description="Shown in the secure credential delivery alongside username and temporary password."
      >
        <div className="space-y-3">
          <div>
            <Label htmlFor="cf-name" required>Field name</Label>
            <Input id="cf-name" value={form.fieldName} onChange={(e) => setForm({ ...form, fieldName: e.target.value })} />
            <FieldError message={fieldErrors.fieldName} />
          </div>
          <div>
            <Label htmlFor="cf-type" required>Field type</Label>
            <Select id="cf-type" value={form.fieldType} onChange={(e) => setForm({ ...form, fieldType: e.target.value })}>
              {CREDENTIAL_FIELD_TYPES.map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="cf-help">Help text</Label>
            <Input id="cf-help" value={form.helpText} onChange={(e) => setForm({ ...form, helpText: e.target.value })} />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.isRequired}
              onChange={(e) => setForm({ ...form, isRequired: e.target.checked })}
              className="h-4 w-4"
            />
            Required before credential delivery
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              loading={loading}
              onClick={() =>
                run(
                  () =>
                    saveCredentialFieldAction(
                      {
                        applicationId,
                        fieldName: form.fieldName,
                        fieldType: form.fieldType,
                        isRequired: form.isRequired,
                        displayOrder: 0,
                        helpText: form.helpText || undefined,
                      },
                      field?.id,
                    ),
                  { successMessage: "Credential field saved.", onSuccess: () => setOpen(false) },
                )
              }
            >
              {field ? "Save changes" : "Save field"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function CredentialFieldToggle({ id, isActive }: { id: string; isActive: boolean }) {
  const { run, loading } = useAction();
  return (
    <button
      type="button"
      disabled={loading}
      aria-label={isActive ? "Disable field" : "Enable field"}
      title={isActive ? "Disable field" : "Enable field"}
      className="text-muted-foreground hover:text-foreground"
      onClick={() =>
        run(() => setCredentialFieldActiveAction(id, !isActive), {
          successMessage: isActive ? "Field disabled." : "Field enabled.",
        })
      }
    >
      <Power className={`h-3 w-3 ${isActive ? "text-success" : ""}`} />
    </button>
  );
}

export function AssignmentDialog({
  applications,
  peopleByCompany,
  allPeople,
}: {
  applications: { id: string; name: string; companyId: string; isShared: boolean; roles: { id: string; name: string }[] }[];
  peopleByCompany: Record<string, { id: string; name: string }[]>;
  allPeople: { id: string; name: string }[];
}) {
  const { run, loading, fieldErrors } = useAction();
  const [open, setOpen] = useState(false);
  const [applicationId, setApplicationId] = useState("");
  const [applicationRoleId, setApplicationRoleId] = useState("");
  const [personId, setPersonId] = useState("");
  const [username, setUsername] = useState("");

  const selectedApplication = applications.find((application) => application.id === applicationId);
  // Shared applications can be assigned to anyone; company apps to their company.
  const people = selectedApplication
    ? selectedApplication.isShared
      ? allPeople
      : (peopleByCompany[selectedApplication.companyId] ?? [])
    : [];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="h-4 w-4" /> New assignment
        </Button>
      </DialogTrigger>
      <DialogContent title="Assign application access" description="Direct administrative assignment. Requests submitted through forms create assignments automatically at implementation.">
        <div className="space-y-3">
          <div>
            <Label htmlFor="asg-application" required>Application</Label>
            <Combobox
              id="asg-application"
              value={applicationId}
              onChange={(value) => { setApplicationId(value); setApplicationRoleId(""); setPersonId(""); }}
              options={applications.map((application) => ({
                value: application.id,
                label: application.name,
                hint: application.isShared ? "Shared" : undefined,
              }))}
            />
          </div>
          <div>
            <Label htmlFor="asg-person" required>Employee</Label>
            <Combobox
              id="asg-person"
              value={personId}
              disabled={!applicationId}
              onChange={setPersonId}
              options={people.map((person) => ({ value: person.id, label: person.name }))}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="asg-role">Access role</Label>
              <Combobox
                id="asg-role"
                value={applicationRoleId}
                disabled={!applicationId}
                emptyLabel="Default access"
                onChange={setApplicationRoleId}
                options={(selectedApplication?.roles ?? []).map((role) => ({ value: role.id, label: role.name }))}
              />
            </div>
            <div>
              <Label htmlFor="asg-username">Username</Label>
              <Input id="asg-username" value={username} onChange={(e) => setUsername(e.target.value)} />
              <FieldError message={fieldErrors.username} />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              loading={loading}
              disabled={!applicationId || !personId}
              onClick={() =>
                run(
                  () =>
                    createAssignmentAction({
                      personId,
                      applicationId,
                      applicationRoleId: applicationRoleId || undefined,
                      username: username || undefined,
                    }),
                  { successMessage: "Assignment created.", onSuccess: () => setOpen(false) },
                )
              }
            >
              Assign access
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function AssignmentRowActions({ assignmentId, status }: { assignmentId: string; status: string }) {
  const { run, loading } = useAction();
  const [removeOpen, setRemoveOpen] = useState(false);
  const [reason, setReason] = useState("");
  if (status === "REMOVED") return null;
  return (
    <div className="flex justify-end gap-1">
      {status === "SUSPENDED" ? (
        <Button
          variant="ghost" size="icon" loading={loading} aria-label="Activate assignment" title="Activate"
          onClick={() => run(() => setAssignmentStatusAction(assignmentId, "ACTIVE"), { successMessage: "Assignment activated." })}
        >
          <PlayCircle className="h-4 w-4 text-success" />
        </Button>
      ) : (
        <Button
          variant="ghost" size="icon" loading={loading} aria-label="Suspend assignment" title="Suspend"
          onClick={() => run(() => setAssignmentStatusAction(assignmentId, "SUSPENDED"), { successMessage: "Assignment suspended." })}
        >
          <PauseCircle className="h-4 w-4 text-warning" />
        </Button>
      )}
      <Dialog open={removeOpen} onOpenChange={setRemoveOpen}>
        <DialogTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="Remove access" title="Remove access">
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </DialogTrigger>
        <DialogContent title="Remove access" description="History is preserved; the removal reason is recorded.">
          <Label htmlFor={`remove-reason-${assignmentId}`} required>Removal reason</Label>
          <Textarea id={`remove-reason-${assignmentId}`} value={reason} onChange={(e) => setReason(e.target.value)} />
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setRemoveOpen(false)}>Cancel</Button>
            <Button
              variant="destructive"
              loading={loading}
              disabled={!reason.trim()}
              onClick={() =>
                run(() => removeAssignmentAction({ assignmentId, reason }), {
                  successMessage: "Access removed.",
                  onSuccess: () => setRemoveOpen(false),
                })
              }
            >
              Remove access
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
