import { db } from "@/shared/db";
import { Table, THead, TBody, TR, TH, TD, EmptyState } from "@/shared/ui/table";
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
        <Table>
          <THead>
            <TR>
              <TH>Company</TH><TH>Approval role</TH><TH>Person</TH><TH>Email</TH>
              {canManage ? <TH className="text-right">Actions</TH> : null}
            </TR>
          </THead>
          <TBody>
            {assignments.map((assignment) => (
              <TR key={assignment.id}>
                <TD>{assignment.company.name}</TD>
                <TD className="font-medium">{assignment.approvalRole.name}</TD>
                <TD>{fullName(assignment.person)}</TD>
                <TD>{assignment.person.email}</TD>
                {canManage ? (
                  <TD className="text-right">
                    <RemoveAssignmentButton assignmentId={assignment.id} />
                  </TD>
                ) : null}
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </section>
  );
}
