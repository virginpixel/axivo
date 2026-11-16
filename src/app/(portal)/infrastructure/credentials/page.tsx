import Link from "next/link";
import { requirePermission } from "@/shared/auth/guard";
import { db } from "@/shared/db";
import { PageHeader, Pagination } from "@/shared/ui/page";
import { Table, THead, TBody, TR, TH, TD, EmptyState } from "@/shared/ui/table";
import { Select } from "@/shared/ui/input";
import { LiveSearch } from "@/shared/ui/live-search";
import { formatDate } from "@/shared/utils";
import type { Prisma } from "@prisma/client";
import { CredentialSetDialog, RevealPassword, NoPasswordNote } from "../credential-dialogs";

export const metadata = { title: "Credential vault" };
export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

/** Credential sets: one login each, shared by any number of devices (SDS Doc 24). */
export default async function CredentialVaultPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; company?: string; page?: string }>;
}) {
  const { user } = await requirePermission("infrastructure.view");
  const params = await searchParams;
  const q = params.q?.trim() ?? "";
  const page = Math.max(1, Number(params.page) || 1);
  const isGlobalAdmin = user.systemRoleKey === "SYSTEM_ADMINISTRATOR";
  const canManage = user.permissions.has("infrastructure.credentials.manage");
  const canReveal = user.permissions.has("infrastructure.credentials.reveal");

  const visible: Prisma.CredentialSetWhereInput = isGlobalAdmin
    ? {}
    : { OR: [{ companyId: user.companyId }, { companyId: null }] };
  const companyFilter: Prisma.CredentialSetWhereInput =
    params.company === "shared" ? { companyId: null } : params.company ? { companyId: params.company } : {};
  const where: Prisma.CredentialSetWhereInput = {
    deletedAt: null,
    AND: [
      visible,
      companyFilter,
      q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { username: { contains: q, mode: "insensitive" } },
              { devices: { some: { device: { name: { contains: q, mode: "insensitive" }, deletedAt: null } } } },
            ],
          }
        : {},
    ],
  };

  const [sets, total, companies] = await Promise.all([
    db.credentialSet.findMany({
      where,
      orderBy: { name: "asc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      // No ciphertext: the list only needs to know whether a password exists.
      select: {
        id: true, name: true, username: true, notes: true, companyId: true, passwordChangedAt: true,
        company: { select: { name: true } },
        _count: { select: { devices: { where: { device: { deletedAt: null } } } } },
      },
    }),
    db.credentialSet.count({ where }),
    db.company.findMany({
      where: { deletedAt: null, isActive: true, ...(isGlobalAdmin ? {} : { id: user.companyId }) },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  return (
    <div>
      <PageHeader
        title="Credential vault"
        description={`The logins used to manage your network devices and servers. Passwords are stored encrypted and ${canReveal ? "every reveal is recorded in the audit log" : "only shown to people allowed to reveal them"}.`}
        actions={canManage ? <CredentialSetDialog companies={companies} canShare={isGlobalAdmin} /> : undefined}
      />

      <div className="mb-4 flex flex-wrap items-end gap-2">
        <LiveSearch placeholder="Search name, username or device" className="w-full sm:w-72" />
        <form method="get" className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="q" value={q} />
          <Select name="company" defaultValue={params.company ?? ""} className="w-full sm:w-48" aria-label="Filter by company">
            <option value="">All</option>
            <option value="shared">Shared</option>
            {companies.map((company) => (
              <option key={company.id} value={company.id}>{company.name}</option>
            ))}
          </Select>
          <button type="submit" className="h-9 rounded-full border border-input bg-card px-4 text-sm font-medium transition-colors hover:border-primary/40 hover:bg-accent hover:text-accent-foreground">Filter</button>
        </form>
      </div>

      {sets.length === 0 ? (
        <EmptyState
          title={q || params.company ? "Nothing matches" : "The vault is empty"}
          description={
            q || params.company
              ? "Try another search."
              : "Create a credential set for each login, or import a server list that has Username and Password columns."
          }
        />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Name</TH><TH>Username</TH><TH>Company</TH><TH>Devices</TH><TH>Password set</TH>
              {canReveal ? <TH>Password</TH> : null}
              {canManage ? <TH className="text-right">Edit</TH> : null}
            </TR>
          </THead>
          <TBody>
            {sets.map((set) => (
              <TR key={set.id}>
                <TD>
                  <Link href={`/infrastructure/credentials/${set.id}`} className="font-medium text-foreground hover:underline">{set.name}</Link>
                </TD>
                <TD className="font-mono text-xs">{set.username ?? "None"}</TD>
                <TD>{set.company?.name ?? "Shared"}</TD>
                <TD className="tabular-nums">{set._count.devices}</TD>
                <TD className="text-xs">{set.passwordChangedAt ? formatDate(set.passwordChangedAt) : <NoPasswordNote />}</TD>
                {canReveal ? (
                  <TD>{set.passwordChangedAt ? <RevealPassword id={set.id} compact /> : null}</TD>
                ) : null}
                {canManage ? (
                  <TD className="text-right">
                    {set.companyId === null && !isGlobalAdmin ? null : (
                      <CredentialSetDialog
                        companies={companies}
                        canShare={isGlobalAdmin}
                        set={{ id: set.id, companyId: set.companyId, name: set.name, username: set.username, notes: set.notes, hasPassword: !!set.passwordChangedAt }}
                      />
                    )}
                  </TD>
                ) : null}
              </TR>
            ))}
          </TBody>
        </Table>
      )}
      <Pagination
        page={page}
        pageCount={Math.max(1, Math.ceil(total / PAGE_SIZE))}
        total={total}
        buildHref={(next) => {
          const search = new URLSearchParams();
          if (q) search.set("q", q);
          if (params.company) search.set("company", params.company);
          search.set("page", String(next));
          return `/infrastructure/credentials?${search.toString()}`;
        }}
      />
    </div>
  );
}
