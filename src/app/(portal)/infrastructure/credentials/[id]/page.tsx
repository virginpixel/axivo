import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/shared/auth/guard";
import { db } from "@/shared/db";
import { PageHeader } from "@/shared/ui/page";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { StatusBadge } from "@/shared/ui/badge";
import { SortableTable } from "@/shared/ui/sortable-table";
import { DeleteButton } from "@/shared/ui/delete-button";
import { formatDate, formatDateTime } from "@/shared/utils";
import { ipToNumber } from "@/modules/infrastructure/ip-math";
import { deleteCredentialSetAction } from "@/modules/infrastructure/actions";
import {
  CredentialSetDialog, RevealPassword, LinkDevicesDialog, UnlinkCredentialButton, NoPasswordNote,
} from "../../credential-dialogs";

export const dynamic = "force-dynamic";
export const metadata = { title: "Credential set" };

/** One credential set: who uses it, its reveal history, and the controls. */
export default async function CredentialSetPage({ params }: { params: Promise<{ id: string }> }) {
  const { user } = await requirePermission("infrastructure.view");
  const { id } = await params;
  const isGlobalAdmin = user.systemRoleKey === "SYSTEM_ADMINISTRATOR";
  const canManage = user.permissions.has("infrastructure.credentials.manage");
  const canReveal = user.permissions.has("infrastructure.credentials.reveal");

  const set = await db.credentialSet.findFirst({
    where: {
      id,
      deletedAt: null,
      ...(isGlobalAdmin ? {} : { OR: [{ companyId: user.companyId }, { companyId: null }] }),
    },
    select: {
      id: true, name: true, username: true, notes: true, companyId: true, passwordChangedAt: true, createdAt: true,
      company: { select: { name: true } },
      devices: {
        where: { device: { deletedAt: null, ...(isGlobalAdmin ? {} : { companyId: user.companyId }) } },
        orderBy: { device: { name: "asc" } },
        include: {
          device: {
            select: { id: true, name: true, ipAddress: true, status: true, kind: true, type: { select: { name: true } }, company: { select: { name: true } } },
          },
        },
      },
    },
  });
  if (!set) notFound();
  // A shared set is visible to every company but only a System Administrator changes it.
  const canEdit = canManage && (set.companyId !== null || isGlobalAdmin);

  const [companies, candidates, history] = await Promise.all([
    db.company.findMany({
      where: { deletedAt: null, isActive: true, ...(isGlobalAdmin ? {} : { id: user.companyId }) },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    canManage
      ? db.infraDevice.findMany({
          where: {
            deletedAt: null,
            ...(set.companyId ? { companyId: set.companyId } : {}),
            ...(isGlobalAdmin ? {} : { companyId: user.companyId }),
            credentials: { none: { credentialSetId: set.id } },
          },
          orderBy: { name: "asc" },
          select: { id: true, name: true, ipAddress: true, type: { select: { name: true } }, company: { select: { name: true } } },
        })
      : [],
    db.auditEvent.findMany({
      where: { targetType: "credential_set", targetId: set.id },
      orderBy: { occurredAt: "desc" },
      take: 15,
      select: { id: true, action: true, actorLabel: true, occurredAt: true },
    }),
  ]);

  return (
    <div>
      <PageHeader
        title={set.name}
        backHref="/infrastructure/credentials"
        backLabel="Credential vault"
        description={[set.username ? `Username ${set.username}` : "No username", set.company?.name ?? "Shared by every company"].join(" · ")}
        actions={
          canEdit ? (
            <div className="flex items-center gap-2">
              <CredentialSetDialog
                companies={companies}
                canShare={isGlobalAdmin}
                trigger="button"
                set={{ id: set.id, companyId: set.companyId, name: set.name, username: set.username, notes: set.notes, hasPassword: !!set.passwordChangedAt }}
              />
              <DeleteButton
                action={deleteCredentialSetAction}
                id={set.id}
                entityLabel={set.name}
                message={`Delete "${set.name}"? It is unlinked from ${set.devices.length} device${set.devices.length === 1 ? "" : "s"} and the stored password is erased.`}
                successMessage="Credential set deleted."
                redirectTo="/infrastructure/credentials"
                variant="button"
              />
            </div>
          ) : undefined
        }
      />

      <div className="grid gap-5 lg:grid-cols-3">
        <Card>
          <CardHeader><CardTitle>Login</CardTitle></CardHeader>
          <CardContent>
            <dl className="space-y-2 text-sm">
              <Row label="Username" value={set.username ? <span className="font-mono">{set.username}</span> : "None"} />
              <Row
                label="Password"
                value={
                  !set.passwordChangedAt ? <NoPasswordNote />
                    : canReveal ? <RevealPassword id={set.id} />
                    : "Stored, encrypted"
                }
              />
              <Row label="Password set" value={set.passwordChangedAt ? formatDate(set.passwordChangedAt) : "Never"} />
              <Row label="Company" value={set.company?.name ?? "Shared"} />
              <Row label="Created" value={formatDate(set.createdAt)} />
            </dl>
            {set.notes ? (
              <div className="mt-4 border-t pt-3 text-sm">
                <p className="mb-1 label-caps text-muted-foreground">Notes</p>
                <p className="whitespace-pre-wrap">{set.notes}</p>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <div className="space-y-5 lg:col-span-2">
          <Card>
            <CardHeader className="flex-row items-center justify-between gap-3">
              <CardTitle>Used by {set.devices.length} device{set.devices.length === 1 ? "" : "s"}</CardTitle>
              {canManage && candidates.length > 0 ? (
                <LinkDevicesDialog
                  credentialSetId={set.id}
                  devices={candidates.map((d) => ({
                    id: d.id,
                    name: d.name,
                    hint: [d.type.name, d.ipAddress, isGlobalAdmin && !set.companyId ? d.company.name : null].filter(Boolean).join(" · "),
                  }))}
                />
              ) : null}
            </CardHeader>
            <CardContent>
              {set.devices.length === 0 ? (
                <p className="text-sm text-muted-foreground">No device uses this login yet.</p>
              ) : (
                <SortableTable
                  pageSize={25}
                  noun="device"
                  initialSort={{ key: "device", dir: "asc" }}
                  columns={[
                    { key: "device", label: "Device" },
                    { key: "type", label: "Type" },
                    { key: "ip", label: "IP address" },
                    ...(set.companyId ? [] : [{ key: "company", label: "Company" }]),
                    { key: "purpose", label: "Used for" },
                    { key: "status", label: "Status" },
                    ...(canManage ? [{ key: "unlink", label: "Unlink", sortable: false, align: "right" as const }] : []),
                  ]}
                  rows={set.devices.map((link) => ({
                    key: link.id,
                    cells: {
                      device: {
                        sortValue: link.device.name,
                        node: <Link href={`/infrastructure/devices/${link.device.id}`} className="font-medium hover:underline">{link.device.name}</Link>,
                      },
                      type: { sortValue: link.device.type.name, node: link.device.type.name },
                      ip: {
                        sortValue: link.device.ipAddress ? ipToNumber(link.device.ipAddress) ?? link.device.ipAddress : null,
                        node: link.device.ipAddress ?? "None",
                        className: "font-mono text-xs",
                      },
                      company: { sortValue: link.device.company.name, node: link.device.company.name },
                      purpose: { sortValue: link.purpose, node: link.purpose ?? "Not specified" },
                      status: { sortValue: link.device.status, node: <StatusBadge status={link.device.status} /> },
                      unlink: { node: canManage ? <UnlinkCredentialButton linkId={link.id} label={set.name} /> : null },
                    },
                  }))}
                />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>History</CardTitle></CardHeader>
            <CardContent>
              {history.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nothing recorded yet.</p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {history.map((event) => (
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

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b pb-2 last:border-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
  );
}
