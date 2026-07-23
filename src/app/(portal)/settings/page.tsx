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
import { LogoUploadForm, TimezoneForm, AssetCategoryToggle, CatalogSection, GeneratedLogosForm, RequestFormLogosForm, PublicBaseUrlForm } from "./settings-catalogs";
import {
  ManufacturerDialog, ManufacturerToggle,
  VendorDialog, VendorToggle,
  AssetModelDialog, AssetModelToggle, ModelImageControl,
  CustomFieldDialog, CustomFieldToggle,
  FieldSetDialog, FieldSetToggle,
  CurrencyDialog, CurrencyToggle, BaseCurrencyForm,
  VendorLogoControl,
} from "./catalog-dialogs";
import { CUSTOM_FIELD_FORMAT_LABELS, type CustomFieldFormat } from "@/modules/catalogs/format";
import { CategoryDialog } from "../assets/asset-dialogs";
import { OrgEntityDialog, ToggleActiveButton } from "../organization/org-dialogs";

export const metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

const TABS = [
  { key: "general", label: "General & Branding" },
  { key: "custom-fields", label: "Custom Fields" },
  { key: "manufacturers", label: "Manufacturers" },
  { key: "models", label: "Asset Models" },
  { key: "vendors", label: "Vendors" },
  { key: "asset-categories", label: "Asset Categories" },
  { key: "locations", label: "Asset Locations" },
  { key: "contract-categories", label: "Contract Categories" },
  { key: "currencies", label: "Currencies" },
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
          {tab === "manufacturers" ? <ManufacturersTab canManage={canManage} /> : null}
          {tab === "models" ? <ModelsTab canManage={canManage} /> : null}
          {tab === "vendors" ? <VendorsTab canManage={canManage} /> : null}
          {tab === "custom-fields" ? <CustomFieldsTab canManage={canManage} /> : null}
          {tab === "asset-categories" ? <AssetCategoriesTab canManage={canManage} /> : null}
          {tab === "locations" ? <LocationsTab canManage={canManage} isGlobalAdmin={user.systemRoleKey === "SYSTEM_ADMINISTRATOR"} companyId={user.companyId} /> : null}
          {tab === "contract-categories" ? <ContractCategoriesTab canManage={canManage} /> : null}
          {tab === "currencies" ? <CurrenciesTab canManage={canManage} /> : null}
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

async function ManufacturersTab({ canManage }: { canManage: boolean }) {
  const manufacturers = await db.manufacturer.findMany({
    where: { deletedAt: null },
    orderBy: { name: "asc" },
    include: { _count: { select: { models: { where: { deletedAt: null } } } } },
  });
  const assetCounts = await db.asset.groupBy({
    by: ["manufacturer"],
    where: { deletedAt: null, manufacturer: { not: null } },
    _count: { _all: true },
  });
  const countFor = (name: string) => assetCounts.find((row) => row.manufacturer === name)?._count._all ?? 0;
  return (
    <section aria-label="Manufacturers">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Selectable when registering assets. Click a manufacturer to see its assets.</p>
        {canManage ? <ManufacturerDialog /> : null}
      </div>
      <Table>
        <THead><TR><TH>Name</TH><TH>Models</TH><TH>Assets</TH><TH>Status</TH>{canManage ? <TH className="text-right">Actions</TH> : null}</TR></THead>
        <TBody>
          {manufacturers.map((manufacturer) => (
            <TR key={manufacturer.id}>
              <TD className="font-medium">
                <Link href={`/settings/manufacturers/${manufacturer.id}`} className="hover:underline">{manufacturer.name}</Link>
              </TD>
              <TD>{manufacturer._count.models}</TD>
              <TD>{countFor(manufacturer.name)}</TD>
              <TD>{manufacturer.isActive ? "Active" : "Inactive"}</TD>
              {canManage ? (
                <TD className="text-right">
                  <div className="flex justify-end gap-1">
                    <ManufacturerDialog manufacturer={{ id: manufacturer.id, name: manufacturer.name }} />
                    <ManufacturerToggle id={manufacturer.id} isActive={manufacturer.isActive} />
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

async function ModelsTab({ canManage }: { canManage: boolean }) {
  const [models, manufacturers, fieldSets] = await Promise.all([
    db.assetModel.findMany({
      where: { deletedAt: null },
      orderBy: { name: "asc" },
      include: { manufacturer: { select: { name: true } }, fieldSet: { select: { name: true } } },
    }),
    db.manufacturer.findMany({ where: { deletedAt: null, isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.fieldSet.findMany({ where: { deletedAt: null, isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  const assetCounts = await db.asset.groupBy({
    by: ["model"],
    where: { deletedAt: null, model: { not: null } },
    _count: { _all: true },
  });
  const countFor = (name: string) => assetCounts.find((row) => row.model === name)?._count._all ?? 0;
  return (
    <section aria-label="Asset models">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Models carry a fieldset and a default image. Click a model to see its assets.</p>
        {canManage ? <AssetModelDialog manufacturers={manufacturers} fieldSets={fieldSets} /> : null}
      </div>
      <Table>
        <THead><TR><TH>Model</TH><TH>Manufacturer</TH><TH>Fieldset</TH><TH>Assets</TH><TH>Image</TH><TH>Status</TH>{canManage ? <TH className="text-right">Actions</TH> : null}</TR></THead>
        <TBody>
          {models.map((model) => (
            <TR key={model.id}>
              <TD className="font-medium">
                <Link href={`/settings/models/${model.id}`} className="hover:underline">{model.name}</Link>
              </TD>
              <TD>{model.manufacturer?.name ?? "None"}</TD>
              <TD>{model.fieldSet?.name ?? "None"}</TD>
              <TD>{countFor(model.name)}</TD>
              <TD>{canManage ? <ModelImageControl modelId={model.id} hasImage={!!model.imagePath} /> : model.imagePath ? "Yes" : "None"}</TD>
              <TD>{model.isActive ? "Active" : "Inactive"}</TD>
              {canManage ? (
                <TD className="text-right">
                  <div className="flex justify-end gap-1">
                    <AssetModelDialog
                      manufacturers={manufacturers}
                      fieldSets={fieldSets}
                      model={{ id: model.id, name: model.name, manufacturerId: model.manufacturerId, fieldSetId: model.fieldSetId, notes: model.notes }}
                    />
                    <AssetModelToggle id={model.id} isActive={model.isActive} />
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

async function VendorsTab({ canManage }: { canManage: boolean }) {
  const vendors = await db.vendor.findMany({ where: { deletedAt: null }, orderBy: { name: "asc" } });
  const [assetCounts, contractCounts] = await Promise.all([
    db.asset.groupBy({ by: ["supplier"], where: { deletedAt: null, supplier: { not: null } }, _count: { _all: true } }),
    db.contract.groupBy({ by: ["vendor"], where: { deletedAt: null }, _count: { _all: true } }),
  ]);
  const assetFor = (name: string) => assetCounts.find((row) => row.supplier === name)?._count._all ?? 0;
  const contractFor = (name: string) => contractCounts.find((row) => row.vendor === name)?._count._all ?? 0;
  return (
    <section aria-label="Vendors">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Suppliers of assets and contracts. Click a vendor for details, assets and contracts.</p>
        {canManage ? <VendorDialog /> : null}
      </div>
      <Table>
        <THead><TR><TH>Name</TH><TH>Logo</TH><TH>Contact</TH><TH>Assets</TH><TH>Contracts</TH><TH>Status</TH>{canManage ? <TH className="text-right">Actions</TH> : null}</TR></THead>
        <TBody>
          {vendors.map((vendor) => (
            <TR key={vendor.id}>
              <TD className="font-medium">
                <Link href={`/settings/vendors/${vendor.id}`} className="hover:underline">{vendor.name}</Link>
              </TD>
              <TD>
                {vendor.logoPath ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={`/api/vendors/${vendor.id}/logo`} alt={vendor.name} className="h-6 max-w-24 object-contain" />
                ) : canManage ? (
                  <VendorLogoControl vendorId={vendor.id} hasLogo={false} />
                ) : "None"}
              </TD>
              <TD>{vendor.contactName ?? "None"}{vendor.contactPhone ? ` (${vendor.contactPhone})` : ""}</TD>
              <TD>{assetFor(vendor.name)}</TD>
              <TD>{contractFor(vendor.name)}</TD>
              <TD>{vendor.isActive ? "Active" : "Inactive"}</TD>
              {canManage ? (
                <TD className="text-right">
                  <div className="flex justify-end gap-1">
                    {vendor.logoPath ? <VendorLogoControl vendorId={vendor.id} hasLogo /> : null}
                    <VendorDialog vendor={{ id: vendor.id, name: vendor.name, contactName: vendor.contactName, contactPhone: vendor.contactPhone, contactEmail: vendor.contactEmail, notes: vendor.notes }} />
                    <VendorToggle id={vendor.id} isActive={vendor.isActive} />
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

async function CustomFieldsTab({ canManage }: { canManage: boolean }) {
  const [fields, fieldSets, activeFields] = await Promise.all([
    db.customField.findMany({ where: { deletedAt: null }, orderBy: { name: "asc" } }),
    db.fieldSet.findMany({
      where: { deletedAt: null },
      orderBy: { name: "asc" },
      include: {
        fields: { orderBy: { sortOrder: "asc" }, include: { customField: { select: { name: true } } } },
        _count: { select: { models: { where: { deletedAt: null } } } },
      },
    }),
    db.customField.findMany({ where: { deletedAt: null, isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  return (
    <div className="space-y-8">
      <section aria-label="Custom fields">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold">Custom fields</h2>
            <p className="text-sm text-muted-foreground">Reusable fields (MAC, IMEI, extension) grouped into fieldsets and attached to models.</p>
          </div>
          {canManage ? <CustomFieldDialog /> : null}
        </div>
        <Table>
          <THead><TR><TH>Name</TH><TH>Format</TH><TH>Help text</TH><TH>Status</TH>{canManage ? <TH className="text-right">Actions</TH> : null}</TR></THead>
          <TBody>
            {fields.map((field) => (
              <TR key={field.id}>
                <TD className="font-medium">{field.name}</TD>
                <TD>{CUSTOM_FIELD_FORMAT_LABELS[field.format as CustomFieldFormat]}</TD>
                <TD className="max-w-72 truncate">{field.helpText ?? "None"}</TD>
                <TD>{field.isActive ? "Active" : "Inactive"}</TD>
                {canManage ? (
                  <TD className="text-right">
                    <div className="flex justify-end gap-1">
                      <CustomFieldDialog field={{ id: field.id, name: field.name, format: field.format as CustomFieldFormat, helpText: field.helpText }} />
                      <CustomFieldToggle id={field.id} isActive={field.isActive} />
                    </div>
                  </TD>
                ) : null}
              </TR>
            ))}
          </TBody>
        </Table>
      </section>

      <section aria-label="Fieldsets">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold">Fieldsets</h2>
            <p className="text-sm text-muted-foreground">Group custom fields, then attach a fieldset to an asset model to collect those fields.</p>
          </div>
          {canManage ? <FieldSetDialog customFields={activeFields} /> : null}
        </div>
        <Table>
          <THead><TR><TH>Fieldset</TH><TH>Fields</TH><TH>Models</TH><TH>Status</TH>{canManage ? <TH className="text-right">Actions</TH> : null}</TR></THead>
          <TBody>
            {fieldSets.map((fieldSet) => (
              <TR key={fieldSet.id}>
                <TD className="font-medium">{fieldSet.name}</TD>
                <TD className="max-w-96">
                  {fieldSet.fields.length === 0 ? "None" : fieldSet.fields.map((f) => `${f.customField.name}${f.required ? "*" : ""}`).join(", ")}
                </TD>
                <TD>{fieldSet._count.models}</TD>
                <TD>{fieldSet.isActive ? "Active" : "Inactive"}</TD>
                {canManage ? (
                  <TD className="text-right">
                    <div className="flex justify-end gap-1">
                      <FieldSetDialog
                        customFields={activeFields}
                        fieldSet={{ id: fieldSet.id, name: fieldSet.name, fields: fieldSet.fields.map((f) => ({ customFieldId: f.customFieldId, required: f.required })) }}
                      />
                      <FieldSetToggle id={fieldSet.id} isActive={fieldSet.isActive} />
                    </div>
                  </TD>
                ) : null}
              </TR>
            ))}
          </TBody>
        </Table>
      </section>
    </div>
  );
}

async function ContractCategoriesTab({ canManage }: { canManage: boolean }) {
  const items = await db.catalogItem.findMany({
    where: { deletedAt: null, kind: "CONTRACT_CATEGORY" },
    orderBy: { name: "asc" },
    select: { id: true, kind: true, name: true, parentId: true, isActive: true },
  });
  return (
    <CatalogSection
      kind="CONTRACT_CATEGORY"
      title="Contract categories"
      description="Selectable when creating contracts."
      items={items}
    />
  );
}

async function CurrenciesTab({ canManage }: { canManage: boolean }) {
  const [currencies, general] = await Promise.all([
    db.currency.findMany({ where: { deletedAt: null }, orderBy: { code: "asc" } }),
    getSetting<{ defaultCurrency?: string }>(SETTING_KEYS.GENERAL),
  ]);
  const base = general.defaultCurrency ?? "USD";
  return (
    <section aria-label="Currencies">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold">Currencies</h2>
          <p className="text-sm text-muted-foreground">
            Base currency is <span className="font-medium">{base}</span>. Rates express the value of one unit in the base currency; contract totals convert to the base.
          </p>
        </div>
        {canManage ? <CurrencyDialog /> : null}
      </div>
      {canManage ? (
        <div className="mb-4">
          <BaseCurrencyForm current={base} currencies={currencies.filter((c) => c.isActive).map((c) => ({ code: c.code, name: c.name }))} />
        </div>
      ) : null}
      <Table>
        <THead><TR><TH>Code</TH><TH>Name</TH><TH>Rate to base</TH><TH>Base</TH><TH>Status</TH>{canManage ? <TH className="text-right">Actions</TH> : null}</TR></THead>
        <TBody>
          {currencies.map((currency) => (
            <TR key={currency.id}>
              <TD className="font-medium">{currency.code}</TD>
              <TD>{currency.name}</TD>
              <TD>{Number(currency.rateToBase).toLocaleString(undefined, { maximumFractionDigits: 6 })}</TD>
              <TD>{currency.code === base ? "Base" : ""}</TD>
              <TD>{currency.isActive ? "Active" : "Inactive"}</TD>
              {canManage ? (
                <TD className="text-right">
                  <div className="flex justify-end gap-1">
                    <CurrencyDialog currency={{ id: currency.id, code: currency.code, name: currency.name, rateToBase: Number(currency.rateToBase) }} />
                    <CurrencyToggle id={currency.id} isActive={currency.isActive} />
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

/** Asset categories are global, so this tab is not company-scoped. */
async function AssetCategoriesTab({ canManage }: { canManage: boolean }) {
  const [categories, workflows] = await Promise.all([
    db.assetCategory.findMany({
      where: { deletedAt: null },
      orderBy: { name: "asc" },
      include: { _count: { select: { assets: { where: { deletedAt: null } } } } },
    }),
    db.workflow.findMany({
      where: { deletedAt: null, isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);
  return (
    <section aria-label="Asset categories">
      <div className="mb-3 flex justify-end">
        {canManage ? <CategoryDialog workflows={workflows} /> : null}
      </div>
      <Table>
        <THead>
          <TR>
            <TH>Category</TH><TH>Handover ack.</TH><TH>Clearance</TH><TH>Assets</TH><TH>Status</TH>
            {canManage ? <TH className="text-right">Actions</TH> : null}
          </TR>
        </THead>
        <TBody>
          {categories.map((category) => (
            <TR key={category.id}>
              <TD className="font-medium">
                <Link href={`/settings/categories/${category.id}`} className="hover:underline">{category.name}</Link>
              </TD>
              <TD>{category.requireHandoverAcceptance ? "Required" : "None"}</TD>
              <TD>{category.requireClearanceRecovery ? "Required" : "None"}</TD>
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
              <TD className="font-medium">
                <Link href={`/settings/locations/${location.id}`} className="hover:underline">{location.name}</Link>
              </TD>
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
  const [branding, general, maintenance, uploadMaxMb, allowedTypes, generatedLogos, requestFormLogos] = await Promise.all([
    getSetting<{ systemName: string; primaryColor: string; secondaryColor: string; logoStorageKey?: string }>(
      SETTING_KEYS.BRANDING,
    ),
    getSetting<{ defaultTimezone?: string; publicBaseUrl?: string }>(SETTING_KEYS.GENERAL),
    getSetting<{ enabled: boolean; message: string }>(SETTING_KEYS.MAINTENANCE_MODE),
    getSetting<number>(SETTING_KEYS.UPLOAD_MAX_MB),
    getSetting<string[]>(SETTING_KEYS.UPLOAD_ALLOWED_TYPES),
    getSetting<Record<string, unknown>>(SETTING_KEYS.GENERATED_LOGOS),
    getSetting<Record<string, unknown>>(SETTING_KEYS.REQUEST_FORM_LOGOS),
  ]);
  const logoPresent = (set: Record<string, unknown>) => ({
    left: !!(set.left as { storageKey?: string } | null)?.storageKey,
    center: !!(set.center as { storageKey?: string } | null)?.storageKey,
    right: !!(set.right as { storageKey?: string } | null)?.storageKey,
  });
  const timezones: string[] = (Intl as unknown as { supportedValuesOf?: (key: string) => string[] })
    .supportedValuesOf?.("timeZone") ?? ["UTC"];
  const appUrlEnv = process.env.APP_URL ?? "";
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
        {canManage ? <RequestFormLogosForm present={logoPresent(requestFormLogos)} /> : null}
        {canManage ? <GeneratedLogosForm present={logoPresent(generatedLogos)} /> : null}
      </div>
      <div className="space-y-5">
        {canManage ? (
          <TimezoneForm current={general.defaultTimezone ?? "UTC"} timezones={timezones} />
        ) : null}
        {canManage ? (
          <PublicBaseUrlForm current={general.publicBaseUrl ?? ""} envValue={appUrlEnv} />
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
            <TD className="font-mono text-xs">{session.ipAddress ?? "None"}</TD>
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
