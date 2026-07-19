import Link from "next/link";
import { requirePermission } from "@/shared/auth/guard";
import { db } from "@/shared/db";
import { redisConnection } from "@/shared/queue/queue";
import { getSetting, getSmtpConfig, SETTING_KEYS } from "@/shared/settings/settings";
import type { PasswordPolicy } from "@/shared/crypto/password";
import { PageHeader, StatCard } from "@/shared/ui/page";
import { Table, THead, TBody, TR, TH, TD } from "@/shared/ui/table";
import { formatDateTime, fullName, cn } from "@/shared/utils";
import {
  SecuritySettingsForm,
  SmtpSettingsForm,
  BrandingForm,
  NotificationSettingsForm,
  MaintenanceForm,
  UploadSettingsForm,
  ForceLogoutButton,
} from "./settings-forms";
import { CatalogSection, LogoUploadForm, TimezoneForm, AssetCategoryToggle } from "./settings-catalogs";
import { CategoryDialog } from "../assets/asset-dialogs";
import { OrgEntityDialog, ToggleActiveButton } from "../organization/org-dialogs";

export const metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

const TABS = [
  { key: "general", label: "General & Branding" },
  { key: "catalogs", label: "Catalogs" },
  { key: "asset-categories", label: "Asset Categories" },
  { key: "locations", label: "Asset Locations" },
  { key: "security", label: "Security" },
  { key: "email", label: "Email (SMTP)" },
  { key: "notifications", label: "Notifications" },
  { key: "health", label: "System Health" },
  { key: "sessions", label: "Active Sessions" },
] as const;

