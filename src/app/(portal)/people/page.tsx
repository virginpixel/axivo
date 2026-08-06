import Link from "next/link";
import { requirePermission } from "@/shared/auth/guard";
import { db } from "@/shared/db";
import { PageHeader, Pagination } from "@/shared/ui/page";
import { Table, THead, TBody, TR, TH, TD, EmptyState } from "@/shared/ui/table";
import { StatusBadge, Badge } from "@/shared/ui/badge";
import { Input, Select } from "@/shared/ui/input";
import { LiveSearch } from "@/shared/ui/live-search";
import { fullName } from "@/shared/utils";
import { PersonDialog } from "./person-dialogs";
import type { Prisma } from "@prisma/client";

export const metadata = { title: "People" };
export const dynamic = "force-dynamic";

/** People directory (SDS Doc 07 Ch11): search, filters, pagination. */
export default async function PeoplePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; company?: string; department?: string; status?: string; page?: string }>;
}) {
  const { user } = await requirePermission("people.view");
  const params = await searchParams;
  const page = Math.max(1, Number(params.page) || 1);
  const pageSize = 25;
  const isGlobalAdmin = user.systemRoleKey === "SYSTEM_ADMINISTRATOR";
  const canManage = user.permissions.has("people.manage");

  const companyScope = isGlobalAdmin ? {} : { companyId: user.companyId };
  const where: Prisma.PersonWhereInput = {
    deletedAt: null,
    ...companyScope,
    ...(params.company && isGlobalAdmin ? { companyId: params.company } : {}),
    ...(params.department ? { departmentId: params.department } : {}),
    ...(params.status ? { employmentStatus: params.status as never } : {}),
    ...(params.q
      ? {
          OR: [
            { employeeId: { contains: params.q, mode: "insensitive" } },
            { firstName: { contains: params.q, mode: "insensitive" } },
            { lastName: { contains: params.q, mode: "insensitive" } },
            { email: { contains: params.q, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [rows, total, companies, departments, positions, locations] = await Promise.all([
    db.person.findMany({
      where,
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        company: { select: { name: true } },
        department: { select: { name: true } },
        position: { select: { name: true } },
        systemUser: { select: { id: true, username: true, isEnabled: true } },
      },
    }),
    db.person.count({ where }),
    db.company.findMany({
      where: { deletedAt: null, ...(isGlobalAdmin ? {} : { id: user.companyId }) },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    db.department.findMany({
      where: { deletedAt: null, isActive: true, ...(isGlobalAdmin ? {} : { companyId: user.companyId }) },
      orderBy: { name: "asc" },
      select: { id: true, name: true, companyId: true },
    }),
    db.position.findMany({
      where: { deletedAt: null, isActive: true, ...(isGlobalAdmin ? {} : { companyId: user.companyId }) },
      orderBy: { name: "asc" },
      select: { id: true, name: true, companyId: true },
    }),
    db.location.findMany({
      where: { deletedAt: null, isActive: true, ...(isGlobalAdmin ? {} : { companyId: user.companyId }) },
      orderBy: { name: "asc" },
      select: { id: true, name: true, companyId: true },
    }),
  ]);
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  const orgData = { companies, departments, positions, locations };

  return (
    <div>
      <PageHeader
        title="People"
        description="Central employee directory referenced by every module."
        actions={canManage ? <PersonDialog orgData={orgData} /> : undefined}
      />

      <div className="mb-4 flex flex-wrap items-end gap-2">
        <LiveSearch placeholder="Search ID, name, email" className="w-full sm:w-64" />
        <form method="get" className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="q" value={params.q ?? ""} />
          {isGlobalAdmin ? (
            <Select name="company" defaultValue={params.company ?? ""} className="w-full sm:w-48" aria-label="Filter by company">
              <option value="">All companies</option>
              {companies.map((company) => (
                <option key={company.id} value={company.id}>{company.name}</option>
              ))}
            </Select>
          ) : null}
          <Select name="department" defaultValue={params.department ?? ""} className="w-full sm:w-48" aria-label="Filter by department">
            <option value="">All departments</option>
            {departments.map((department) => (
              <option key={department.id} value={department.id}>
                {isGlobalAdmin
                  ? `${department.name} — ${companies.find((c) => c.id === department.companyId)?.name ?? ""}`
                  : department.name}
              </option>
            ))}
          </Select>
          <Select name="status" defaultValue={params.status ?? ""} className="w-full sm:w-44" aria-label="Filter by employment status">
            <option value="">All statuses</option>
            {["ACTIVE", "ON_LEAVE", "SUSPENDED", "RESIGNED", "TERMINATED"].map((status) => (
              <option key={status} value={status}>{status.replace("_", " ")}</option>
            ))}
          </Select>
          <button type="submit" className="h-9 rounded-md border border-input bg-card px-3.5 text-sm font-medium transition-colors hover:border-primary/40 hover:bg-accent hover:text-accent-foreground">
            Filter
          </button>
        </form>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title="No people found"
          description="Add employees to the directory so they can receive applications, assets and licenses."
          action={canManage ? <PersonDialog orgData={orgData} /> : undefined}
        />
      ) : (
        <>
          <Table>
            <THead>
              <TR>
                <TH>Employee</TH><TH>Employee ID</TH><TH>Company</TH><TH>Department</TH><TH>Position</TH><TH>Portal account</TH><TH>Status</TH>
              </TR>
            </THead>
            <TBody>
              {rows.map((person) => (
                <TR key={person.id}>
                  <TD>
                    <Link href={`/people/${person.id}`} className="font-medium text-primary hover:underline">
                      {fullName(person)}
                    </Link>
                    <p className="text-xs text-muted-foreground">{person.email}</p>
                  </TD>
                  <TD className="font-register text-muted-foreground">{person.employeeId}</TD>
                  <TD>{person.company.name}</TD>
                  <TD>{person.department?.name ?? "None"}</TD>
                  <TD>{person.position?.name ?? "None"}</TD>
                  <TD>
                    {person.systemUser ? (
                      <span className="flex items-center gap-1.5 text-xs">
                        <span className="font-register">{person.systemUser.username}</span>
                        {!person.systemUser.isEnabled ? <Badge variant="destructive">Disabled</Badge> : null}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">None</span>
                    )}
                  </TD>
                  <TD><StatusBadge status={person.employmentStatus} /></TD>
                </TR>
              ))}
            </TBody>
          </Table>
          <Pagination
            page={page}
            pageCount={pageCount}
            total={total}
            buildHref={(p) => {
              const search = new URLSearchParams();
              if (params.q) search.set("q", params.q);
              if (params.company) search.set("company", params.company);
              if (params.status) search.set("status", params.status);
              search.set("page", String(p));
              return `/people?${search.toString()}`;
            }}
          />
        </>
      )}
    </div>
  );
}
