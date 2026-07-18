import { requirePermission } from "@/shared/auth/guard";
import { db } from "@/shared/db";
import { PageHeader, StatCard } from "@/shared/ui/page";
import { Table, THead, TBody, TR, TH, TD, EmptyState } from "@/shared/ui/table";
import { StatusBadge } from "@/shared/ui/badge";
import { Input, Select } from "@/shared/ui/input";
import { formatDate, fullName } from "@/shared/utils";
import { ContractDialog, ContractRowActions } from "./contract-dialogs";
import type { Prisma, ContractStatus } from "@prisma/client";

export const metadata = { title: "Contracts" };
export const dynamic = "force-dynamic";

const CONTRACT_STATUSES: ContractStatus[] = ["DRAFT", "ACTIVE", "EXPIRING", "EXPIRED", "RENEWED", "TERMINATED"];

/** Contracts repository (SDS Doc 23). */
export default async function ContractsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; category?: string }>;
}) {
  const { user } = await requirePermission("contracts.view");
  const params = await searchParams;
  const q = params.q?.trim() ?? "";
  const isGlobalAdmin = user.systemRoleKey === "SYSTEM_ADMINISTRATOR";
  const canManage = user.permissions.has("contracts.manage");
  const companyScope = isGlobalAdmin ? {} : { companyId: user.companyId };

  const where: Prisma.ContractWhereInput = {
    deletedAt: null,
    ...companyScope,
    ...(params.status && CONTRACT_STATUSES.includes(params.status as ContractStatus)
      ? { status: params.status as ContractStatus }
      : {}),
    ...(params.category ? { category: params.category } : {}),
    ...(q
      ? {
          OR: [
            { contractNumber: { contains: q, mode: "insensitive" } },
            { name: { contains: q, mode: "insensitive" } },
            { vendor: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const soon = new Date(Date.now() + 60 * 86_400_000);
  const [contracts, companies, people, activeCount, expiringCount, totalCost] = await Promise.all([
    db.contract.findMany({
      where,
      orderBy: [{ endDate: "asc" }, { contractNumber: "asc" }],
      include: {
        company: { select: { name: true } },
        owner: true,
        renewals: { orderBy: { renewalDate: "desc" }, take: 1 },
      },
      take: 200,
    }),
    db.company.findMany({
      where: { deletedAt: null, isActive: true, ...(isGlobalAdmin ? {} : { id: user.companyId }) },
      orderBy: { name: "asc" }, select: { id: true, name: true },
    }),
    db.person.findMany({
      where: { deletedAt: null, isActive: true, ...companyScope },
      orderBy: { lastName: "asc" }, select: { id: true, firstName: true, lastName: true, companyId: true },
    }),
    db.contract.count({ where: { deletedAt: null, ...companyScope, status: { in: ["ACTIVE", "EXPIRING", "RENEWED"] } } }),
    db.contract.count({
      where: {
        deletedAt: null, ...companyScope,
        status: { in: ["ACTIVE", "EXPIRING"] },
        OR: [{ endDate: { lte: soon, gte: new Date() } }, { renewalDate: { lte: soon, gte: new Date() } }],
      },
    }),
    db.contract.aggregate({
      where: { deletedAt: null, ...companyScope, status: { in: ["ACTIVE", "EXPIRING", "RENEWED"] } },
      _sum: { cost: true },
    }),
  ]);

  const peopleByCompany: Record<string, { id: string; name: string }[]> = {};
  for (const person of people) {
    (peopleByCompany[person.companyId] ??= []).push({ id: person.id, name: fullName(person) });
  }

  return (
    <div>
      <PageHeader
        title="Contracts"
        description="Vendor contracts, subscriptions, warranties and renewals with automatic reminders."
        actions={canManage ? <ContractDialog companies={companies} peopleByCompany={peopleByCompany} /> : undefined}
      />

      <div className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-3">
        <StatCard label="Active contracts" value={activeCount} tone="success" />
        <StatCard label="Expiring ≤ 60 days" value={expiringCount} tone={expiringCount > 0 ? "warning" : "default"} />
        <StatCard label="Active contract value" value={totalCost._sum.cost ? Number(totalCost._sum.cost).toLocaleString() : "0"} />
      </div>

      <form method="get" className="mb-4 flex flex-wrap items-end gap-2">
        <Input name="q" defaultValue={q} placeholder="Search number, name, vendor…" className="w-full sm:w-64" aria-label="Search contracts" />
        <Select name="status" defaultValue={params.status ?? ""} className="w-full sm:w-40" aria-label="Filter by status">
          <option value="">All statuses</option>
          {CONTRACT_STATUSES.map((status) => (
            <option key={status} value={status}>{status}</option>
          ))}
        </Select>
        <Select name="category" defaultValue={params.category ?? ""} className="w-full sm:w-44" aria-label="Filter by category">
          <option value="">All categories</option>
          {["Software", "Hardware Support", "Cloud Services", "Internet", "Telecom", "Maintenance", "Warranty", "Other"].map((category) => (
            <option key={category} value={category}>{category}</option>
          ))}
        </Select>
        <button type="submit" className="h-9 rounded-md border bg-card px-4 text-sm hover:bg-accent">Filter</button>
      </form>

      {contracts.length === 0 ? (
        <EmptyState title="No contracts" description="Record vendor contracts to track costs, expiry and renewals." />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Contract</TH><TH>Vendor</TH><TH>Category</TH><TH>Company</TH><TH>Period</TH><TH>Renewal</TH><TH>Cost</TH><TH>Owner</TH><TH>Status</TH>
              {canManage ? <TH className="text-right">Actions</TH> : null}
            </TR>
          </THead>
          <TBody>
            {contracts.map((contract) => (
              <TR key={contract.id}>
                <TD>
                  <span className="font-medium">{contract.contractNumber}</span>
                  <p className="max-w-48 truncate text-xs text-muted-foreground">{contract.name}</p>
                </TD>
                <TD>{contract.vendor}</TD>
                <TD>{contract.category}</TD>
                <TD>{contract.company.name}</TD>
                <TD className="whitespace-nowrap text-xs">
                  {contract.startDate ? formatDate(contract.startDate) : "—"} → {contract.endDate ? formatDate(contract.endDate) : "—"}
                </TD>
                <TD className="text-xs">
                  {contract.renewalDate ? formatDate(contract.renewalDate) : "—"}
                  <p className="text-muted-foreground">{contract.renewalType.toLowerCase()}</p>
                </TD>
                <TD>{contract.cost ? `${Number(contract.cost).toLocaleString()} ${contract.currency ?? ""}` : "—"}</TD>
                <TD>{contract.owner ? fullName(contract.owner) : "—"}</TD>
                <TD><StatusBadge status={contract.status} /></TD>
                {canManage ? (
                  <TD className="text-right">
                    <ContractRowActions
                      contract={{
                        id: contract.id,
                        companyId: contract.companyId,
                        contractNumber: contract.contractNumber,
                        name: contract.name,
                        vendor: contract.vendor,
                        category: contract.category,
                        status: contract.status,
                        startDate: contract.startDate?.toISOString().slice(0, 10) ?? null,
                        endDate: contract.endDate?.toISOString().slice(0, 10) ?? null,
                        renewalDate: contract.renewalDate?.toISOString().slice(0, 10) ?? null,
                        renewalType: contract.renewalType,
                        cost: contract.cost ? Number(contract.cost) : null,
                        currency: contract.currency,
                        ownerPersonId: contract.ownerPersonId,
                        notes: contract.notes,
                      }}
                      companies={companies}
                      peopleByCompany={peopleByCompany}
                    />
                  </TD>
                ) : null}
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </div>
  );
}