/** System administration & configuration (SDS Doc 17) with a settings side nav. */
export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { user } = await requirePermission("settings.view");
  const params = await searchParams;
  const tab = TABS.find((entry) => entry.key === params.tab)?.key ?? "general";
  const canManage = user.permissions.has("settings.manage");
  const canSecurity = user.permissions.has("settings.security.manage");

  return (
    <div>
      <PageHeader title="Settings" description="Platform configuration. Every change is versioned and audited." />
      <div className="flex flex-col gap-6 lg:flex-row">
        <nav
          aria-label="Settings sections"
          className="flex shrink-0 flex-row flex-wrap gap-1 lg:w-52 lg:flex-col"
        >
          {TABS.map((entry) => (
            <Link
              key={entry.key}
              href={`/settings?tab=${entry.key}`}
              aria-current={tab === entry.key ? "page" : undefined}
              className={cn(
                "rounded-md px-3 py-2 text-sm font-medium",
                tab === entry.key
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              {entry.label}
            </Link>
          ))}
        </nav>
        <div className="min-w-0 flex-1">
          {tab === "general" ? <GeneralTab canManage={canManage} /> : null}
          {tab === "catalogs" ? <CatalogsTab /> : null}
          {tab === "asset-categories" ? <AssetCategoriesTab canManage={canManage} isGlobalAdmin={user.systemRoleKey === "SYSTEM_ADMINISTRATOR"} companyId={user.companyId} /> : null}
          {tab === "locations" ? <LocationsTab canManage={canManage} isGlobalAdmin={user.systemRoleKey === "SYSTEM_ADMINISTRATOR"} companyId={user.companyId} /> : null}
          {tab === "security" ? <SecurityTab canManage={canSecurity} /> : null}
          {tab === "email" ? <EmailTab canManage={canManage} /> : null}
          {tab === "notifications" ? <NotificationsTab canManage={canManage} /> : null}
          {tab === "health" ? <HealthTab /> : null}
          {tab === "sessions" ? <SessionsTab canManage={canSecurity} currentSessionId={user.sessionId} /> : null}
        </div>
      </div>
    </div>
  );
}

async function CatalogsTab() {
  const items = await db.catalogItem.findMany({
    where: { deletedAt: null },
    orderBy: { name: "asc" },
    select: { id: true, kind: true, name: true, parentId: true, isActive: true },
  });
  const byKind = (kind: string) => items.filter((item) => item.kind === kind);
  const manufacturers = byKind("MANUFACTURER");
  return (
    <div className="space-y-5">
      <CatalogSection
        kind="MANUFACTURER"
        title="Manufacturers"
        description="Selectable when registering assets."
        items={manufacturers}
      />
      <CatalogSection
        kind="ASSET_MODEL"
        title="Models"
        description="Each model belongs to a manufacturer."
        items={byKind("ASSET_MODEL")}
        manufacturers={manufacturers}
      />
      <CatalogSection
        kind="SUPPLIER"
        title="Suppliers"
        description="Selectable on assets and license purchases."
        items={byKind("SUPPLIER")}
      />
      <CatalogSection
        kind="VENDOR"
        title="Contract vendors"
        description="Selectable when creating contracts."
        items={byKind("VENDOR")}
      />
      <CatalogSection
        kind="CONTRACT_CATEGORY"
        title="Contract categories"
        description="Selectable when creating contracts."
        items={byKind("CONTRACT_CATEGORY")}
      />
    </div>
  );
}

async function AssetCategoriesTab({
  canManage,
  isGlobalAdmin,
  companyId,
}: {
  canManage: boolean;
  isGlobalAdmin: boolean;
  companyId: string;
}) {
  const [categories, companies] = await Promise.all([
    db.assetCategory.findMany({
      where: { deletedAt: null, ...(isGlobalAdmin ? {} : { companyId }) },
      orderBy: { name: "asc" },
      include: {
        company: { select: { name: true } },
        _count: { select: { assets: { where: { deletedAt: null } } } },
      },
    }),
    db.company.findMany({
      where: { deletedAt: null, isActive: true, ...(isGlobalAdmin ? {} : { id: companyId }) },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);
  return (
    <section aria-label="Asset categories">
      <div className="mb-3 flex justify-end">
        {canManage ? <CategoryDialog companies={companies} /> : null}
      </div>
      <Table>
        <THead>
          <TR>
            <TH>Category</TH><TH>Company</TH><TH>Handover ack.</TH><TH>Clearance</TH><TH>Assets</TH><TH>Status</TH>
            {canManage ? <TH className="text-right">Actions</TH> : null}
          </TR>
        </THead>
        <TBody>
          {categories.map((category) => (
            <TR key={category.id}>
              <TD className="font-medium">{category.name}</TD>
              <TD>{category.company.name}</TD>
              <TD>{category.requireHandoverAcceptance ? "Required" : "—"}</TD>
              <TD>{category.requireClearanceRecovery ? "Required" : "—"}</TD>
              <TD>{category._count.assets}</TD>
              <TD>{category.isActive ? "Active" : "Inactive"}</TD>
              {canManage ? (
                <TD className="text-right">
                  <AssetCategoryToggle id={category.id} isActive={category.isActive} />
                </TD>
              ) : null}
            </TR>
          ))}
        </TBody>
      </Table>
    </section>
  );
}

async function LocationsTab({
  canManage,
  isGlobalAdmin,
  companyId,
}: {
  canManage: boolean;
  isGlobalAdmin: boolean;
  companyId: string;
}) {
  const [locations, companies] = await Promise.all([
    db.location.findMany({
      where: { deletedAt: null, ...(isGlobalAdmin ? {} : { companyId }) },
      orderBy: { name: "asc" },
      include: {
        company: { select: { name: true } },
        _count: { select: { assets: { where: { deletedAt: null } } } },
      },
    }),
    db.company.findMany({
      where: { deletedAt: null, isActive: true, ...(isGlobalAdmin ? {} : { id: companyId }) },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);
  return (
    <section aria-label="Asset locations">
      <p className="mb-3 text-sm text-muted-foreground">
        Locations record where assets are placed (offices, floors, warehouses).
      </p>
      <div className="mb-3 flex justify-end">
        {canManage ? <OrgEntityDialog entity="location" companies={companies} /> : null}
      </div>
      <Table>
        <THead>
          <TR>
            <TH>Location</TH><TH>Company</TH><TH>Assets</TH><TH>Status</TH>
            {canManage ? <TH className="text-right">Actions</TH> : null}
          </TR>
        </THead>
        <TBody>
          {locations.map((location) => (
            <TR key={location.id}>
              <TD className="font-medium">{location.name}</TD>
              <TD>{location.company.name}</TD>
              <TD>{location._count.assets}</TD>
              <TD>{location.isActive ? "Active" : "Inactive"}</TD>
              {canManage ? (
                <TD className="text-right">
                  <div className="flex justify-end gap-1">
                    <OrgEntityDialog
                      entity="location"
                      companies={companies}
                      record={{
                        id: location.id,
                        companyId: location.companyId,
                        name: location.name,
                        code: location.code,
                        description: location.description,
                      }}
                    />
                    <ToggleActiveButton entity="location" id={location.id} isActive={location.isActive} />
                  </div>
                </TD>
              ) : null}
            </TR>
          ))}
        </TBody>
      </Table>
    </section>
  );
}

async function GeneralTab({ canManage }: { canManage: boolean }) {
  const [branding, general, maintenance, uploadMaxMb, allowedTypes] = await Promise.all([
    getSetting<{ systemName: string; primaryColor: string; secondaryColor: string; logoStorageKey?: string }>(
      SETTING_KEYS.BRANDING,
    ),
    getSetting<{ defaultTimezone?: string }>(SETTING_KEYS.GENERAL),
    getSetting<{ enabled: boolean; message: string }>(SETTING_KEYS.MAINTENANCE_MODE),
    getSetting<number>(SETTING_KEYS.UPLOAD_MAX_MB),
    getSetting<string[]>(SETTING_KEYS.UPLOAD_ALLOWED_TYPES),
  ]);
  const timezones: string[] = (Intl as unknown as { supportedValuesOf?: (key: string) => string[] })
    .supportedValuesOf?.("timeZone") ?? ["UTC"];
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <div className="space-y-5">
        <BrandingForm
          current={{
            systemName: branding.systemName ?? "Axivo",
            primaryColor: branding.primaryColor ?? "#1d4ed8",
            secondaryColor: branding.secondaryColor ?? "#0f172a",
          }}
          readOnly={!canManage}
        />
        {canManage ? <LogoUploadForm hasLogo={!!branding.logoStorageKey} /> : null}
      </div>
      <div className="space-y-5">
        {canManage ? (
          <TimezoneForm current={general.defaultTimezone ?? "UTC"} timezones={timezones} />
        ) : null}
        <MaintenanceForm current={maintenance} readOnly={!canManage} />
        <UploadSettingsForm current={{ maxMb: uploadMaxMb, allowedTypes }} readOnly={!canManage} />
      </div>
    </div>
  );
}

async function SecurityTab({ canManage }: { canManage: boolean }) {
  const [idle, absolute, maxAttempts, cooldown, tokenExpiry, credentialExpiry, publicRate, policy] =
    await Promise.all([
      getSetting<number>(SETTING_KEYS.SESSION_IDLE_MINUTES),
      getSetting<number>(SETTING_KEYS.SESSION_ABSOLUTE_HOURS),
      getSetting<number>(SETTING_KEYS.LOGIN_MAX_ATTEMPTS),
      getSetting<number>(SETTING_KEYS.LOGIN_COOLDOWN_MINUTES),
      getSetting<number>(SETTING_KEYS.TOKEN_EXPIRY_HOURS),
      getSetting<number>(SETTING_KEYS.CREDENTIAL_SECRET_EXPIRY_HOURS),
      getSetting<number>(SETTING_KEYS.PUBLIC_FORM_RATE_PER_HOUR),
      getSetting<PasswordPolicy>(SETTING_KEYS.PASSWORD_POLICY),
    ]);
  return (
    <SecuritySettingsForm
      current={{
        sessionIdleMinutes: idle,
        sessionAbsoluteHours: absolute,
        loginMaxAttempts: maxAttempts,
        loginCooldownMinutes: cooldown,
        tokenExpiryHours: tokenExpiry,
        credentialSecretExpiryHours: credentialExpiry,
        publicFormRatePerHour: publicRate,
        passwordMinLength: policy.minLength,
      }}
      readOnly={!canManage}
    />
  );
}

async function EmailTab({ canManage }: { canManage: boolean }) {
  const config = await getSmtpConfig();
  return (
    <SmtpSettingsForm
      current={
        config
          ? {
              host: config.host,
              port: config.port,
              encryption: config.encryption,
              authMethod: config.authMethod,
              username: config.username ?? "",
              senderName: config.senderName,
              senderEmail: config.senderEmail,
              replyTo: config.replyTo ?? "",
              hasPassword: !!config.passwordCiphertext,
            }
          : null
      }
      readOnly={!canManage}
    />
  );
}

async function NotificationsTab({ canManage }: { canManage: boolean }) {
  const [approvalHours, implementationHours, ackHours, onRejection, onFinal, contractDays, licenseDays] =
    await Promise.all([
      getSetting<number>(SETTING_KEYS.REMINDER_APPROVAL_HOURS),
      getSetting<number>(SETTING_KEYS.REMINDER_IMPLEMENTATION_HOURS),
      getSetting<number>(SETTING_KEYS.REMINDER_ACK_HOURS),
      getSetting<boolean>(SETTING_KEYS.NOTIFY_REQUESTER_ON_REJECTION),
      getSetting<boolean>(SETTING_KEYS.NOTIFY_REQUESTER_ON_FINAL_APPROVAL),
      getSetting<number[]>(SETTING_KEYS.CONTRACT_REMINDER_DAYS),
      getSetting<number[]>(SETTING_KEYS.LICENSE_REMINDER_DAYS),
    ]);
  return (
    <NotificationSettingsForm
      current={{
        reminderApprovalHours: approvalHours,
        reminderImplementationHours: implementationHours,
        reminderAckHours: ackHours,
        notifyRequesterOnRejection: onRejection,
        notifyRequesterOnFinalApproval: onFinal,
        contractReminderDays: contractDays,
        licenseReminderDays: licenseDays,
      }}
      readOnly={!canManage}
    />
  );
}

async function HealthTab() {
  // Health checks (SDS Doc 02 Ch12): DB, Redis, worker heartbeat, queues, storage.
  let databaseOk = false;
  try {
    await db.$queryRaw`SELECT 1`;
    databaseOk = true;
  } catch {
    databaseOk = false;
  }
  let redisOk = false;
  try {
    const pong = await redisConnection().ping();
    redisOk = pong === "PONG";
  } catch {
    redisOk = false;
  }
  const [queued, failed, activeSessions, recentWorkerEvent, storageDocs] = await Promise.all([
    db.notification.count({ where: { status: "QUEUED" } }),
    db.notification.count({ where: { status: "FAILED" } }),
    db.session.count({ where: { revokedAt: null, absoluteExpiresAt: { gt: new Date() } } }),
    db.auditEvent.findFirst({
      where: { module: { in: ["system", "credentials"] }, eventType: { startsWith: "maintenance." } },
      orderBy: { occurredAt: "desc" },
    }),
    db.documentVersion.aggregate({ _sum: { fileSize: true }, _count: true }),
  ]);

  return (
    <div>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Database" value={databaseOk ? "Online" : "Offline"} tone={databaseOk ? "success" : "destructive"} />
        <StatCard label="Redis / queues" value={redisOk ? "Online" : "Offline"} tone={redisOk ? "success" : "destructive"} />
        <StatCard label="Queued emails" value={queued} tone={queued > 20 ? "warning" : "default"} />
        <StatCard label="Failed emails" value={failed} tone={failed > 0 ? "destructive" : "default"} />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-3">
        <StatCard label="Active portal sessions" value={activeSessions} />
        <StatCard
          label="Last maintenance job"
          value={recentWorkerEvent ? formatDateTime(recentWorkerEvent.occurredAt) : "No record yet"}
          hint={recentWorkerEvent?.action}
          tone={recentWorkerEvent ? "default" : "warning"}
        />
        <StatCard
          label="Document storage"
          value={`${(((storageDocs._sum.fileSize ?? 0) / 1024 / 1024)).toFixed(1)} MB`}
          hint={`${storageDocs._count} stored file version(s)`}
        />
      </div>
      <p className="mt-4 text-xs text-muted-foreground">
        Backups: run scheduled database dumps and file-storage snapshots from the host (see
        docs/deployment.md). Restores are performed by System Administrators only and are audited.
      </p>
    </div>
  );
}

async function SessionsTab({ canManage, currentSessionId }: { canManage: boolean; currentSessionId: string }) {
  const sessions = await db.session.findMany({
    where: { revokedAt: null, absoluteExpiresAt: { gt: new Date() } },
    orderBy: { lastActivityAt: "desc" },
    include: { systemUser: { include: { person: true } } },
    take: 100,
  });
  return (
    <Table>
      <THead>
        <TR>
          <TH>User</TH><TH>IP address</TH><TH>Signed in</TH><TH>Last activity</TH><TH>Expires</TH>
          {canManage ? <TH className="text-right">Actions</TH> : null}
        </TR>
      </THead>
      <TBody>
        {sessions.map((session) => (
          <TR key={session.id}>
            <TD>
              <span className="font-medium">{session.systemUser.username}</span>
              <p className="text-xs text-muted-foreground">{fullName(session.systemUser.person)}</p>
            </TD>
            <TD className="font-mono text-xs">{session.ipAddress ?? "—"}</TD>
            <TD className="text-xs">{formatDateTime(session.createdAt)}</TD>
            <TD className="text-xs">{formatDateTime(session.lastActivityAt)}</TD>
            <TD className="text-xs">{formatDateTime(session.absoluteExpiresAt)}</TD>
            {canManage ? (
              <TD className="text-right">
                {session.id === currentSessionId ? (
                  <span className="text-xs text-muted-foreground">Current session</span>
                ) : (
                  <ForceLogoutButton sessionId={session.id} />
                )}
              </TD>
            ) : null}
          </TR>
        ))}
      </TBody>
    </Table>
  );
}
