import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/shared/auth/guard";
import { db } from "@/shared/db";
import { PageHeader } from "@/shared/ui/page";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { StatusBadge } from "@/shared/ui/badge";
import { Table, THead, TBody, TR, TH, TD } from "@/shared/ui/table";
import { DeleteButton } from "@/shared/ui/delete-button";
import { formatDate, formatDateTime } from "@/shared/utils";
import { deleteDeviceAction } from "@/modules/infrastructure/actions";
import { KIND_PATHS } from "@/modules/infrastructure/validators";
import { loadDeviceCatalogs, locationPath } from "../../catalogs";
import { DeviceDialog, DeviceStatusControl } from "../../device-dialogs";
import { LinkCredentialDialog, RevealPassword, UnlinkCredentialButton, NoPasswordNote } from "../../credential-dialogs";
import { LinkDialog, RemoveLinkButton } from "../../link-dialogs";
import { BackupNowButton, BackupIncludedToggle } from "../../backup-controls";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const device = await db.infraDevice.findFirst({ where: { id, deletedAt: null }, select: { name: true } });
  return { title: device?.name ?? "Device" };
}

/** One network device or server: details, logins, what runs on it (SDS Doc 24). */
export default async function DeviceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { user } = await requirePermission("infrastructure.view");
  const { id } = await params;
  const isGlobalAdmin = user.systemRoleKey === "SYSTEM_ADMINISTRATOR";
  const canManage = user.permissions.has("infrastructure.manage");
  const canManageLogins = user.permissions.has("infrastructure.credentials.manage");
  const canReveal = user.permissions.has("infrastructure.credentials.reveal");
  const canViewConfigs = user.permissions.has("infrastructure.configs.view");

  const device = await db.infraDevice.findFirst({
    where: { id, deletedAt: null, ...(isGlobalAdmin ? {} : { companyId: user.companyId }) },
    include: {
      company: { select: { name: true } },
      type: { select: { name: true } },
      manufacturer: { select: { name: true } },
      host: { select: { id: true, name: true, deletedAt: true } },
      asset: { select: { id: true, name: true, assetTag: true, status: true, deletedAt: true } },
      configs: {
        orderBy: { takenAt: "desc" },
        take: 20,
        select: { id: true, takenAt: true, lineCount: true, linesAdded: true, linesRemoved: true, firmware: true },
      },
      _count: { select: { configs: true } },
      guests: { where: { deletedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true, ipAddress: true, status: true, operatingSystem: true } },
      applications: { include: { application: { select: { id: true, name: true } } } },
      credentials: {
        orderBy: { createdAt: "asc" },
        include: {
          // Never the ciphertext: when the password was set says whether there is one.
          credentialSet: { select: { id: true, name: true, username: true, companyId: true, passwordChangedAt: true, deletedAt: true } },
        },
      },
    },
  });
  if (!device) notFound();

  const [catalogs, locations, sameIp, linkableSets, activity, cables, linkTargets] = await Promise.all([
    canManage ? loadDeviceCatalogs(user) : null,
    db.location.findMany({ where: { companyId: device.companyId, deletedAt: null }, select: { id: true, name: true, parentId: true } }),
    device.ipAddress
      ? db.infraDevice.findMany({
          where: { ipAddress: device.ipAddress, deletedAt: null, id: { not: device.id }, ...(isGlobalAdmin ? {} : { companyId: user.companyId }) },
          select: { id: true, name: true, status: true },
        })
      : [],
    canManageLogins
      ? db.credentialSet.findMany({
          where: { deletedAt: null, OR: [{ companyId: device.companyId }, { companyId: null }] },
          orderBy: { name: "asc" },
          select: { id: true, name: true, username: true, companyId: true },
        })
      : [],
    db.auditEvent.findMany({
      where: { targetType: "infra_device", targetId: device.id },
      orderBy: { occurredAt: "desc" },
      take: 10,
      select: { id: true, action: true, actorLabel: true, occurredAt: true },
    }),
    db.infraLink.findMany({
      where: { OR: [{ deviceAId: device.id }, { deviceBId: device.id }], deviceA: { deletedAt: null }, deviceB: { deletedAt: null } },
      include: {
        deviceA: { select: { id: true, name: true, companyId: true } },
        deviceB: { select: { id: true, name: true, companyId: true } },
      },
    }),
    canManage
      ? db.infraDevice.findMany({
          where: { deletedAt: null, ...(isGlobalAdmin ? {} : { companyId: user.companyId }) },
          orderBy: { name: "asc" },
          select: { id: true, name: true, ipAddress: true, type: { select: { name: true } } },
        })
      : [],
  ]);
  // Each cable from this device's side: its port first, then the far end.
  const connections = cables
    .map((link) => {
      const mine = link.deviceAId === device.id;
      return {
        link,
        port: mine ? link.portA : link.portB,
        other: mine ? link.deviceB : link.deviceA,
        otherPort: mine ? link.portB : link.portA,
        loop: link.deviceAId === link.deviceBId,
      };
    })
    .sort((x, y) => (x.port ?? "").localeCompare(y.port ?? "", undefined, { numeric: true }));
  const linkOptions = linkTargets.map((d) => ({ id: d.id, name: d.name, hint: [d.type.name, d.ipAddress].filter(Boolean).join(" · ") }));

  const isServer = device.kind === "SERVER";
  const asset = device.asset && !device.asset.deletedAt ? device.asset : null;
  const linkedIds = new Set(device.credentials.map((link) => link.credentialSetId));
  const logins = device.credentials.filter((link) => !link.credentialSet.deletedAt);

  return (
    <div>
      <PageHeader
        title={device.name}
        backHref={KIND_PATHS[device.kind]}
        backLabel={isServer ? "Servers & hosts" : "Network devices"}
        description={[device.type.name, device.ipAddress, device.company.name].filter(Boolean).join(" · ")}
        actions={
          canManage && catalogs ? (
            <div className="flex flex-wrap items-center gap-2">
              <DeviceStatusControl id={device.id} status={device.status} />
              <DeviceDialog
                kind={device.kind}
                catalogs={catalogs}
                trigger="button"
                device={{
                  id: device.id,
                  companyId: device.companyId,
                  typeId: device.typeId,
                  name: device.name,
                  hostname: device.hostname,
                  ipAddress: device.ipAddress,
                  locationId: device.locationId,
                  manufacturerId: device.manufacturerId,
                  model: device.model,
                  serialNumber: device.serialNumber,
                  operatingSystem: device.operatingSystem,
                  version: device.version,
                  domain: device.domain,
                  purpose: device.purpose,
                  status: device.status,
                  hostDeviceId: device.hostDeviceId,
                  notes: device.notes,
                  applicationIds: device.applications.map((link) => link.applicationId),
                  assetLabel: asset ? (asset.assetTag ? `${asset.name} (${asset.assetTag})` : asset.name) : null,
                }}
              />
              <DeleteButton
                action={deleteDeviceAction}
                id={device.id}
                entityLabel={device.name}
                message={`Delete "${device.name}"? Its login links go with it; the credential sets stay in the vault. To keep the record, set it to Decommissioned instead.`}
                successMessage="Deleted."
                redirectTo={KIND_PATHS[device.kind]}
                variant="button"
              />
            </div>
          ) : (
            <StatusBadge status={device.status} />
          )
        }
      />

      <div className="grid gap-5 lg:grid-cols-3">
        <Card>
          <CardHeader><CardTitle>Details</CardTitle></CardHeader>
          <CardContent>
            <dl className="space-y-2 text-sm">
              <Row label="Status" value={<StatusBadge status={device.status} />} />
              <Row label="Type" value={device.type.name} />
              <Row label="Company" value={device.company.name} />
              {device.hostname ? <Row label="Hostname" value={device.hostname} /> : null}
              <Row label="IP address" value={device.ipAddress ? <span className="font-mono">{device.ipAddress}</span> : "None"} />
              <Row label="Location" value={device.locationId ? locationPath(device.locationId, locations) : "None"} />
              <Row label="Manufacturer" value={device.manufacturer?.name ?? "None"} />
              <Row label="Model" value={device.model ?? "None"} />
              <Row label="Serial number" value={device.serialNumber ?? "None"} />
              <Row label="Operating system" value={device.operatingSystem ?? "None"} />
              <Row label={isServer ? "Version" : "Firmware"} value={device.version ?? "None"} />
              {isServer ? <Row label="Domain" value={device.domain ?? "None"} /> : null}
              {isServer ? (
                <Row
                  label="Runs on"
                  value={
                    device.host && !device.host.deletedAt ? (
                      <Link href={`/infrastructure/devices/${device.host.id}`} className="hover:underline">{device.host.name}</Link>
                    ) : "Not set"
                  }
                />
              ) : null}
              {device.purpose ? <Row label="Purpose" value={device.purpose} /> : null}
              <Row
                label="Asset"
                value={
                  asset ? (
                    <Link href={`/assets/${asset.id}`} className="hover:underline">{asset.assetTag ?? asset.name}</Link>
                  ) : "Not linked"
                }
              />
            </dl>
            {sameIp.length > 0 ? (
              <p className="mt-4 rounded-xl border border-warning/40 bg-warning/10 px-3 py-2 text-xs leading-relaxed">
                {device.ipAddress} is also recorded on{" "}
                {sameIp.map((other, index) => (
                  <span key={other.id}>
                    {index > 0 ? ", " : ""}
                    <Link href={`/infrastructure/devices/${other.id}`} className="font-medium underline">{other.name}</Link>
                    {other.status !== "ACTIVE" ? ` (${other.status.toLowerCase()})` : ""}
                  </span>
                ))}
                . Fine for a standby clone; otherwise one of them is wrong.
              </p>
            ) : null}
            {device.notes ? (
              <div className="mt-4 border-t pt-3 text-sm">
                <p className="mb-1 label-caps text-muted-foreground">Notes</p>
                <p className="whitespace-pre-wrap">{device.notes}</p>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <div className="space-y-5 lg:col-span-2">
          <Card>
            <CardHeader className="flex-row items-center justify-between gap-3">
              <CardTitle>Logins</CardTitle>
              {canManageLogins ? (
                <LinkCredentialDialog
                  deviceId={device.id}
                  sets={linkableSets
                    .filter((set) => !linkedIds.has(set.id))
                    .map((set) => ({ id: set.id, name: set.name, username: set.username, shared: set.companyId === null }))}
                />
              ) : null}
            </CardHeader>
            <CardContent>
              {logins.length === 0 ? (
                <p className="text-sm text-muted-foreground">No logins linked to this device.</p>
              ) : (
                <Table>
                  <THead>
                    <TR><TH>Credential set</TH><TH>Username</TH><TH>Used for</TH><TH>Password</TH>{canManageLogins ? <TH className="text-right">Unlink</TH> : null}</TR>
                  </THead>
                  <TBody>
                    {logins.map((link) => (
                      <TR key={link.id}>
                        <TD>
                          <Link href={`/infrastructure/credentials/${link.credentialSet.id}`} className="font-medium hover:underline">
                            {link.credentialSet.name}
                          </Link>
                          {link.credentialSet.companyId === null ? <p className="text-xs text-muted-foreground">Shared</p> : null}
                        </TD>
                        <TD className="font-mono text-xs">{link.credentialSet.username ?? "None"}</TD>
                        <TD>{link.purpose ?? "Not specified"}</TD>
                        <TD>
                          {!link.credentialSet.passwordChangedAt ? (
                            <NoPasswordNote />
                          ) : canReveal ? (
                            <RevealPassword id={link.credentialSet.id} compact />
                          ) : (
                            <span className="text-xs text-muted-foreground">Stored</span>
                          )}
                        </TD>
                        {canManageLogins ? (
                          <TD className="text-right">
                            <UnlinkCredentialButton linkId={link.id} label={link.credentialSet.name} />
                          </TD>
                        ) : null}
                      </TR>
                    ))}
                  </TBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center justify-between gap-3">
              <CardTitle>Connections</CardTitle>
              <div className="flex flex-wrap items-center gap-2">
                {connections.length > 0 ? (
                  <Link
                    href={`/infrastructure/topology?focus=${device.id}`}
                    className="inline-flex h-8 items-center rounded-full border px-3 text-xs font-medium transition-colors hover:border-primary/40 hover:bg-accent"
                  >
                    Show on the map
                  </Link>
                ) : null}
                {canManage ? <LinkDialog devices={linkOptions} fixedDeviceId={device.id} /> : null}
              </div>
            </CardHeader>
            <CardContent>
              {connections.length === 0 ? (
                <p className="text-sm text-muted-foreground">No cables recorded. Add them here, or import a neighbour table.</p>
              ) : (
                <Table>
                  <THead>
                    <TR><TH>Port</TH><TH>Connects to</TH><TH>Its port</TH><TH>Recorded</TH>{canManage ? <TH className="text-right">Actions</TH> : null}</TR>
                  </THead>
                  <TBody>
                    {connections.map(({ link, port, other, otherPort, loop }) => {
                      const ownCompanyOnly = isGlobalAdmin || (link.deviceA.companyId === user.companyId && link.deviceB.companyId === user.companyId);
                      return (
                        <TR key={link.id}>
                          <TD className={loop ? "font-mono text-xs text-destructive" : "font-mono text-xs"}>{port ?? "?"}</TD>
                          <TD>
                            {loop ? (
                              <span className="text-xs font-medium text-destructive">Loop back to this device</span>
                            ) : isGlobalAdmin || other.companyId === user.companyId ? (
                              <Link href={`/infrastructure/devices/${other.id}`} className="font-medium hover:underline">{other.name}</Link>
                            ) : (
                              <span className="text-muted-foreground">{other.name}</span>
                            )}
                          </TD>
                          <TD className="font-mono text-xs">{otherPort ?? "?"}</TD>
                          <TD className="text-xs text-muted-foreground">
                            {link.source === "DISCOVERY" ? `Discovered${link.lastSeenAt ? `, seen ${formatDate(link.lastSeenAt)}` : ""}` : "Added by hand"}
                          </TD>
                          {canManage ? (
                            <TD className="text-right">
                              {ownCompanyOnly ? (
                                <div className="flex justify-end">
                                  <LinkDialog
                                    devices={linkOptions}
                                    fixedDeviceId={device.id}
                                    trigger="icon"
                                    link={{ id: link.id, deviceAId: link.deviceAId, portA: link.portA, deviceBId: link.deviceBId, portB: link.portB, notes: link.notes }}
                                  />
                                  <RemoveLinkButton
                                    linkId={link.id}
                                    label={`${device.name} ${port ?? ""} to ${other.name} ${otherPort ?? ""}`.replace(/\s+/g, " ").trim()}
                                  />
                                </div>
                              ) : null}
                            </TD>
                          ) : null}
                        </TR>
                      );
                    })}
                  </TBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {!isServer ? (
            <Card>
              <CardHeader className="flex-row flex-wrap items-center justify-between gap-3">
                <CardTitle>Configuration backup</CardTitle>
                {canManage ? (
                  <div className="flex flex-wrap items-center gap-3">
                    <BackupIncludedToggle deviceId={device.id} included={device.configBackup} />
                    <BackupNowButton deviceId={device.id} />
                  </div>
                ) : null}
              </CardHeader>
              <CardContent>
                <BackupStatusLine status={device.configStatus} error={device.configError} checkedAt={device.configCheckedAt} included={device.configBackup} />
                {device.configs.length === 0 ? (
                  <p className="mt-3 text-sm text-muted-foreground">
                    No configuration saved yet. Link an SSH login to this device, then back it up.
                  </p>
                ) : (
                  <>
                    <div className="mt-3" />
                    <Table>
                      <THead>
                        <TR><TH>Saved</TH><TH>Firmware</TH><TH>Lines</TH><TH>Change</TH>{canViewConfigs ? <TH className="text-right">Open</TH> : null}</TR>
                      </THead>
                      <TBody>
                        {device.configs.map((config, index) => {
                          const first = index === device.configs.length - 1 && device._count.configs === device.configs.length;
                          const base = `/infrastructure/devices/${device.id}/config/${config.id}`;
                          return (
                            <TR key={config.id}>
                              <TD className="text-xs">
                                {formatDateTime(config.takenAt)}
                                {index === 0 ? <span className="ml-2 text-muted-foreground">latest</span> : null}
                              </TD>
                              <TD className="font-mono text-xs">{config.firmware ?? "?"}</TD>
                              <TD className="text-xs tabular-nums">{config.lineCount}</TD>
                              <TD className="text-xs">
                                {first ? (
                                  <span className="text-muted-foreground">First copy</span>
                                ) : (
                                  <span className="font-mono">
                                    <span className="text-success">+{config.linesAdded}</span>{" "}
                                    <span className="text-destructive">-{config.linesRemoved}</span>
                                  </span>
                                )}
                              </TD>
                              {canViewConfigs ? (
                                <TD className="text-right text-xs">
                                  <Link href={base} className="font-medium hover:underline">View</Link>
                                  {!first ? (
                                    <Link href={`${base}?compare=1`} className="ml-3 font-medium hover:underline">Changes</Link>
                                  ) : null}
                                </TD>
                              ) : null}
                            </TR>
                          );
                        })}
                      </TBody>
                    </Table>
                    <p className="mt-2 text-xs text-muted-foreground">
                      A new copy is kept only when the configuration changes.
                      {device._count.configs > device.configs.length ? ` Showing the latest ${device.configs.length} of ${device._count.configs}.` : ""}
                      {!canViewConfigs ? " Opening a saved configuration needs the right to view configurations." : ""}
                    </p>
                  </>
                )}
              </CardContent>
            </Card>
          ) : null}

          {isServer ? (
            <Card>
              <CardHeader><CardTitle>Applications on this server</CardTitle></CardHeader>
              <CardContent>
                {device.applications.length === 0 ? (
                  <p className="text-sm text-muted-foreground">None recorded.</p>
                ) : (
                  <ul className="flex flex-wrap gap-2">
                    {device.applications.map((link) => (
                      <li key={link.id}>
                        <Link
                          href={`/applications/${link.application.id}`}
                          className="inline-flex rounded-full border px-3 py-1 text-sm transition-colors hover:border-primary/40 hover:bg-accent"
                        >
                          {link.application.name}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          ) : null}

          {device.guests.length > 0 ? (
            <Card>
              <CardHeader><CardTitle>Running on this host</CardTitle></CardHeader>
              <CardContent>
                <Table>
                  <THead><TR><TH>Name</TH><TH>IP address</TH><TH>OS</TH><TH>Status</TH></TR></THead>
                  <TBody>
                    {device.guests.map((guest) => (
                      <TR key={guest.id}>
                        <TD><Link href={`/infrastructure/devices/${guest.id}`} className="font-medium hover:underline">{guest.name}</Link></TD>
                        <TD className="font-mono text-xs">{guest.ipAddress ?? "None"}</TD>
                        <TD className="text-xs">{guest.operatingSystem ?? "None"}</TD>
                        <TD><StatusBadge status={guest.status} /></TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader><CardTitle>Recent changes</CardTitle></CardHeader>
            <CardContent>
              {activity.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nothing recorded yet. Imported devices are logged under the import.</p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {activity.map((event) => (
                    <li key={event.id} className="flex flex-wrap justify-between gap-2 border-b pb-2 last:border-0">
                      <span>{event.action}</span>
                      <span className="text-xs text-muted-foreground">{event.actorLabel} · {formatDateTime(event.occurredAt)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

/** What the last backup attempt did, in one line. */
function BackupStatusLine({
  status, error, checkedAt, included,
}: { status: string | null; error: string | null; checkedAt: Date | null; included: boolean }) {
  if (!checkedAt) {
    return (
      <p className="text-sm text-muted-foreground">
        {included ? "Not backed up yet. The nightly backup will try it." : "Left out of the nightly backup."}
      </p>
    );
  }
  const tone = status === "OK" ? "text-success" : status === "FAILED" ? "text-destructive" : "text-warning";
  const word = status === "OK" ? "Saved" : status === "FAILED" ? "Failed" : "Not set up";
  return (
    <div className="text-sm">
      <p>
        <span className={`font-medium ${tone}`}>{word}</span>
        <span className="text-muted-foreground"> · last tried {formatDateTime(checkedAt)}</span>
      </p>
      {error ? <p className="text-xs text-muted-foreground">{error}</p> : null}
      {!included ? <p className="text-xs text-muted-foreground">Left out of the nightly backup.</p> : null}
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
