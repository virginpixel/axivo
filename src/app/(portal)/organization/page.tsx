import Link from "next/link";
import { requirePermission } from "@/shared/auth/guard";
import { db } from "@/shared/db";
import { PageHeader } from "@/shared/ui/page";
import { Table, THead, TBody, TR, TH, TD, EmptyState } from "@/shared/ui/table";
import { StatusBadge } from "@/shared/ui/badge";
import { cn, fullName } from "@/shared/utils";
import {
  CompanyDialog,
  OrgEntityDialog,
  DepartmentDialog,
  ToggleActiveButton,
  ApprovalRoleDialog,
} from "./org-dialogs";
import { AssignmentManager } from "./sections";

export const metadata = { title: "Organization" };
export const dynamic = "force-dynamic";

const TABS = [
  { key: "companies", label: "Companies" },
  { key: "departments", label: "Departments" },
  { key: "positions", label: "Positions" },
  { key: "approval-roles", label: "Approval Roles" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

/**
 * Organization administration (SDS Doc 06). Department Heads are assigned on
 * the department itself; asset locations are managed under Settings.
 */
export default async function OrganizationPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; q?: string; showInactive?: string }>;
}) {
  const { user } = await requirePermission("organization.view");
  const params = await searchParams;
  const tab: TabKey = (TABS.find((t) => t.key === params.tab)?.key ?? "companies") as TabKey;
  const q = params.q?.trim() ?? "";
  const showInactive = params.showInactive === "1";
  const canManage = user.permissions.has("organization.manage");
  const canManageCompanies = user.permissions.has("organization.company.manage");
  const canManageRoles = user.permissions.has("organization.approvalRoles.manage");
  const isGlobalAdmin = user.systemRoleKey === "SYSTEM_ADMINISTRATOR";
  const companyScope = isGlobalAdmin ? {} : { id: user.companyId };

  const companies = await db.company.findMany({
    where: { deletedAt: null, ...companyScope },
    orderBy: { name: "asc" },
  });
  const companyIds = companies.map((company) => company.id);
  const companyOptions = companies.map((company) => ({ id: company.id, name: company.name }));
  const nameFilter = q ? { name: { contains: q, mode: "insensitive" as const } } : {};
  const activeFilter = showInactive ? {} : { isActive: true };

  const people = await db.person.findMany({
    where: { deletedAt: null, isActive: true, companyId: { in: companyIds } },
    orderBy: { lastName: "asc" },
    select: { id: true, firstName: true, lastName: true, companyId: true },
  });
  const peopleByCompany: Record<string, { id: string; name: string }[]> = {};
  for (const person of people) {
    (peopleByCompany[person.companyId] ??= []).push({ id: person.id, name: fullName(person) });
  }

  return (
    <div>
      <PageHeader
        title="Organization"
        description="Companies, departments, positions and approval routing. Department Heads are set on each department."
      />

      <nav className="mb-5 flex flex-wrap gap-1 border-b" aria-label="Organization sections">
        {TABS.map((entry) => (
          <Link
            key={entry.key}
            href={`/organization?tab=${entry.key}`}
            aria-current={tab === entry.key ? "page" : undefined}
            className={cn(
              "border-b-2 px-4 py-2 text-sm font-medium",
              tab === entry.key
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {entry.label}
          </Link>
        ))}
      </nav>

      <form method="get" className="mb-4 flex flex-wrap items-center gap-2">
        <input type="hidden" name="tab" value={tab} />
        <input
          name="q"
          defaultValue={q}
          placeholder="Search by name…"
          aria-label="Search"
          className="h-9 w-full rounded-md border border-input bg-card px-3 text-sm sm:w-64"
        />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="showInactive" value="1" defaultChecked={showInactive} className="h-4 w-4" />
          Show inactive
        </label>
        <button type="submit" className="h-9 rounded-md border bg-card px-4 text-sm hover:bg-accent">
          Apply
        </button>
      </form>

      {tab === "companies" ? (
        <section aria-label="Companies">
          <div className="mb-3 flex justify-end">
            {canManageCompanies ? <CompanyDialog /> : null}
          </div>
          {companies.length === 0 ? (
            <EmptyState title="No companies" description="Create the first company to begin structuring the organization." />
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Name</TH><TH>Code</TH><TH>Currency</TH><TH>Status</TH><TH className="text-right">Actions</TH>
                </TR>
              </THead>
              <TBody>
                {companies
                  .filter((company) => !q || company.name.toLowerCase().includes(q.toLowerCase()))
                  .filter((company) => showInactive || company.isActive)
                  .map((company) => (
                    <TR key={company.id}>
                      <TD className="font-medium">{company.name}</TD>
                      <TD>{company.code}</TD>
                      <TD>{company.currency}</TD>
                      <TD><StatusBadge status={company.isActive ? "ACTIVE" : "CANCELLED"} /></TD>
                      <TD className="text-right">
                        {canManageCompanies ? (
                          <div className="flex justify-end gap-2">
                            <CompanyDialog
                              company={{
                                id: company.id,
                                name: company.name,
                                code: company.code,
                                description: company.description,
                                currency: company.currency,
                              }}
                            />
                            <ToggleActiveButton entity="company" id={company.id} isActive={company.isActive} />
                          </div>
                        ) : null}
                      </TD>
                    </TR>
                  ))}
              </TBody>
            </Table>
          )}
        </section>
      ) : null}

      {tab === "departments" ? (
        <DepartmentsSection
          companies={companyOptions}
          companyIds={companyIds}
          peopleByCompany={peopleByCompany}
          nameFilter={nameFilter}
          activeFilter={activeFilter}
          canManage={canManage}
        />
      ) : null}

      {tab === "positions" ? (
        <PositionsSection
          companies={companyOptions}
          companyIds={companyIds}
          nameFilter={nameFilter}
          activeFilter={activeFilter}
          canManage={canManage}
        />
      ) : null}

      {tab === "approval-roles" ? (
        <section aria-label="Approval roles" className="space-y-6">
          <div className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
            <strong className="text-foreground">How approval routing works:</strong> Department Head
            steps always route to the heads configured on the Requested For employee&apos;s
            department (Departments tab). The assignments below are only for company-wide roles
            such as HR, General Manager and IT Implementation.
          </div>
          <div className="flex justify-end">{canManageRoles ? <ApprovalRoleDialog /> : null}</div>
          <ApprovalRolesTable canManage={canManageRoles} showInactive={showInactive} />
          <AssignmentManager canManage={canManageRoles} companies={companyOptions} />
        </section>
      ) : null}
    </div>
  );
}

async function DepartmentsSection({
  companies,
  companyIds,
  peopleByCompany,
  nameFilter,
  activeFilter,
  canManage,
}: {
  companies: { id: string; name: string }[];
  companyIds: string[];
  peopleByCompany: Record<string, { id: string; name: string }[]>;
  nameFilter: object;
  activeFilter: object;
  canManage: boolean;
}) {
  const departments = await db.department.findMany({
    where: { deletedAt: null, companyId: { in: companyIds }, ...nameFilter, ...activeFilter },
    orderBy: { name: "asc" },
    include: {
      company: { select: { name: true } },
      departmentHeads: {
        where: { deletedAt: null, isActive: true },
        include: { person: true },
      },
      _count: { select: { people: { where: { deletedAt: null, isActive: true } } } },
    },
  });

  return (
    <section aria-label="Departments">
      <div className="mb-3 flex justify-end">
        {canManage ? <DepartmentDialog companies={companies} peopleByCompany={peopleByCompany} /> : null}
      </div>
      {departments.length === 0 ? (
        <EmptyState
          title="No departments"
          description="Create departments and assign their Department Heads — approvals route to them automatically."
        />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Name</TH><TH>Company</TH><TH>Department Head(s)</TH><TH>People</TH><TH>Status</TH>
              <TH className="text-right">Actions</TH>
            </TR>
          </THead>
          <TBody>
            {departments.map((department) => (
              <TR key={department.id}>
                <TD className="font-medium">{department.name}</TD>
                <TD>{department.company.name}</TD>
                <TD>
                  {department.departmentHeads.length === 0 ? (
                    <span className="text-xs text-destructive">None — approvals cannot resolve</span>
                  ) : (
                    department.departmentHeads.map((head) => fullName(head.person)).join(", ")
                  )}
                </TD>
                <TD>{department._count.people}</TD>
                <TD><StatusBadge status={department.isActive ? "ACTIVE" : "CANCELLED"} /></TD>
                <TD className="text-right">
                  {canManage ? (
                    <div className="flex justify-end gap-2">
                      <DepartmentDialog
                        companies={companies}
                        peopleByCompany={peopleByCompany}
                        department={{
                          id: department.id,
                          companyId: department.companyId,
                          name: department.name,
                          description: department.description,
                          headPersonIds: department.departmentHeads.map((head) => head.personId),
                        }}
                      />
                      <ToggleActiveButton entity="department" id={department.id} isActive={department.isActive} />
                    </div>
                  ) : null}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </section>
  );
}

async function PositionsSection({
  companies,
  companyIds,
  nameFilter,
  activeFilter,
  canManage,
}: {
  companies: { id: string; name: string }[];
  companyIds: string[];
  nameFilter: object;
  activeFilter: object;
  canManage: boolean;
}) {
  const positions = await db.position.findMany({
    where: { deletedAt: null, companyId: { in: companyIds }, ...nameFilter, ...activeFilter },
    orderBy: { name: "asc" },
    include: { company: { select: { name: true } } },
  });

  return (
    <section aria-label="Positions">
      <div className="mb-3 flex justify-end">
        {canManage ? <OrgEntityDialog entity="position" companies={companies} /> : null}
      </div>
      {positions.length === 0 ? (
        <EmptyState title="No positions" description="Create positions to classify employees." />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Name</TH><TH>Company</TH><TH>Description</TH><TH>Status</TH><TH className="text-right">Actions</TH>
            </TR>
          </THead>
          <TBody>
            {positions.map((position) => (
              <TR key={position.id}>
                <TD className="font-medium">{position.name}</TD>
                <TD>{position.company.name}</TD>
                <TD className="max-w-56 truncate">{position.description ?? "—"}</TD>
                <TD><StatusBadge status={position.isActive ? "ACTIVE" : "CANCELLED"} /></TD>
                <TD className="text-right">
                  {canManage ? (
                    <div className="flex justify-end gap-2">
                      <OrgEntityDialog
                        entity="position"
                        companies={companies}
                        record={{
                          id: position.id,
                          companyId: position.companyId,
                          name: position.name,
                          code: position.code,
                          description: position.description,
                        }}
                      />
                      <ToggleActiveButton entity="position" id={position.id} isActive={position.isActive} />
                    </div>
                  ) : null}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </section>
  );
}

async function ApprovalRolesTable({ canManage, showInactive }: { canManage: boolean; showInactive: boolean }) {
  const roles = await db.approvalRole.findMany({
    where: { deletedAt: null, ...(showInactive ? {} : { isActive: true }) },
    orderBy: { name: "asc" },
  });
  return (
    <Table>
      <THead>
        <TR>
          <TH>Role</TH><TH>Description</TH><TH>Type</TH><TH>Status</TH><TH className="text-right">Actions</TH>
        </TR>
      </THead>
      <TBody>
        {roles.map((role) => (
          <TR key={role.id}>
            <TD className="font-medium">{role.name}</TD>
            <TD className="max-w-72 truncate">{role.description ?? "—"}</TD>
            <TD>{role.isSystem ? "Built-in" : "Custom"}</TD>
            <TD><StatusBadge status={role.isActive ? "ACTIVE" : "CANCELLED"} /></TD>
            <TD className="text-right">
              {canManage ? (
                <div className="flex justify-end gap-2">
                  <ApprovalRoleDialog role={{ id: role.id, name: role.name, description: role.description }} />
                  {!role.isSystem ? (
                    <ToggleActiveButton entity="approvalRole" id={role.id} isActive={role.isActive} />
                  ) : null}
                </div>
              ) : null}
            </TD>
          </TR>
        ))}
      </TBody>
    </Table>
  );
}
