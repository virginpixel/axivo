import Link from "next/link";
import { requirePermission } from "@/shared/auth/guard";
import { db } from "@/shared/db";
import { PageHeader } from "@/shared/ui/page";
import { Table, THead, TBody, TR, TH, TD, EmptyState } from "@/shared/ui/table";
import { StatusBadge } from "@/shared/ui/badge";
import { cn } from "@/shared/utils";
import { CompanyDialog, OrgEntityDialog, ToggleActiveButton, ApprovalRoleDialog } from "./org-dialogs";
import { AssignmentManager, DepartmentHeadManager } from "./sections";

export const metadata = { title: "Organization" };
export const dynamic = "force-dynamic";

const TABS = [
  { key: "companies", label: "Companies" },
  { key: "departments", label: "Departments" },
  { key: "locations", label: "Locations" },
  { key: "positions", label: "Positions" },
  { key: "approval-roles", label: "Approval Roles" },
  { key: "department-heads", label: "Department Heads" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

/** Organization administration (SDS Doc 06 Ch8). */
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
  const nameFilter = q ? { name: { contains: q, mode: "insensitive" as const } } : {};
  const activeFilter = showInactive ? {} : { isActive: true };

  return (
    <div>
      <PageHeader title="Organization" description="Companies, departments, locations, positions and approval routing." />

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
                  <TH>Name</TH><TH>Code</TH><TH>Timezone</TH><TH>Currency</TH><TH>Status</TH><TH className="text-right">Actions</TH>
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
                      <TD>{company.timezone}</TD>
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
                                timezone: company.timezone,
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

      {tab === "departments" || tab === "locations" || tab === "positions" ? (
        <OrgEntitySection
          tab={tab}
          companies={companies.map((company) => ({ id: company.id, name: company.name }))}
          companyIds={companyIds}
          nameFilter={nameFilter}
          activeFilter={activeFilter}
          canManage={canManage}
        />
      ) : null}

      {tab === "approval-roles" ? (
        <section aria-label="Approval roles" className="space-y-6">
          <div className="flex justify-end">{canManageRoles ? <ApprovalRoleDialog /> : null}</div>
          <ApprovalRolesTable canManage={canManageRoles} showInactive={showInactive} />
          <AssignmentManager
            canManage={canManageRoles}
            companies={companies.map((company) => ({ id: company.id, name: company.name }))}
          />
        </section>
      ) : null}

      {tab === "department-heads" ? (
        <DepartmentHeadManager
          canManage={canManage}
          companies={companies.map((company) => ({ id: company.id, name: company.name }))}
        />
      ) : null}
    </div>
  );
}

async function OrgEntitySection({
  tab,
  companies,
  companyIds,
  nameFilter,
  activeFilter,
  canManage,
}: {
  tab: "departments" | "locations" | "positions";
  companies: { id: string; name: string }[];
  companyIds: string[];
  nameFilter: object;
  activeFilter: object;
  canManage: boolean;
}) {
  const where = { deletedAt: null, companyId: { in: companyIds }, ...nameFilter, ...activeFilter };
  const rows =
    tab === "departments"
      ? await db.department.findMany({ where, orderBy: { name: "asc" }, include: { company: true } })
      : tab === "locations"
        ? await db.location.findMany({ where, orderBy: { name: "asc" }, include: { company: true } })
        : await db.position.findMany({ where, orderBy: { name: "asc" }, include: { company: true } });

  const singular = tab === "departments" ? "department" : tab === "locations" ? "location" : "position";

  return (
    <section aria-label={tab}>
      <div className="mb-3 flex justify-end">
        {canManage ? <OrgEntityDialog entity={singular} companies={companies} /> : null}
      </div>
      {rows.length === 0 ? (
        <EmptyState title={`No ${tab}`} description={`Create ${tab} to structure each company.`} />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Name</TH><TH>Code</TH><TH>Company</TH><TH>Description</TH><TH>Status</TH><TH className="text-right">Actions</TH>
            </TR>
          </THead>
          <TBody>
            {rows.map((row) => (
              <TR key={row.id}>
                <TD className="font-medium">{row.name}</TD>
                <TD>{row.code ?? "—"}</TD>
                <TD>{row.company.name}</TD>
                <TD className="max-w-56 truncate">{row.description ?? "—"}</TD>
                <TD><StatusBadge status={row.isActive ? "ACTIVE" : "CANCELLED"} /></TD>
                <TD className="text-right">
                  {canManage ? (
                    <div className="flex justify-end gap-2">
                      <OrgEntityDialog
                        entity={singular}
                        companies={companies}
                        record={{
                          id: row.id,
                          companyId: row.companyId,
                          name: row.name,
                          code: row.code,
                          description: row.description,
                        }}
                      />
                      <ToggleActiveButton entity={singular} id={row.id} isActive={row.isActive} />
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
