import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/shared/auth/guard";
import { db } from "@/shared/db";
import { PageHeader } from "@/shared/ui/page";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { Table, THead, TBody, TR, TH, TD, EmptyState } from "@/shared/ui/table";
import { StatusBadge } from "@/shared/ui/badge";
import { formatDate, cn } from "@/shared/utils";
import { AssetListCard } from "../../asset-list-card";

export const dynamic = "force-dynamic";

/** Vendor detail: contact info + assets and contracts tabs. */
export default async function VendorDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ view?: string }>;
}) {
  await requirePermission("settings.view");
  const { id } = await params;
  const view = (await searchParams).view === "contracts" ? "contracts" : "assets";
  const vendor = await db.vendor.findFirst({ where: { id, deletedAt: null } });
  if (!vendor) notFound();

  const [assets, contracts] = await Promise.all([
    db.asset.findMany({
      where: { deletedAt: null, supplier: vendor.name },
      orderBy: { name: "asc" },
      include: { category: { select: { name: true } }, location: { select: { name: true } } },
    }),
    db.contract.findMany({
      where: { deletedAt: null, vendor: vendor.name },
      orderBy: { createdAt: "desc" },
      include: { company: { select: { name: true } } },
    }),
  ]);

  return (
    <div>
      <PageHeader
        title={vendor.name}
        breadcrumbs={[{ label: "Settings", href: "/settings?tab=vendors" }, { label: "Vendors", href: "/settings?tab=vendors" }, { label: vendor.name }]}
        description={`${assets.length} asset(s) · ${contracts.length} contract(s)`}
      />
      <div className="mb-5 grid gap-5 lg:grid-cols-3">
        <Card>
          <CardHeader><CardTitle>Contact</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {vendor.logoPath ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={`/api/vendors/${vendor.id}/logo`} alt={vendor.name} className="max-h-20 max-w-full object-contain" />
            ) : null}
            <dl className="space-y-2 text-sm">
              <Row label="Contact name" value={vendor.contactName ?? "None"} />
              <Row label="Phone" value={vendor.contactPhone ?? "None"} />
              <Row label="Email" value={vendor.contactEmail ?? "None"} />
              {vendor.notes ? <Row label="Notes" value={vendor.notes} /> : null}
            </dl>
          </CardContent>
        </Card>
        <div className="lg:col-span-2">
          <nav className="mb-3 flex gap-1 border-b" aria-label="Vendor sections">
            {(["assets", "contracts"] as const).map((key) => (
              <Link
                key={key}
                href={`/settings/vendors/${vendor.id}?view=${key}`}
                aria-current={view === key ? "page" : undefined}
                className={cn(
                  "-mb-px border-b-2 px-4 py-2 text-sm font-medium capitalize",
                  view === key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {key} ({key === "assets" ? assets.length : contracts.length})
              </Link>
            ))}
          </nav>
          {view === "assets" ? (
            <AssetListCard
              title="Assets"
              assets={assets.map((asset) => ({
                id: asset.id,
                name: asset.name,
                assetTag: asset.assetTag,
                status: asset.status,
                category: asset.category?.name ?? null,
                location: asset.location?.name ?? null,
              }))}
            />
          ) : (
            <Card>
              <CardHeader><CardTitle>Contracts ({contracts.length})</CardTitle></CardHeader>
              <CardContent>
                {contracts.length === 0 ? (
                  <EmptyState title="No contracts" description="No contracts recorded for this vendor." />
                ) : (
                  <Table>
                    <THead><TR><TH>Contract</TH><TH>Company</TH><TH>End date</TH><TH>Status</TH></TR></THead>
                    <TBody>
                      {contracts.map((contract) => (
                        <TR key={contract.id}>
                          <TD className="font-medium">
                            <Link href={`/contracts/${contract.id}`} className="hover:underline">
                              {contract.contractNumber ? `${contract.contractNumber} · ` : ""}{contract.name}
                            </Link>
                          </TD>
                          <TD>{contract.company.name}</TD>
                          <TD>{contract.endDate ? formatDate(contract.endDate) : "None"}</TD>
                          <TD><StatusBadge status={contract.status} /></TD>
                        </TR>
                      ))}
                    </TBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-0.5">{value}</dd>
    </div>
  );
}
