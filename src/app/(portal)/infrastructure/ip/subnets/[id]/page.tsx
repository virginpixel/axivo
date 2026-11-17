import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/shared/auth/guard";
import { PageHeader } from "@/shared/ui/page";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/shared/ui/table";
import { Badge } from "@/shared/ui/badge";
import { DeleteButton } from "@/shared/ui/delete-button";
import { NotFoundError } from "@/shared/errors";
import { cn, formatDate } from "@/shared/utils";
import { loadSubnet } from "@/modules/infrastructure/ipam";
import { cidrFromParts, ipToNumber, numberToIp } from "@/modules/infrastructure/ip-math";
import { deleteIpAddressAction, deleteSubnetAction } from "@/modules/infrastructure/actions";
import { IP_PLAN_STATUS_LABELS } from "@/modules/infrastructure/validators";
import { loadIpCatalogs } from "../../catalogs";
import { AddressDialog, SubnetDialog } from "../../ip-dialogs";
import { SubnetUsage } from "../../usage";

export const dynamic = "force-dynamic";
export const metadata = { title: "Subnet" };

/** Subnets up to this size get a map of every address. */
const MAP_LIMIT = 1024;

/** One subnet: its range, every address taken in it, and the next free one (SDS Doc 24). */
export default async function SubnetPage({ params }: { params: Promise<{ id: string }> }) {
  const context = await requirePermission("infrastructure.view");
  const { user } = context;
  const { id } = await params;
  const canManage = user.permissions.has("infrastructure.manage");
  const scope = { audit: context.audit, companyId: user.companyId, isGlobalAdmin: user.systemRoleKey === "SYSTEM_ADMINISTRATOR" };

  let data: Awaited<ReturnType<typeof loadSubnet>>;
  try {
    data = await loadSubnet(scope, id);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }
  const { subnet, facts, addresses, devices, overlapping, nextFree } = data;
  const catalogs = canManage ? await loadIpCatalogs(user) : null;
  const cidr = cidrFromParts(subnet.network, subnet.prefix);
  const recorded = new Set(addresses.map((a) => a.address));
  const registerOnly = devices.filter((d) => !recorded.has(d.ipAddress!));
  const usedCount = new Set([...addresses.map((a) => a.addressNum), ...devices.map((d) => ipToNumber(d.ipAddress!)!)]).size;

  return (
    <div>
      <PageHeader
        title={facts.cidr}
        backHref="/infrastructure/ip"
        backLabel="IP & VLANs"
        description={[
          subnet.vlan ? `VLAN ${subnet.vlan.number} ${subnet.vlan.name}` : "No VLAN",
          subnet.company.name,
          subnet.location?.name,
        ].filter(Boolean).join(" · ")}
        actions={
          canManage && catalogs ? (
            <div className="flex flex-wrap items-center gap-2">
              <SubnetDialog
                catalogs={catalogs}
                subnet={{
                  id: subnet.id, companyId: subnet.companyId, cidr: facts.cidr, vlanId: subnet.vlanId, gateway: subnet.gateway,
                  dhcpRelay: subnet.dhcpRelay, locationId: subnet.locationId, purpose: subnet.purpose, status: subnet.status, notes: subnet.notes,
                }}
              />
              <DeleteButton
                action={deleteSubnetAction}
                id={subnet.id}
                entityLabel={facts.cidr}
                message={`Delete subnet ${facts.cidr}? The addresses recorded in it stay on record.`}
                successMessage="Subnet deleted."
                redirectTo="/infrastructure/ip"
                variant="button"
              />
            </div>
          ) : undefined
        }
      />

      {overlapping.length > 0 ? (
        <p className="mb-5 rounded-xl border border-warning/40 bg-warning/10 px-4 py-2.5 text-sm">
          Overlaps{" "}
          {overlapping.map((o, index) => (
            <span key={o.id}>
              {index > 0 ? ", " : ""}
              <Link href={`/infrastructure/ip/subnets/${o.id}`} className="font-mono font-medium underline">{o.network}/{o.prefix}</Link>
              {o.vlan ? ` (VLAN ${o.vlan.number} ${o.vlan.name})` : ""}
            </span>
          ))}
          . The same address is in both, so one of them is probably wrong.
        </p>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-3">
        <Card>
          <CardHeader><CardTitle>Range</CardTitle></CardHeader>
          <CardContent>
            <dl className="space-y-2 text-sm">
              <Row label="Mask" value={<span className="font-mono">{facts.mask}</span>} />
              <Row label="Usable" value={`${facts.firstUsable} to ${facts.lastUsable}`} mono />
              <Row label="Broadcast" value={facts.broadcast ?? "None (point to point)"} mono />
              <Row label="Gateway" value={subnet.gateway ?? "None"} mono />
              <Row label="DHCP relay" value={subnet.dhcpRelay ?? "None"} mono />
              <Row label="Status" value={IP_PLAN_STATUS_LABELS[subnet.status]} />
              {subnet.purpose ? <Row label="Purpose" value={subnet.purpose} /> : null}
            </dl>
            <div className="mt-4 border-t pt-3">
              <SubnetUsage used={usedCount} usable={facts.usable} />
            </div>
            <div className="mt-4 rounded-xl border bg-muted/40 px-3 py-2.5 text-sm">
              <p className="text-xs text-muted-foreground">Next free address</p>
              <div className="mt-1 flex items-center justify-between gap-2">
                <span className="font-mono text-base font-semibold">{nextFree ?? "Full"}</span>
                {canManage && catalogs && nextFree ? (
                  <AddressDialog catalogs={catalogs} companyId={subnet.companyId} suggested={nextFree} trigger="free" />
                ) : null}
              </div>
            </div>
            {subnet.notes ? <p className="mt-4 whitespace-pre-wrap border-t pt-3 text-sm">{subnet.notes}</p> : null}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Address map</CardTitle></CardHeader>
          <CardContent>
            {facts.size <= MAP_LIMIT ? (
              <AddressMap
                start={cidr.start}
                size={facts.size}
                prefix={subnet.prefix}
                gateway={subnet.gateway ? ipToNumber(subnet.gateway) : null}
                used={new Map([
                  ...devices.map((d) => [ipToNumber(d.ipAddress!)!, { label: d.name, reserved: false }] as const),
                  ...addresses.map((a) => [a.addressNum, { label: a.hostname ?? a.device?.name ?? a.description ?? "", reserved: a.status === "RESERVED" }] as const),
                ])}
              />
            ) : (
              <p className="text-sm text-muted-foreground">
                {facts.size.toLocaleString()} addresses is too many to draw. The list below shows every one recorded.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="mt-5">
        <CardHeader className="flex-row items-center justify-between gap-3">
          <CardTitle>Addresses ({(addresses.length + registerOnly.length).toLocaleString()})</CardTitle>
          {canManage && catalogs ? <AddressDialog catalogs={catalogs} companyId={subnet.companyId} suggested={nextFree} /> : null}
        </CardHeader>
        <CardContent>
          {addresses.length + registerOnly.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing recorded in this subnet yet.</p>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Address</TH><TH>Name</TH><TH>MAC</TH><TH>Device</TH><TH>Seen on</TH><TH>Status</TH>
                  {canManage ? <TH className="text-right">Actions</TH> : null}
                </TR>
              </THead>
              <TBody>
                {[
                  ...addresses.map((a) => ({ kind: "record" as const, num: a.addressNum, a })),
                  ...registerOnly.map((d) => ({ kind: "device" as const, num: ipToNumber(d.ipAddress!)!, d })),
                ]
                  .sort((x, y) => x.num - y.num)
                  .map((row) =>
                    row.kind === "device" ? (
                      <TR key={`d-${row.d.id}`}>
                        <TD className="font-mono text-xs">{row.d.ipAddress}</TD>
                        <TD className="text-xs text-muted-foreground">From the register</TD>
                        <TD />
                        <TD><Link href={`/infrastructure/devices/${row.d.id}`} className="text-sm font-medium hover:underline">{row.d.name}</Link></TD>
                        <TD />
                        <TD><Badge variant="success">Used</Badge></TD>
                        {canManage ? <TD /> : null}
                      </TR>
                    ) : (
                      <TR key={row.a.id}>
                        <TD className="font-mono text-xs">{row.a.address}{row.a.address === subnet.gateway ? <span className="ml-1.5 text-muted-foreground">gateway</span> : null}</TD>
                        <TD>
                          <span className="text-sm">{row.a.hostname ?? ""}</span>
                          {row.a.description ? <p className="text-xs text-muted-foreground">{row.a.description}</p> : null}
                        </TD>
                        <TD>
                          <span className="font-mono text-xs">{row.a.macAddress ?? ""}</span>
                          {row.a.macVendor ? <p className="text-xs text-muted-foreground">{row.a.macVendor}</p> : null}
                        </TD>
                        <TD>
                          {row.a.device && !row.a.device.deletedAt ? (
                            <Link href={`/infrastructure/devices/${row.a.device.id}`} className="text-sm font-medium hover:underline">{row.a.device.name}</Link>
                          ) : null}
                        </TD>
                        <TD className="text-xs">
                          {row.a.switchName ? `${row.a.switchName}${row.a.switchPort ? ` ${row.a.switchPort}` : ""}` : ""}
                          {row.a.lastSeenAt ? <p className="text-muted-foreground">{formatDate(row.a.lastSeenAt)}</p> : null}
                        </TD>
                        <TD><Badge variant={row.a.status === "RESERVED" ? "info" : "success"}>{row.a.status === "RESERVED" ? "Reserved" : "Used"}</Badge></TD>
                        {canManage && catalogs ? (
                          <TD className="text-right">
                            <div className="flex justify-end">
                              <AddressDialog
                                catalogs={catalogs}
                                companyId={subnet.companyId}
                                trigger="icon"
                                record={{
                                  id: row.a.id, address: row.a.address, status: row.a.status, hostname: row.a.hostname,
                                  macAddress: row.a.macAddress, deviceId: row.a.deviceId, description: row.a.description,
                                }}
                              />
                              <DeleteButton
                                action={deleteIpAddressAction}
                                id={row.a.id}
                                entityLabel={row.a.address}
                                message={`Release ${row.a.address}? It shows as free again.`}
                                successMessage="Address released."
                              />
                            </div>
                          </TD>
                        ) : null}
                      </TR>
                    ),
                  )}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-4 border-b pb-2 last:border-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={cn("text-right font-medium", mono && "font-mono text-xs")}>{value}</dd>
    </div>
  );
}

/** One square per address: used, reserved, gateway, network/broadcast or free. */
function AddressMap({
  start, size, prefix, gateway, used,
}: {
  start: number;
  size: number;
  prefix: number;
  gateway: number | null;
  used: Map<number, { label: string; reserved: boolean }>;
}) {
  const perRow = size >= 256 ? 32 : Math.min(size, 16);
  const rows = Math.ceil(size / perRow);
  return (
    <div>
      <div className="space-y-[3px]">
        {Array.from({ length: rows }, (_, r) => (
          <div key={r} className="flex items-center gap-2">
            <span className="w-20 shrink-0 font-mono text-[10px] text-muted-foreground tabular-nums sm:w-24">{numberToIp(start + r * perRow)}</span>
            {/* Squares shrink to fit the card, up to 18px each. */}
            <div className="grid min-w-0 flex-1 gap-[3px]" style={{ gridTemplateColumns: `repeat(${perRow}, minmax(0, 18px))` }}>
              {Array.from({ length: Math.min(perRow, size - r * perRow) }, (_, c) => {
                const address = start + r * perRow + c;
                const edge = prefix < 31 && (address === start || address === start + size - 1);
                const entry = used.get(address);
                const isGateway = address === gateway;
                const state = edge ? "edge" : isGateway ? "gateway" : entry ? (entry.reserved ? "reserved" : "used") : "free";
                const title = `${numberToIp(address)}${
                  edge ? (address === start ? " · network" : " · broadcast") : isGateway ? " · gateway" : entry ? ` · ${entry.reserved ? "reserved" : "used"}${entry.label ? `: ${entry.label}` : ""}` : " · free"
                }`;
                return (
                  <span
                    key={c}
                    title={title}
                    className={cn(
                      "aspect-square w-full rounded-[3px]",
                      state === "edge" && "bg-muted-foreground/25",
                      state === "gateway" && "bg-warning",
                      state === "used" && "bg-primary",
                      state === "reserved" && "border-2 border-info bg-info/20",
                      state === "free" && "border border-border bg-muted/40",
                    )}
                  />
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-4 text-xs text-muted-foreground">
        <Legend className="bg-primary" label="Used" />
        <Legend className="border-2 border-info bg-info/20" label="Reserved" />
        <Legend className="bg-warning" label="Gateway" />
        <Legend className="border border-border bg-muted/40" label="Free" />
        <Legend className="bg-muted-foreground/25" label="Network / broadcast" />
      </div>
    </div>
  );
}

function Legend({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn("h-3 w-3 rounded-[3px]", className)} /> {label}
    </span>
  );
}
