import { db } from "@/shared/db";
import { EmptyState } from "@/shared/ui/table";
import { SortableTable } from "@/shared/ui/sortable-table";
import { fullName } from "@/shared/utils";
import { AssignRoleDialog, RemoveAssignmentButton } from "./org-dialogs";

/** Server sections for approval role assignments and department heads (SDS Doc 06 Ch7/11). */

export async function AssignmentManager({
  canManage,
  companies,
}: {
  canManage: boolean;
  companies: { id: string; name: string }[];
}) {
  const companyIds = companies.map((company) => company.id);
  const [assignments, roles, people] = await Promise.all([
    db.approvalRoleAssignment.findMany({
      where: { deletedAt: null, isActive: true, companyId: { in: companyIds } },
      include: { approvalRole: true, person: true, company: true },
      orderBy: [{ company: { name: "asc" } }, { approvalRole: { name: "asc" } }],
    }),
    db.approvalRole.findMany({ where: { deletedAt: null, isActive: true }, orderBy: { name: "asc" } }),
    db.person.findMany({
      where: { deletedAt: null, isActive: true, companyId: { in: companyIds } },
      orderBy: [{ lastName: "asc" }],
      select: { id: true, firstName: true, lastName: true, companyId: true },
    }),
  ]);

  const peopleByCompany: Record<string, { id: string; name: string }[]> = {};
  for (const person of people) {
    (peopleByCompany[person.companyId] ??= []).push({ id: person.id, name: fullName(person) });
  }

  return (
    <section aria-label="Approval role assignments">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-semibold">Company assignments</h2>
        {canManage ? (
          <AssignRoleDialog
            companies={companies}
            roles={roles.map((role) => ({ id: role.id, name: role.name }))}
            peopleByCompany={peopleByCompany}
          />
        ) : null}
      </div>
      {assignments.length === 0 ? (
        <EmptyState
          title="No approval role assignments"
          description="Assign approvers per company so workflow steps can resolve who approves."
        />
      ) : (
        <SortableTable
          initialSort={{ key: "company", dir: "asc" }}
          columns={[
            { key: "company", label: "Company" },
            { key: "role", label: "Approval role" },
            { key: "person", label: "Person" },
            { key: "email", label: "Email" },
            ...(canManage ? [{ key: "actions", label: "Actions", sortable: false, align: "right" as const }] : []),
          ]}
          rows={assignments.map((assignment) => ({
            key: assignment.id,
            cells: {
              company: { sortValue: assignment.company.name, node: assignment.company.name },
              role: { sortValue: assignment.approvalRole.name, node: assignment.approvalRole.name, className: "font-medium" },
              person: { sortValue: fullName(assignment.person), node: fullName(assignment.person) },
              email: { sortValue: assignment.person.email, node: assignment.person.email },
              ...(canManage
                ? { actions: { node: <RemoveAssignmentButton assignmentId={assignment.id} /> } }
                : {}),
            },
          }))}
        />
      )}
    </section>
  );
}
