import { requirePermission } from "@/shared/auth/guard";
import { db } from "@/shared/db";
import { PageHeader, Pagination } from "@/shared/ui/page";
import { Table, THead, TBody, TR, TH, TD, EmptyState } from "@/shared/ui/table";
import { StatusBadge } from "@/shared/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { fullName, formatDate } from "@/shared/utils";
import { WorkflowDialog, WorkflowToggleButton, DelegationDialog, DelegationToggleButton } from "./workflow-dialogs";

export const metadata = { title: "Workflows" };
export const dynamic = "force-dynamic";

/** Workflow definitions, versions and delegations (SDS Doc 13). */
export default async function WorkflowsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const params = await searchParams;
  const page = Math.max(1, Number(params.page) || 1);
  const pageSize = 25;
  const { user } = await requirePermission("workflows.view");
  const isGlobalAdmin = user.systemRoleKey === "SYSTEM_ADMINISTRATOR";
  const canManage = user.permissions.has("workflows.manage");
  const companyScope = isGlobalAdmin ? {} : { companyId: user.companyId };

  const [workflows, workflowTotal, approvalRoles, companies, delegations, people] = await Promise.all([
    db.workflow.findMany({
      where: { deletedAt: null, ...companyScope },
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: [{ company: { name: "asc" } }, { name: "asc" }],
      include: {
        company: { select: { name: true } },
        versions: {
          where: { isActive: true },
          include: { steps: { orderBy: { stepOrder: "asc" }, include: { approvalRole: true } } },
        },
        forms: { where: { deletedAt: null }, select: { id: true, name: true, status: true } },
      },
    }),
    db.workflow.count({ where: { deletedAt: null, ...companyScope } }),
    db.approvalRole.findMany({
      where: { deletedAt: null, isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, key: true },
    }),
    db.company.findMany({
      where: { deletedAt: null, isActive: true, ...(isGlobalAdmin ? {} : { id: user.companyId }) },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    db.delegation.findMany({
      where: { deletedAt: null, ...companyScope },
      orderBy: { startDate: "desc" },
      include: { fromPerson: true, toPerson: true, company: { select: { name: true } } },
      take: 50,
    }),
    db.person.findMany({
      where: { deletedAt: null, isActive: true, ...(isGlobalAdmin ? {} : { companyId: user.companyId }) },
      orderBy: { lastName: "asc" },
      select: { id: true, firstName: true, lastName: true, companyId: true },
    }),
  ]);

  const peopleByCompany: Record<string, { id: string; name: string }[]> = {};
  for (const person of people) {
    (peopleByCompany[person.companyId] ??= []).push({ id: person.id, name: fullName(person) });
  }

  return (
    <div>
      <PageHeader
        title="Workflows"
        description="Configurable approval chains. Editing an active workflow creates a new version; running instances continue on their original version."
        actions={canManage ? <WorkflowDialog companies={companies} approvalRoles={approvalRoles} /> : undefined}
      />

      {workflows.length === 0 ? (
        <EmptyState
          title="No workflows"
          description="Create a workflow to define the approval chain used by request forms."
        />
      ) : (
        <div className="space-y-4">
          {workflows.map((workflow) => {
            const version = workflow.versions[0];
            return (
              <Card key={workflow.id}>
                <CardHeader>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <CardTitle>
                        {workflow.name}
                        <span className="ml-2 text-sm font-normal text-muted-foreground">
                          {workflow.company.name} · v{version?.versionNumber ?? "None"}
                        </span>
                      </CardTitle>
                      {workflow.description ? (
                        <p className="mt-1 text-sm text-muted-foreground">{workflow.description}</p>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusBadge status={workflow.isActive ? "ACTIVE" : "CANCELLED"} />
                      {canManage ? (
                        <>
                          <WorkflowDialog
                            companies={companies}
                            approvalRoles={approvalRoles}
                            workflow={{
                              id: workflow.id,
                              companyId: workflow.companyId,
                              name: workflow.name,
                              description: workflow.description,
                              isDefault: workflow.isDefault,
                              steps: (version?.steps ?? []).map((step) => ({
                                stepName: step.stepName,
                                stepType: step.stepType,
                                approvalRoleId: step.approvalRoleId,
                                approvalRule: step.approvalRule,
                                allowDelegation: step.allowDelegation,
                                commentsRequired: step.commentsRequired,
                              })),
                            }}
                          />
                          <WorkflowToggleButton id={workflow.id} isActive={workflow.isActive} />
                        </>
                      ) : null}
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <ol className="flex flex-wrap items-center gap-2">
                    {(version?.steps ?? []).map((step, index) => (
                      <li key={step.id} className="flex items-center gap-2">
                        {index > 0 ? <span className="text-muted-foreground">→</span> : null}
                        <span
                          className={`rounded-full border px-3 py-1 text-xs font-medium ${
                            step.stepType === "IT_IMPLEMENTATION"
                              ? "border-primary/40 bg-primary/10 text-primary"
                              : "bg-card"
                          }`}
                        >
                          {step.stepName}
                          <span className="ml-1 text-muted-foreground">
                            ({step.approvalRole.name}
                            {step.approvalRule === "ALL" ? " · all must approve" : ""})
                          </span>
                        </span>
                      </li>
                    ))}
                  </ol>
                  {workflow.forms.length > 0 ? (
                    <p className="mt-3 text-xs text-muted-foreground">
                      Used by: {workflow.forms.map((form) => form.name).join(", ")}
                    </p>
                  ) : null}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <section aria-label="Delegations" className="mt-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold">Approval delegations</h2>
          {canManage ? <DelegationDialog companies={companies} peopleByCompany={peopleByCompany} /> : null}
        </div>
        {delegations.length === 0 ? (
          <EmptyState
            title="No delegations"
            description="Delegations let another person approve on behalf of an approver during a configured period."
          />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Company</TH><TH>From</TH><TH>To</TH><TH>Period</TH><TH>Status</TH>
                {canManage ? <TH className="text-right">Actions</TH> : null}
              </TR>
            </THead>
            <TBody>
              {delegations.map((delegation) => {
                const now = new Date();
                const status = !delegation.isActive
                  ? "CANCELLED"
                  : delegation.endDate < now
                    ? "EXPIRED"
                    : delegation.startDate > now
                      ? "PENDING"
                      : "ACTIVE";
                return (
                  <TR key={delegation.id}>
                    <TD>{delegation.company.name}</TD>
                    <TD>{fullName(delegation.fromPerson)}</TD>
                    <TD>{fullName(delegation.toPerson)}</TD>
                    <TD className="text-xs">
                      {formatDate(delegation.startDate)} → {formatDate(delegation.endDate)}
                    </TD>
                    <TD><StatusBadge status={status} /></TD>
                    {canManage ? (
                      <TD className="text-right">
                        <DelegationToggleButton id={delegation.id} isActive={delegation.isActive} />
                      </TD>
                    ) : null}
                  </TR>
                );
              })}
            </TBody>
          </Table>
        )}
      </section>
      <Pagination
        page={page}
        pageCount={Math.max(1, Math.ceil(workflowTotal / pageSize))}
        total={workflowTotal}
        buildHref={(next) => {
          const search = new URLSearchParams();
          search.set("page", String(next));
          return `/workflows?${search.toString()}`;
        }}
      />
    </div>
  );
}
