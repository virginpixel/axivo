import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/shared/auth/guard";
import { db } from "@/shared/db";
import { PageHeader } from "@/shared/ui/page";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { StatusBadge } from "@/shared/ui/badge";
import { formatDate, fullName } from "@/shared/utils";
import { ContractRowActions } from "../contract-dialogs";
import { ContractDocuments } from "./contract-documents";

export const dynamic = "force-dynamic";

/** Contract detail: overview, links and a Documents tab (per-year PDFs). */
export default async function ContractDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { user } = await requirePermission("contracts.view");
  const { id } = await params;
  const isGlobalAdmin = user.systemRoleKey === "SYSTEM_ADMINISTRATOR";
  const canManage = user.permissions.has("contracts.manage");

  const contract = await db.contract.findFirst({
    where: { id, deletedAt: null, ...(isGlobalAdmin ? {} : { companyId: user.companyId }) },
    include: {
      company: { select: { id: true, name: true } },
      owner: true,
      renewals: { orderBy: { renewalDate: "desc" } },
      licenses: { where: { deletedAt: null }, select: { id: true, name: true } },
    },
  });
  if (!contract) notFound();

  const [companies, people, docLinks, vendorItems, categoryItems] = await Promise.all([
    db.company.findMany({
      where: { deletedAt: null, isActive: true, ...(isGlobalAdmin ? {} : { id: user.companyId }) },
      orderBy: { name: "asc" }, select: { id: true, name: true },
    }),
    db.person.findMany({
      where: { deletedAt: null, isActive: true, companyId: contract.companyId },
      orderBy: { lastName: "asc" }, select: { id: true, firstName: true, lastName: true, companyId: true },
    }),
    db.documentLink.findMany({
      where: { entityType: "contract", entityId: contract.id, removedAt: null },
      orderBy: { createdAt: "desc" },
      include: { document: { select: { id: true, name: true, createdAt: true } } },
    }),
    db.vendor.findMany({ where: { deletedAt: null, isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.catalogItem.findMany({ where: { deletedAt: null, isActive: true, kind: "CONTRACT_CATEGORY" }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  const currencyItems = await db.currency.findMany({ where: { deletedAt: null, isActive: true }, orderBy: { code: "asc" }, select: { code: true, name: true } });

  const peopleByCompany: Record<string, { id: string; name: string }[]> = {};
  for (const person of people) {
    (peopleByCompany[person.companyId] ??= []).push({ id: person.id, name: fullName(person) });
  }
  const catalogs = { vendors: vendorItems, categories: categoryItems, currencies: currencyItems };
  const documents = docLinks
    .filter((link) => link.document)
    .map((link) => ({ id: link.document!.id, name: link.document!.name, createdAt: formatDate(link.document!.createdAt) }));

  return (
    <div>
      <PageHeader
        title={contract.name}
        breadcrumbs={[{ label: "Contracts", href: "/contracts" }, { label: contract.name }]}
        description={[contract.vendor, contract.category, contract.company.name].filter(Boolean).join(" · ")}
        actions={
          canManage ? (
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
              hideView
            />
          ) : (
            <StatusBadge status={contract.status} />
          )
        }
      />

      <div className="grid gap-5 lg:grid-cols-3">
        <Card>
          <CardHeader><CardTitle>Overview</CardTitle></CardHeader>
          <CardContent>
            <dl className="space-y-2 text-sm">
              <Row label="Status" value={<StatusBadge status={contract.status} />} />
              <Row label="Contract number" value={contract.contractNumber ?? "None"} />
              <Row label="Vendor" value={contract.vendor} />
              <Row label="Category" value={contract.category} />
              <Row label="Period" value={`${contract.startDate ? formatDate(contract.startDate) : "None"} → ${contract.endDate ? formatDate(contract.endDate) : "None"}`} />
              <Row label="Renewal" value={`${contract.renewalDate ? formatDate(contract.renewalDate) : "None"} (${contract.renewalType.toLowerCase()})`} />
              <Row label="Cost" value={contract.cost ? `${Number(contract.cost).toLocaleString()} ${contract.currency ?? ""}` : "None"} />
              <Row label="Owner" value={contract.owner ? fullName(contract.owner) : "None"} />
              {contract.notes ? <Row label="Notes" value={contract.notes} /> : null}
            </dl>
            {contract.licenses.length > 0 ? (
              <div className="mt-4 border-t pt-3 text-sm">
                <p className="mb-1 label-caps text-muted-foreground">Linked licenses</p>
                <ul className="space-y-1">
                  {contract.licenses.map((license) => (
                    <li key={license.id}>
                      <Link href={`/licenses/${license.id}`} className="text-primary hover:underline">{license.name}</Link>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Documents</CardTitle></CardHeader>
          <CardContent>
            <ContractDocuments contractId={contract.id} documents={documents} canManage={canManage} />
          </CardContent>
        </Card>
      </div>

      {contract.renewals.length > 0 ? (
        <Card className="mt-5">
          <CardHeader><CardTitle>Renewal history</CardTitle></CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm">
              {contract.renewals.map((renewal) => (
                <li key={renewal.id} className="flex flex-wrap items-center justify-between gap-2 border-b pb-2 last:border-0">
                  <span>Renewed {formatDate(renewal.renewalDate)}</span>
                  <span className="text-muted-foreground">
                    {renewal.newStartDate ? formatDate(renewal.newStartDate) : "None"} → {renewal.newEndDate ? formatDate(renewal.newEndDate) : "None"}
                    {renewal.cost ? ` · ${Number(renewal.cost).toLocaleString()}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 border-b pb-2 last:border-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
  );
}
