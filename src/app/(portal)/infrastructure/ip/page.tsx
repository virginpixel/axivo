import Link from "next/link";
import { TriangleAlert } from "lucide-react";
import { requirePermission } from "@/shared/auth/guard";
import { PageHeader, StatCard } from "@/shared/ui/page";
import { Table, THead, TBody, TR, TH, TD, EmptyState } from "@/shared/ui/table";
import { Badge } from "@/shared/ui/badge";
import { CompanyPill } from "@/shared/ui/filter-pill";
import { LiveSearch } from "@/shared/ui/live-search";
import { DeleteButton } from "@/shared/ui/delete-button";
import { loadPlan, lookupIp } from "@/modules/infrastructure/ipam";
import { isIpv4 } from "@/modules/infrastructure/ip-math";
import { deleteVlanAction } from "@/modules/infrastructure/actions";
import { IP_PLAN_STATUS_LABELS } from "@/modules/infrastructure/validators";
import { loadIpCatalogs } from "./catalogs";
import { SubnetDialog, VlanDialog } from "./ip-dialogs";
import { SubnetUsage } from "./usage";

export const dynamic = "force-dynamic";
export const metadata = { title: "IP & VLANs" };

const SHOW = [
  { value: "", label: "All VLANs" },
  { value: "subnet", label: "With a subnet" },
  { value: "overlap", label: "Overlapping" },
  { value: "unused", label: "Not in use" },
] as const;

const STATUS_BADGE = { ACTIVE: "success", RESERVED: "info", UNUSED: "default" } as const;

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
        description="Each company's VLANs and subnets, how full each subnet is, and which addresses are taken. Search an IP address to see where it lives."
        actions={
          canManage ? (
            <div className="flex flex-wrap items-center gap-2">
              <VlanDialog catalogs={catalogs} />
              <SubnetDialog catalogs={catalogs} />
            </div>
          ) : undefined
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="VLANs" value={plan.counts.vlans} />
        <StatCard label="Subnets" value={plan.counts.subnets} />
        <StatCard label="Addresses recorded" value={plan.counts.addresses.toLocaleString()} hint="Used or reserved" />
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
            <Table>
              <THead>
                <TR>
                  <TH>VLAN</TH>
                  <TH>Name</TH>
                  {showCompany ? <TH>Company</TH> : null}
                  <TH>Subnet</TH>
                  <TH>Gateway</TH>
                  <TH>Usage</TH>
                  <TH>Status</TH>
                  {canManage ? <TH className="text-right">Actions</TH> : null}
                </TR>
              </THead>
              <TBody>
                {vlans.map((vlan) => (
                  <TR key={vlan.id}>
                    <TD className="font-mono text-sm font-semibold tabular-nums">{vlan.number}</TD>
                    <TD>
                      <span className="font-medium">{vlan.name}</span>
                      {vlan.purpose ? <p className="text-xs text-muted-foreground">{vlan.purpose}</p> : null}
                    </TD>
                    {showCompany ? <TD className="text-xs">{vlan.companyName}</TD> : null}
                    <TD>
                      {vlan.subnets.length === 0 ? (
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
                      )}
                    </TD>
                    <TD className="font-mono text-xs">{vlan.subnets.map((s) => s.gateway).filter(Boolean).join(", ") || "None"}</TD>
                    <TD>
                      {vlan.subnets.map((s) => <SubnetUsage key={s.id} used={s.used} usable={s.usable} className="mb-1 last:mb-0" />)}
                    </TD>
                    <TD><Badge variant={STATUS_BADGE[vlan.status]}>{IP_PLAN_STATUS_LABELS[vlan.status]}</Badge></TD>
                    {canManage ? (
                      <TD className="text-right">
                        <div className="flex justify-end">
                          <SubnetDialog catalogs={catalogs} defaults={{ companyId: vlan.companyId, vlanId: vlan.id }} />
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
                      </TD>
                    ) : null}
                  </TR>
                ))}
              </TBody>
            </Table>
          ) : null}

          {loose.length > 0 ? (
            <div className="mt-6">
              <h2 className="mb-2 text-sm font-semibold">Subnets without a VLAN</h2>
              <Table>
                <THead>
                  <TR>
                    <TH>Subnet</TH>
                    {showCompany ? <TH>Company</TH> : null}
                    <TH>Gateway</TH>
                    <TH>Usage</TH>
                    <TH>Purpose</TH>
                  </TR>
                </THead>
                <TBody>
                  {loose.map((s) => (
                    <TR key={s.id}>
                      <TD>
                        <Link href={`/infrastructure/ip/subnets/${s.id}`} className="font-mono text-xs font-medium hover:underline">{s.cidr}</Link>
                        {s.overlapsWith.length > 0 ? <p className="text-xs text-warning">Overlaps {s.overlapsWith.join(", ")}</p> : null}
                      </TD>
                      {showCompany ? <TD className="text-xs">{s.companyName}</TD> : null}
                      <TD className="font-mono text-xs">{s.gateway ?? "None"}</TD>
                      <TD><SubnetUsage used={s.used} usable={s.usable} /></TD>
                      <TD className="text-xs">{s.purpose ?? ""}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
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
