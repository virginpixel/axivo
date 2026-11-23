import Link from "next/link";
import { TriangleAlert } from "lucide-react";
import { requirePermission } from "@/shared/auth/guard";
import { PageHeader, StatCard } from "@/shared/ui/page";
import { EmptyState } from "@/shared/ui/table";
import { SortableTable } from "@/shared/ui/sortable-table";
import { Badge } from "@/shared/ui/badge";
import { CompanyPill } from "@/shared/ui/filter-pill";
import { LiveSearch } from "@/shared/ui/live-search";
import { DeleteButton } from "@/shared/ui/delete-button";
import { loadPlan, lookupIp } from "@/modules/infrastructure/ipam";
import { ipToNumber, isIpv4 } from "@/modules/infrastructure/ip-math";
import { deleteVlanAction } from "@/modules/infrastructure/actions";
import { IP_PLAN_STATUS_LABELS } from "@/modules/infrastructure/validators";
import { loadIpCatalogs } from "./catalogs";
import { SubnetDialog, VlanDialog } from "./ip-dialogs";

export const dynamic = "force-dynamic";
export const metadata = { title: "IP & VLANs" };

const SHOW = [
  { value: "", label: "All VLANs" },
  { value: "subnet", label: "With a subnet" },
  { value: "overlap", label: "Overlapping" },
  { value: "unused", label: "Not in use" },
] as const;

const STATUS_BADGE = { ACTIVE: "success", RESERVED: "info", UNUSED: "default" } as const;

/** A subnet sorts by where its range starts, so 10.100.9.0 comes before 10.100.10.0. */
function cidrSort(cidr: string | undefined): number | null {
  return cidr ? ipToNumber(cidr.split("/")[0]!) : null;
}

