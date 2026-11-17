import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/shared/auth/guard";
import { PageHeader } from "@/shared/ui/page";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/shared/ui/table";
import { Badge } from "@/shared/ui/badge";
import { DeleteButton } from "@/shared/ui/delete-button";
import { NotFoundError } from "@/shared/errors";
import { cn, formatDate, formatDateTime } from "@/shared/utils";
import { db } from "@/shared/db";
import { loadSubnet, routingSwitch } from "@/modules/infrastructure/ipam";
import { cidrFromParts, ipToNumber } from "@/modules/infrastructure/ip-math";
import { deleteIpAddressAction, deleteSubnetAction } from "@/modules/infrastructure/actions";
import { IP_PLAN_STATUS_LABELS } from "@/modules/infrastructure/validators";
import { loadIpCatalogs } from "../../catalogs";
import { AddressDialog, SubnetDialog } from "../../ip-dialogs";
import { AddressMap, type MapEntry } from "./address-map";
import { ArpControls } from "./arp-controls";

export const dynamic = "force-dynamic";
export const metadata = { title: "Subnet" };

/** Subnets up to this size get a map of every address. */
const MAP_LIMIT = 1024;
/** Found by discovery or an ARP read but not seen for this long: shown faded. */
const STALE_DAYS = 30;

/** One subnet: its range, its ARP reading and every address recorded in it (SDS Doc 24). */
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
  const { subnet, facts, addresses, devices, overlapping } = data;
  const [catalogs, found, switches] = await Promise.all([
    canManage ? loadIpCatalogs(user) : null,
    routingSwitch({ ...subnet, arpDeviceId: null }),
    db.infraDevice.findMany({
      where: { companyId: subnet.companyId, kind: "NETWORK", deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);
  const cidr = cidrFromParts(subnet.network, subnet.prefix);
  const recorded = new Set(addresses.map((a) => a.address));
  const registerOnly = devices.filter((d) => !recorded.has(d.ipAddress!));
  const cutoff = Date.now() - STALE_DAYS * 86_400_000;
  // Only what discovery or an ARP read found goes faded; what people
  // recorded or reserved stays as it is.
  const stale = (a: (typeof addresses)[number]) => a.source === "DISCOVERY" && !!a.lastSeenAt && a.lastSeenAt.getTime() < cutoff;
  const entries: MapEntry[] = [
    ...devices.map((d) => ({ n: ipToNumber(d.ipAddress!)!, name: d.name, mac: null, reserved: false, stale: false, seen: null })),
    ...addresses.map((a) => ({
      n: a.addressNum,
      name: a.hostname ?? a.device?.name ?? a.description ?? null,
      mac: a.macAddress,
      reserved: a.status === "RESERVED",
      stale: stale(a),
      seen: a.lastSeenAt ? `Last seen ${formatDate(a.lastSeenAt)}` : null,
    })),
  ];

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
        <div className="space-y-5">
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
            {subnet.notes ? <p className="mt-4 whitespace-pre-wrap border-t pt-3 text-sm">{subnet.notes}</p> : null}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>ARP table</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <ArpControls
              subnetId={subnet.id}
              enabled={subnet.arpScan}
              chosenDeviceId={subnet.arpDeviceId}
              found={found ? { id: found.id, name: found.name } : null}
              switches={switches}
              canManage={canManage}
            />
            {subnet.arpCheckedAt ? (
              <p className="border-t pt-3 text-xs">
                <span className={cn("font-medium", subnet.arpStatus === "OK" ? "text-success" : subnet.arpStatus === "FAILED" ? "text-destructive" : "text-warning")}>
                  {subnet.arpStatus === "OK" ? "Read" : subnet.arpStatus === "FAILED" ? "Failed" : "Not read"}
                </span>
                <span className="text-muted-foreground"> · {formatDateTime(subnet.arpCheckedAt)}</span>
                {subnet.arpMessage ? <span className="block text-muted-foreground">{subnet.arpMessage}</span> : null}
              </p>
            ) : null}
            <p className="text-xs text-muted-foreground">
              The switch only knows devices that talk through the gateway. Devices that talk only inside this subnet, such as
              cameras to their recorder, do not show up. Nothing found is ever removed; addresses not seen for {STALE_DAYS} days are shown faded.
            </p>
          </CardContent>
        </Card>
        </div>

        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Address map</CardTitle></CardHeader>
          <CardContent>
            {facts.size <= MAP_LIMIT ? (
              <AddressMap
                start={cidr.start}
                size={facts.size}
                prefix={subnet.prefix}
                gateway={subnet.gateway ? ipToNumber(subnet.gateway) : null}
                entries={entries}
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
          {canManage && catalogs ? <AddressDialog catalogs={catalogs} companyId={subnet.companyId} /> : null}
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
                      <TR key={row.a.id} className={stale(row.a) ? "opacity-55" : undefined}>
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
                          {row.a.lastSeenAt ? (
                            <p className="text-muted-foreground">
                              {stale(row.a) ? `Not seen since ${formatDate(row.a.lastSeenAt)}` : `Last seen ${formatDate(row.a.lastSeenAt)}`}
                            </p>
                          ) : null}
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
