"use client";

import { useEffect, useState } from "react";
import { Pencil, Plus, Power, ArrowUp, ArrowDown, Trash2 } from "lucide-react";
import {
  createWorkflowAction,
  updateWorkflowAction,
  setWorkflowActiveAction,
  createDelegationAction,
  setDelegationActiveAction,
} from "@/modules/workflow/actions";
import { useAction } from "@/shared/ui/use-action";
import { Button } from "@/shared/ui/button";
import { Input, Textarea, Select, Label, FieldError, HelperText } from "@/shared/ui/input";
import { Dialog, DialogContent, DialogTrigger } from "@/shared/ui/dialog";

interface StepDraft {
  stepName: string;
  stepType: "APPROVAL" | "IT_APPROVAL" | "IT_IMPLEMENTATION";
  approvalRoleId: string;
  approvalRule: "ANY" | "ALL";
  allowDelegation: boolean;
  commentsRequired: boolean;
}

export function WorkflowDialog({
  companies,
  approvalRoles,
  workflow,
}: {
  companies: { id: string; name: string }[];
  approvalRoles: { id: string; name: string; key: string }[];
  workflow?: {
    id: string;
    companyId: string;
    name: string;
    description: string | null;
    isDefault: boolean;
    steps: StepDraft[];
  };
}) {
  const { run, loading, fieldErrors } = useAction();
  const [open, setOpen] = useState(false);
  const implementationRole = approvalRoles.find((role) => role.key === "IT_IMPLEMENTATION");
  const defaultSteps = (): StepDraft[] => [
    {
      stepName: "Department Head Approval",
      stepType: "APPROVAL",
      approvalRoleId: approvalRoles.find((role) => role.key === "DEPARTMENT_HEAD")?.id ?? approvalRoles[0]?.id ?? "",
      approvalRule: "ANY",
      allowDelegation: true,
      commentsRequired: false,
    },
    {
      stepName: "IT Implementation",
      stepType: "IT_IMPLEMENTATION",
      approvalRoleId: implementationRole?.id ?? approvalRoles[0]?.id ?? "",
      approvalRule: "ANY",
      allowDelegation: false,
      commentsRequired: false,
    },
  ];
  const [companyId, setCompanyId] = useState(workflow?.companyId ?? companies[0]?.id ?? "");
  const [name, setName] = useState(workflow?.name ?? "");
  const [description, setDescription] = useState(workflow?.description ?? "");
  const [steps, setSteps] = useState<StepDraft[]>(workflow?.steps ?? defaultSteps());

  // Re-sync from the latest server data every time the dialog opens so edits
  // always start from the current active version's steps.
  useEffect(() => {
    if (open) {
      setCompanyId(workflow?.companyId ?? companies[0]?.id ?? "");
      setName(workflow?.name ?? "");
      setDescription(workflow?.description ?? "");
      setSteps(workflow?.steps && workflow.steps.length > 0 ? workflow.steps.map((step) => ({ ...step })) : defaultSteps());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function updateStep(index: number, patch: Partial<StepDraft>) {
    setSteps((current) => current.map((step, i) => (i === index ? { ...step, ...patch } : step)));
  }

  function moveStep(index: number, direction: -1 | 1) {
    setSteps((current) => {
      const next = [...current];
      const target = index + direction;
      if (target < 0 || target >= next.length) return current;
      const a = next[index]!;
      next[index] = next[target]!;
      next[target] = a;
      return next;
    });
  }

  async function submit() {
    const payload = {
      companyId,
      name,
      description: description || undefined,
      isDefault: workflow?.isDefault ?? false,
      steps,
    };
    await run(
      () => (workflow ? updateWorkflowAction(workflow.id, payload) : createWorkflowAction(payload)),
      {
        successMessage: workflow
          ? "Workflow updated. A new version was created."
          : "Workflow created.",
        onSuccess: () => setOpen(false),
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {workflow ? (
          <Button variant="ghost" size="icon" aria-label={`Edit ${workflow.name}`}>
            <Pencil className="h-4 w-4" />
          </Button>
        ) : (
          <Button size="sm">
            <Plus className="h-4 w-4" /> New workflow
          </Button>
        )}
      </DialogTrigger>
      <DialogContent
        title={workflow ? "Edit workflow" : "New workflow"}
        description="Steps execute in order from step 1 downward. The final step must be IT Implementation."
        wide
        className="max-w-5xl"
      >
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="wf-company" required>Company</Label>
              <Select id="wf-company" value={companyId} disabled={!!workflow} onChange={(e) => setCompanyId(e.target.value)}>
                {companies.map((company) => (
                  <option key={company.id} value={company.id}>{company.name}</option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="wf-name" required>Workflow name</Label>
              <Input id="wf-name" value={name} onChange={(e) => setName(e.target.value)} />
              <FieldError message={fieldErrors.name} />
            </div>
          </div>
          <div>
            <Label htmlFor="wf-description">Description</Label>
            <Textarea id="wf-description" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <Label className="mb-0">Approval steps</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  setSteps((current) => {
                    const implementationIndex = current.findIndex((step) => step.stepType === "IT_IMPLEMENTATION");
                    const newStep: StepDraft = {
                      stepName: "Approval",
                      stepType: "APPROVAL",
                      approvalRoleId: approvalRoles[0]?.id ?? "",
                      approvalRule: "ANY",
                      allowDelegation: true,
                      commentsRequired: false,
                    };
                    if (implementationIndex === -1) return [...current, newStep];
                    const next = [...current];
                    next.splice(implementationIndex, 0, newStep);
                    return next;
                  })
                }
              >
                <Plus className="h-4 w-4" /> Add step
              </Button>
            </div>
            <FieldError message={fieldErrors.steps} />
            <ol className="space-y-2">
              {steps.map((step, index) => (
                <li key={index} className="relative rounded-md border p-3 pl-12">
                  <span
                    className="absolute left-3 top-4 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground"
                    aria-label={`Step ${index + 1}`}
                  >
                    {index + 1}
                  </span>
                  {index < steps.length - 1 ? (
                    <span className="absolute bottom-0 left-[23px] top-11 w-px bg-border" aria-hidden />
                  ) : null}
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                    <div>
                      <Label htmlFor={`step-name-${index}`} className="text-xs">Step name</Label>
                      <Input
                        id={`step-name-${index}`}
                        value={step.stepName}
                        onChange={(e) => updateStep(index, { stepName: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label htmlFor={`step-type-${index}`} className="text-xs">Step type</Label>
                      <Select
                        id={`step-type-${index}`}
                        value={step.stepType}
                        onChange={(e) => updateStep(index, { stepType: e.target.value as StepDraft["stepType"] })}
                      >
                        <option value="APPROVAL">Approval</option>
                        <option value="IT_APPROVAL">IT Approval</option>
                        <option value="IT_IMPLEMENTATION">IT Implementation</option>
                      </Select>
                    </div>
                    <div>
                      <Label htmlFor={`step-role-${index}`} className="text-xs">Approval role</Label>
                      <Select
                        id={`step-role-${index}`}
                        value={step.approvalRoleId}
                        onChange={(e) => updateStep(index, { approvalRoleId: e.target.value })}
                      >
                        {approvalRoles.map((role) => (
                          <option key={role.id} value={role.id}>{role.name}</option>
                        ))}
                      </Select>
                    </div>
                    <div>
                      <Label htmlFor={`step-rule-${index}`} className="text-xs">Approval rule</Label>
                      <Select
                        id={`step-rule-${index}`}
                        value={step.approvalRule}
                        onChange={(e) => updateStep(index, { approvalRule: e.target.value as "ANY" | "ALL" })}
                      >
                        <option value="ANY">Any approver may approve</option>
                        <option value="ALL">All approvers must approve</option>
                      </Select>
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex gap-4 text-xs">
                      <label className="flex items-center gap-1.5">
                        <input
                          type="checkbox"
                          checked={step.allowDelegation}
                          onChange={(e) => updateStep(index, { allowDelegation: e.target.checked })}
                          className="h-3.5 w-3.5"
                        />
                        Allow delegation
                      </label>
                      <label className="flex items-center gap-1.5">
                        <input
                          type="checkbox"
                          checked={step.commentsRequired}
                          onChange={(e) => updateStep(index, { commentsRequired: e.target.checked })}
                          className="h-3.5 w-3.5"
                        />
                        Comments required
                      </label>
                    </div>
                    <div className="flex gap-1">
                      <Button type="button" variant="ghost" size="icon" aria-label="Move step up" onClick={() => moveStep(index, -1)}>
                        <ArrowUp className="h-4 w-4" />
                      </Button>
                      <Button type="button" variant="ghost" size="icon" aria-label="Move step down" onClick={() => moveStep(index, 1)}>
                        <ArrowDown className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label="Remove step"
                        disabled={steps.length <= 1}
                        onClick={() => setSteps((current) => current.filter((_, i) => i !== index))}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                </li>
              ))}
            </ol>
            <HelperText>
              {workflow
                ? "Saving creates a new workflow version. Requests already in progress continue on their original version."
                : "The last step must be an IT Implementation step assigned to the IT Implementation role."}
            </HelperText>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={submit} loading={loading}>
              {workflow ? "Save as new version" : "Create workflow"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function WorkflowToggleButton({ id, isActive }: { id: string; isActive: boolean }) {
  const { run, loading } = useAction();
  return (
    <Button
      variant="ghost"
      size="icon"
      loading={loading}
      aria-label={isActive ? "Disable workflow" : "Enable workflow"}
      onClick={() =>
        run(() => setWorkflowActiveAction(id, !isActive), {
          successMessage: isActive ? "Workflow disabled." : "Workflow enabled.",
        })
      }
    >
      <Power className={`h-4 w-4 ${isActive ? "text-success" : "text-muted-foreground"}`} />
    </Button>
  );
}

export function DelegationDialog({
  companies,
  peopleByCompany,
}: {
  companies: { id: string; name: string }[];
  peopleByCompany: Record<string, { id: string; name: string }[]>;
}) {
  const { run, loading, fieldErrors } = useAction();
  const [open, setOpen] = useState(false);
  const [companyId, setCompanyId] = useState(companies[0]?.id ?? "");
  const [fromPersonId, setFromPersonId] = useState("");
  const [toPersonId, setToPersonId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="h-4 w-4" /> New delegation
        </Button>
      </DialogTrigger>
      <DialogContent title="New delegation" description="The delegate acts on behalf of the approver within the date range. Both users are recorded on every action.">
        <div className="space-y-3">
          <div>
            <Label htmlFor="del-company" required>Company</Label>
            <Select id="del-company" value={companyId} onChange={(e) => { setCompanyId(e.target.value); setFromPersonId(""); setToPersonId(""); }}>
              {companies.map((company) => (
                <option key={company.id} value={company.id}>{company.name}</option>
              ))}
            </Select>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="del-from" required>Delegating approver</Label>
              <Select id="del-from" value={fromPersonId} onChange={(e) => setFromPersonId(e.target.value)}>
                <option value="">Select…</option>
                {(peopleByCompany[companyId] ?? []).map((person) => (
                  <option key={person.id} value={person.id}>{person.name}</option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="del-to" required>Delegate</Label>
              <Select id="del-to" value={toPersonId} onChange={(e) => setToPersonId(e.target.value)}>
                <option value="">Select…</option>
                {(peopleByCompany[companyId] ?? []).map((person) => (
                  <option key={person.id} value={person.id}>{person.name}</option>
                ))}
              </Select>
              <FieldError message={fieldErrors.toPersonId} />
            </div>
            <div>
              <Label htmlFor="del-start" required>Start date</Label>
              <Input id="del-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="del-end" required>End date</Label>
              <Input id="del-end" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
              <FieldError message={fieldErrors.endDate} />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              loading={loading}
              disabled={!fromPersonId || !toPersonId || !startDate || !endDate}
              onClick={() =>
                run(() => createDelegationAction({ companyId, fromPersonId, toPersonId, startDate, endDate }), {
                  successMessage: "Delegation created.",
                  onSuccess: () => setOpen(false),
                })
              }
            >
              Create delegation
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function DelegationToggleButton({ id, isActive }: { id: string; isActive: boolean }) {
  const { run, loading } = useAction();
  return (
    <Button
      variant="ghost"
      size="icon"
      loading={loading}
      aria-label={isActive ? "Deactivate delegation" : "Activate delegation"}
      onClick={() =>
        run(() => setDelegationActiveAction(id, !isActive), {
          successMessage: isActive ? "Delegation deactivated." : "Delegation activated.",
        })
      }
    >
      <Power className={`h-4 w-4 ${isActive ? "text-success" : "text-muted-foreground"}`} />
    </Button>
  );
}