/** Each company's VLANs and subnets, how full each subnet is, and where any IP lives (SDS Doc 24). */
export default async function IpPlanPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; company?: string; show?: string }>;
}) {
  const context = await requirePermission("infrastructure.view");
  const { user } = context;
  const params = await searchParams;
  const isGlobalAdmin = user.systemRoleKey === "SYSTEM_ADMINISTRATOR";
  const canManage = user.permissions.has("infrastructure.manage");
  const scope = { audit: context.audit, companyId: user.companyId, isGlobalAdmin };
  const q = params.q?.trim() ?? "";
  const show = params.show ?? "";

  const [plan, lookup, catalogs] = await Promise.all([
    loadPlan(scope, params.company),
    isIpv4(q) ? lookupIp(scope, q) : null,
    loadIpCatalogs(user),
  ]);

  const text = q.toLowerCase();
  const holding = new Set(lookup?.subnets.map((s) => s.id) ?? []);
  const vlans = plan.vlans.filter((vlan) => {
    if (show === "subnet" && vlan.subnets.length === 0) return false;
    if (show === "overlap" && !vlan.subnets.some((s) => s.overlapsWith.length > 0)) return false;
    if (show === "unused" && vlan.status !== "UNUSED") return false;
    if (!q) return true;
    if (lookup) return vlan.subnets.some((s) => holding.has(s.id));
    return (
      String(vlan.number) === q ||
      vlan.name.toLowerCase().includes(text) ||
      (vlan.purpose ?? "").toLowerCase().includes(text) ||
      vlan.subnets.some((s) => s.cidr.startsWith(q))
    );
  });
  const loose = plan.looseSubnets.filter(
    (s) => (!q ? true : lookup ? holding.has(s.id) : s.cidr.startsWith(q)) && (show !== "overlap" || s.overlapsWith.length > 0),
  );
  const showCompany = isGlobalAdmin && !params.company;
  const href = (next: { company?: string; show?: string }) => {
    const search = new URLSearchParams();
    if (q) search.set("q", q);
    const company = next.company ?? params.company;
    const nextShow = next.show ?? show;
    if (company) search.set("company", company);
    if (nextShow) search.set("show", nextShow);
    const s = search.toString();
    return `/infrastructure/ip${s ? `?${s}` : ""}`;
  };

  return (
    <div>
      <PageHeader
        title="IP & VLANs"
        description="Each company's VLANs and subnets, and which subnets overlap. Search an IP address to see which subnet and VLAN it belongs to."
        actions={
          canManage ? (
            <div className="flex flex-wrap items-center gap-2">
              <VlanDialog catalogs={catalogs} />
              <SubnetDialog catalogs={catalogs} />
            </div>
          ) : undefined
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-3">
        <StatCard label="VLANs" value={plan.counts.vlans} />
        <StatCard label="Subnets" value={plan.counts.subnets} />
        <StatCard label="Overlapping subnets" value={plan.counts.overlapping} tone={plan.counts.overlapping > 0 ? "warning" : "default"} hint="Share addresses with another" />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <LiveSearch placeholder="VLAN, name, subnet or an IP address" className="w-full sm:w-80" />
        {SHOW.map((option) => (
          <CompanyPill key={option.value} href={href({ show: option.value })} label={option.label} active={show === option.value} />
        ))}
      </div>
      {isGlobalAdmin && catalogs.companies.length > 1 ? (
        <div className="mb-4 flex flex-wrap gap-2">
          <CompanyPill href={href({ company: "" })} label="All companies" active={!params.company} />
          {catalogs.companies.map((company) => (
            <CompanyPill key={company.id} href={href({ company: company.id })} label={company.name} active={params.company === company.id} />
          ))}
        </div>
      ) : null}

      {lookup ? <IpLookup lookup={lookup} /> : null}

      {lookup && vlans.length === 0 && loose.length === 0 ? null : vlans.length === 0 && loose.length === 0 ? (
        <EmptyState
          title={plan.counts.vlans === 0 ? "No VLANs yet" : "Nothing matches"}
          description={
            plan.counts.vlans === 0
              ? canManage
                ? "Add them here, or import the discovery workbook's VLAN plan from the Import tab."
                : "Nothing has been recorded yet."
              : "Try another search or filter."
          }
        />
      ) : (
        <>
          {vlans.length > 0 ? (
            <SortableTable
              pageSize={50}
              resetKey={`${q}|${show}|${params.company ?? ""}`}
              noun="VLAN"
              initialSort={{ key: "vlan", dir: "asc" }}
              columns={[
                { key: "vlan", label: "VLAN" },
                { key: "name", label: "Name" },
                ...(showCompany ? [{ key: "company", label: "Company" }] : []),
                { key: "subnet", label: "Subnet" },
                { key: "gateway", label: "Gateway" },
                { key: "status", label: "Status" },
                ...(canManage ? [{ key: "actions", label: "Actions", sortable: false, align: "right" as const }] : []),
              ]}
              rows={vlans.map((vlan) => {
                const gateways = vlan.subnets.map((s) => s.gateway).filter(Boolean) as string[];
                return {
                  key: vlan.id,
                  cells: {
                    vlan: { sortValue: vlan.number, node: vlan.number, className: "font-mono text-sm font-semibold tabular-nums" },
                    name: {
                      sortValue: vlan.name,
                      node: (
                        <>
                          <span className="font-medium">{vlan.name}</span>
                          {vlan.purpose ? <p className="text-xs text-muted-foreground">{vlan.purpose}</p> : null}
                        </>
                      ),
                    },
                    company: { sortValue: vlan.companyName, node: vlan.companyName, className: "text-xs" },
                    subnet: {
                      sortValue: cidrSort(vlan.subnets[0]?.cidr),
                      node:
                        vlan.subnets.length === 0 ? (
                          <span className="text-xs text-muted-foreground">None</span>
                        ) : (
                          vlan.subnets.map((s) => (
                            <div key={s.id} className="flex items-center gap-1.5">
                              <Link href={`/infrastructure/ip/subnets/${s.id}`} className="font-mono text-xs font-medium hover:underline">{s.cidr}</Link>
                              {s.overlapsWith.length > 0 ? (
                                <span title={`Overlaps ${s.overlapsWith.join(", ")}`} className="text-warning">
                                  <TriangleAlert className="h-3.5 w-3.5" aria-label={`Overlaps ${s.overlapsWith.join(", ")}`} />
                                </span>
                              ) : null}
                            </div>
                          ))
                        ),
                    },
                    gateway: {
                      sortValue: gateways[0] ? ipToNumber(gateways[0]) : null,
                      node: gateways.join(", ") || "None",
                      className: "font-mono text-xs",
                    },
                    status: {
                      sortValue: IP_PLAN_STATUS_LABELS[vlan.status],
                      node: <Badge variant={STATUS_BADGE[vlan.status]}>{IP_PLAN_STATUS_LABELS[vlan.status]}</Badge>,
                    },
                    actions: {
                      node: canManage ? (
                        <div className="flex justify-end">
                          <VlanDialog
                            catalogs={catalogs}
                            vlan={{ id: vlan.id, companyId: vlan.companyId, number: vlan.number, name: vlan.name, purpose: vlan.purpose, status: vlan.status, notes: vlan.notes }}
                          />
                          <DeleteButton
                            action={deleteVlanAction}
                            id={vlan.id}
                            entityLabel={`VLAN ${vlan.number}`}
                            message={`Delete VLAN ${vlan.number} ${vlan.name}? Its subnets stay, without a VLAN.`}
                            successMessage="VLAN deleted."
                          />
                        </div>
                      ) : null,
                    },
                  },
                };
              })}
            />
          ) : null}

          {loose.length > 0 ? (
            <div className="mt-6">
              <h2 className="mb-2 text-sm font-semibold">Subnets without a VLAN</h2>
              <SortableTable
                pageSize={50}
                resetKey={`${q}|${show}|${params.company ?? ""}`}
                noun="subnet"
                initialSort={{ key: "subnet", dir: "asc" }}
                columns={[
                  { key: "subnet", label: "Subnet" },
                  ...(showCompany ? [{ key: "company", label: "Company" }] : []),
                  { key: "gateway", label: "Gateway" },
                  { key: "purpose", label: "Purpose" },
                ]}
                rows={loose.map((s) => ({
                  key: s.id,
                  cells: {
                    subnet: {
                      sortValue: cidrSort(s.cidr),
                      node: (
                        <>
                          <Link href={`/infrastructure/ip/subnets/${s.id}`} className="font-mono text-xs font-medium hover:underline">{s.cidr}</Link>
                          {s.overlapsWith.length > 0 ? <p className="text-xs text-warning">Overlaps {s.overlapsWith.join(", ")}</p> : null}
                        </>
                      ),
                    },
                    company: { sortValue: s.companyName, node: s.companyName, className: "text-xs" },
                    gateway: { sortValue: s.gateway ? ipToNumber(s.gateway) : null, node: s.gateway ?? "None", className: "font-mono text-xs" },
                    purpose: { sortValue: s.purpose, node: s.purpose ?? "", className: "text-xs" },
                  },
                }))}
              />
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

function IpLookup({ lookup }: { lookup: NonNullable<Awaited<ReturnType<typeof lookupIp>>> }) {
  const nothing = lookup.subnets.length === 0 && lookup.records.length === 0 && lookup.devices.length === 0;
  return (
    <div className="mb-5 rounded-2xl border bg-card px-5 py-4 text-sm">
      <p className="mb-2 font-mono text-base font-semibold">{lookup.address}</p>
      {nothing ? (
        <p className="text-muted-foreground">Not inside any recorded subnet, and not recorded anywhere.</p>
      ) : (
        <ul className="space-y-1.5">
          {lookup.subnets.map((s) => (
            <li key={s.id}>
              In <Link href={`/infrastructure/ip/subnets/${s.id}`} className="font-mono font-medium hover:underline">{s.network}/{s.prefix}</Link>
              {s.vlan ? <> · VLAN {s.vlan.number} {s.vlan.name}</> : null}
              <span className="text-muted-foreground"> · {s.company.name}</span>
            </li>
          ))}
          {lookup.records.map((r) => (
            <li key={r.id}>
              {r.status === "RESERVED" ? "Reserved" : "Used"}
              {r.hostname ? <> by <span className="font-medium">{r.hostname}</span></> : null}
              {r.macAddress ? <span className="font-mono text-xs text-muted-foreground"> · {r.macAddress}{r.macVendor ? ` (${r.macVendor})` : ""}</span> : null}
              {r.switchName ? <span className="text-muted-foreground"> · seen on {r.switchName}{r.switchPort ? ` ${r.switchPort}` : ""}</span> : null}
            </li>
          ))}
          {lookup.devices.map((d) => (
            <li key={d.id}>
              Device <Link href={`/infrastructure/devices/${d.id}`} className="font-medium hover:underline">{d.name}</Link>
            </li>
          ))}
          {lookup.subnets.length === 0 ? <li className="text-warning">Not inside any recorded subnet.</li> : null}
          {lookup.records.length === 0 && lookup.devices.length === 0 ? <li className="text-muted-foreground">Free: nothing recorded on it.</li> : null}
        </ul>
      )}
    </div>
  );
}
