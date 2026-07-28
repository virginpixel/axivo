import Link from "next/link";
import { requirePermission } from "@/shared/auth/guard";
import { db } from "@/shared/db";
import { getSetting, SETTING_KEYS } from "@/shared/settings/settings";
import { LiveSearch } from "@/shared/ui/live-search";
import { PageHeader, StatCard, Pagination } from "@/shared/ui/page";
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
  searchParams: Promise<{ q?: string; status?: string; category?: string; company?: string; page?: string }>;
}) {
  const { user } = await requirePermission("contracts.view");
  const params = await searchParams;
  const q = params.q?.trim() ?? "";
  const page = Math.max(1, Number(params.page) || 1);
  const pageSize = 25;
  const isGlobalAdmin = user.systemRoleKey === "SYSTEM_ADMINISTRATOR";
  const canManage = user.permissions.has("contracts.manage");
  const companyScope = isGlobalAdmin ? {} : { companyId: user.companyId };

  const where: Prisma.ContractWhereInput = {
    deletedAt: null,
    ...companyScope,
    ...(isGlobalAdmin && params.company ? { companyId: params.company } : {}),
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
  const [contracts, contractTotal, companies, people, activeCount, expiringCount, totalCost, catalogItems] = await Promise.all([
    db.contract.findMany({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: [{ endDate: "asc" }, { contractNumber: "asc" }],
      include: {
        company: { select: { name: true } },
        owner: true,
        renewals: { orderBy: { renewalDate: "desc" }, take: 1 },
      },
    }),
    db.contract.count({ where }),
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
    db.contract.findMany({
      where: { deletedAt: null, ...companyScope, status: { in: ["ACTIVE", "EXPIRING", "RENEWED"] } },
      select: { cost: true, currency: true },
    }),
    db.catalogItem.findMany({
      where: { deletedAt: null, isActive: true, kind: "CONTRACT_CATEGORY" },
      orderBy: { name: "asc" },
      select: { id: true, kind: true, name: true },
    }),
  ]);

  const [vendorItems, currencyItems, general] = await Promise.all([
    db.vendor.findMany({ where: { deletedAt: null, isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.currency.findMany({ where: { deletedAt: null, isActive: true }, orderBy: { code: "asc" }, select: { code: true, name: true, rateToBase: true } }),
    getSetting<{ defaultCurrency?: string }>(SETTING_KEYS.GENERAL),
  ]);
  const baseCurrency = general.defaultCurrency ?? "USD";
  const rateFor = (code: string | null) => {
    if (!code) return 1;
    const match = currencyItems.find((c) => c.code === code);
    return match ? Number(match.rateToBase) : 1;
  };
  // Convert each active contract's cost to the base currency for a combined total.
  const totalCostBase = totalCost.reduce((sum, row) => sum + (row.cost ? Number(row.cost) * rateFor(row.currency) : 0), 0);
  const catalogs = {
    vendors: vendorItems,
    categories: catalogItems.filter((item) => item.kind === "CONTRACT_CATEGORY"),
    currencies: currencyItems.map((c) => ({ code: c.code, name: c.name })),
  };

  const peopleByCompany: Record<string, { id: string; name: string }[]> = {};
  for (const person of people) {
    (peopleByCompany[person.companyId] ??= []).push({ id: person.id, name: fullName(person) });
  }

  return (
    <div>
      <PageHeader
        title="Contracts"
        description="Vendor contracts, subscriptions, warranties and renewals with automatic reminders."
        actions={
          canManage ? (
            <ContractDialog companies={companies} peopleByCompany={peopleByCompany} catalogs={catalogs} />
          ) : undefined
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-3">
        <StatCard label="Active contracts" value={activeCount} tone="success" />
        <StatCard label="Expiring ≤ 60 days" value={expiringCount} tone={expiringCount > 0 ? "warning" : "default"} />
        <StatCard label={`Active value (${baseCurrency})`} value={totalCostBase ? Math.round(totalCostBase).toLocaleString() : "0"} />
      </div>

      <div className="mb-4 flex flex-wrap items-end gap-2">
        <LiveSearch placeholder="Search number, name, vendor" className="w-full sm:w-64" />
        <form method="get" className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="q" value={q} />
          {isGlobalAdmin ? (
            <Select name="company" defaultValue={params.company ?? ""} className="w-full sm:w-40" aria-label="Filter by company">
              <option value="">All companies</option>
              {companies.map((company) => (
                <option key={company.id} value={company.id}>{company.name}</option>
              ))}
            </Select>
          ) : null}
          <Select name="status" defaultValue={params.status ?? ""} className="w-full sm:w-40" aria-label="Filter by status">
            <option value="">All statuses</option>
            {CONTRACT_STATUSES.map((status) => (
              <option key={status} value={status}>{status}</option>
            ))}
          </Select>
          <Select name="category" defaultValue={params.category ?? ""} className="w-full sm:w-44" aria-label="Filter by category">
            <option value="">All categories</option>
            {catalogs.categories.map((category) => (
              <option key={category.id} value={category.name}>{category.name}</option>
            ))}
          </Select>
          <button type="submit" className="h-9 rounded-md border border-input bg-card px-3.5 text-sm font-medium transition-colors hover:border-primary/40 hover:bg-accent hover:text-accent-foreground">Filter</button>
        </form>
      </div>

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
                  <Link href={`/contracts/${contract.id}`} className="font-medium text-primary hover:underline">
                    {contract.name}
                  </Link>
                  {contract.contractNumber ? (
                    <p className="max-w-48 truncate text-xs text-muted-foreground">{contract.contractNumber}</p>
                  ) : null}
                </TD>
                <TD>{contract.vendor}</TD>
                <TD>{contract.category}</TD>
                <TD>{contract.company.name}</TD>
                <TD className="whitespace-nowrap text-xs">
                  {contract.startDate ? formatDate(contract.startDate) : "None"} → {contract.endDate ? formatDate(contract.endDate) : "None"}
                </TD>
                <TD className="text-xs">
                  {contract.renewalDate ? formatDate(contract.renewalDate) : "None"}
                  <p className="text-muted-foreground">{contract.renewalType.toLowerCase()}</p>
                </TD>
                <TD>{contract.cost ? `${Number(contract.cost).toLocaleString()} ${contract.currency ?? ""}` : "None"}</TD>
                <TD>{contract.owner ? fullName(contract.owner) : "None"}</TD>
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
                      catalogs={catalogs}
                    />
                  </TD>
                ) : null}
              </TR>
            ))}
          </TBody>
        </Table>
      )}
      <Pagination
        page={page}
        pageCount={Math.max(1, Math.ceil(contractTotal / pageSize))}
        total={contractTotal}
        buildHref={(next) => {
          const search = new URLSearchParams();
          if (q) search.set("q", q);
          if (params.status) search.set("status", params.status);
          if (params.category) search.set("category", params.category);
          if (params.company) search.set("company", params.company);
          search.set("page", String(next));
          return `/contracts?${search.toString()}`;
        }}
      />
    </div>
  );
}
