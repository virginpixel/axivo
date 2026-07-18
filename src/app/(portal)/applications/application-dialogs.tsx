"use client";

import { useState } from "react";
import { Pencil, Plus, Power, PauseCircle, PlayCircle, Trash2 } from "lucide-react";
import {
  createApplicationAction,
  updateApplicationAction,
  setApplicationActiveAction,
  createApplicationRoleAction,
  saveCredentialFieldAction,
  createAssignmentAction,
  setAssignmentStatusAction,
  removeAssignmentAction,
} from "@/modules/applications/actions";
import { useAction } from "@/shared/ui/use-action";
import { Button } from "@/shared/ui/button";
import { Input, Select, Textarea, Label, FieldError } from "@/shared/ui/input";
import { Dialog, DialogContent, DialogTrigger } from "@/shared/ui/dialog";

export function ApplicationDialog({
  companies,
  application,
}: {
  companies: { id: string; name: string }[];
  application?: {
    id: string;
    companyId: string;
    name: string;
    description: string | null;
    category: string | null;
    loginUrl: string | null;
    allowMultipleAssignments: boolean;
    requiresLicense: boolean;
  };
}) {
  const { run, loading, fieldErrors } = useAction();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    companyId: application?.companyId ?? companies[0]?.id ?? "",
    name: application?.name ?? "",
    description: application?.description ?? "",
    category: application?.category ?? "",
    loginUrl: application?.loginUrl ?? "",
    allowMultipleAssignments: application?.allowMultipleAssignments ?? false,
    requiresLicense: application?.requiresLicense ?? false,
  });

  async function submit() {
    const payload = {
      companyId: form.companyId,
      name: form.name,
      description: form.description || undefined,
      category: form.category || undefined,
      loginUrl: form.loginUrl || undefined,
      allowMultipleAssignments: form.allowMultipleAssignments,
      requiresLicense: form.requiresLicense,
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
            <Label htmlFor="app-company" required>Company</Label>
            <Select id="app-company" value={form.companyId} disabled={!!application} onChange={(e) => setForm({ ...form, companyId: e.target.value })}>
              {companies.map((company) => (
                <option key={company.id} value={company.id}>{company.name}</option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="app-name" required>Application name</Label>
            <Input id="app-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <FieldError message={fieldErrors.name} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="app-category">Category</Label>
              <Input id="app-category" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="app-url">Login URL</Label>
              <Input id="app-url" value={form.loginUrl} onChange={(e) => setForm({ ...form, loginUrl: e.target.value })} placeholder="https://…" />
              <FieldError message={fieldErrors.loginUrl} />
            </div>
          </div>
          <div>
            <Label htmlFor="app-description">Description</Label>
            <Textarea id="app-description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          <div className="flex flex-col gap-2 text-sm">
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

export function AppRoleDialog({ applicationId }: { applicationId: string }) {
  const { run, loading, fieldErrors } = useAction();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="h-6 px-2 text-xs">
          <Plus className="h-3 w-3" /> Add role
        </Button>
      </DialogTrigger>
      <DialogContent title="New application role">
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
                run(() => createApplicationRoleAction({ applicationId, name, description: description || undefined }), {
                  successMessage: "Role created.",
                  onSuccess: () => { setOpen(false); setName(""); setDescription(""); },
                })
              }
            >
              Create role
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
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

export function CredentialFieldDialog({ applicationId }: { applicationId: string }) {
  const { run, loading, fieldErrors } = useAction();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ fieldName: "", fieldType: "TEXT", isRequired: false, helpText: "" });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="h-6 px-2 text-xs">
          <Plus className="h-3 w-3" /> Add field
        </Button>
      </DialogTrigger>
      <DialogContent
        title="New credential field"
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
                    saveCredentialFieldAction({
                      applicationId,
                      fieldName: form.fieldName,
                      fieldType: form.fieldType,
                      isRequired: form.isRequired,
                      displayOrder: 0,
                      helpText: form.helpText || undefined,
                    }),
                  { successMessage: "Credential field saved.", onSuccess: () => setOpen(false) },
                )
              }
            >
              Save field
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function AssignmentDialog({
  applications,
  peopleByCompany,
}: {
  applications: { id: string; name: string; companyId: string; roles: { id: string; name: string }[] }[];
  peopleByCompany: Record<string, { id: string; name: string }[]>;
}) {
  const { run, loading, fieldErrors } = useAction();
  const [open, setOpen] = useState(false);
  const [applicationId, setApplicationId] = useState("");
  const [applicationRoleId, setApplicationRoleId] = useState("");
  const [personId, setPersonId] = useState("");
  const [username, setUsername] = useState("");

  const selectedApplication = applications.find((application) => application.id === applicationId);
  const people = selectedApplication ? (peopleByCompany[selectedApplication.companyId] ?? []) : [];

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
            <Select
              id="asg-application"
              value={applicationId}
              onChange={(e) => { setApplicationId(e.target.value); setApplicationRoleId(""); setPersonId(""); }}
            >
              <option value="">Select…</option>
              {applications.map((application) => (
                <option key={application.id} value={application.id}>{application.name}</option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="asg-person" required>Employee</Label>
            <Select id="asg-person" value={personId} onChange={(e) => setPersonId(e.target.value)} disabled={!applicationId}>
              <option value="">Select…</option>
              {people.map((person) => (
                <option key={person.id} value={person.id}>{person.name}</option>
              ))}
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="asg-role">Access role</Label>
              <Select id="asg-role" value={applicationRoleId} onChange={(e) => setApplicationRoleId(e.target.value)} disabled={!applicationId}>
                <option value="">Default access</option>
                {(selectedApplication?.roles ?? []).map((role) => (
                  <option key={role.id} value={role.id}>{role.name}</option>
                ))}
              </Select>
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
