import { PrismaClient } from "@prisma/client";
import { hash } from "@node-rs/argon2";

/**
 * Axivo database seed.
 * Creates required platform configuration (system roles with permissions,
 * global approval roles, notification templates) and - on first run only -
 * an initial company plus the System Administrator account from environment
 * variables. Safe to run repeatedly (idempotent upserts, no demo data).
 */

const prisma = new PrismaClient();

const SYSTEM_ROLES: { key: string; name: string; description: string }[] = [
  { key: "SYSTEM_ADMINISTRATOR", name: "System Administrator", description: "Full access to all Axivo functionality and configuration." },
  { key: "IT_ADMINISTRATOR", name: "IT Administrator", description: "Manages IT operations: people, applications, assets, licenses, requests and workflows." },
  { key: "IT_SUPPORT", name: "IT Support", description: "Handles implementations, assignments and day-to-day IT support tasks." },
  { key: "READ_ONLY", name: "Read Only", description: "View-only access for auditors and observers." },
];

const APPROVAL_ROLES: { key: string; name: string; description: string }[] = [
  { key: "DEPARTMENT_HEAD", name: "Department Head", description: "Approves requests for employees of their department." },
  { key: "ASSISTANT_DEPARTMENT_HEAD", name: "Assistant Department Head", description: "Approves requests on behalf of the department." },
  { key: "HR", name: "HR", description: "Human Resources approval." },
  { key: "GENERAL_MANAGER", name: "General Manager", description: "General Manager approval." },
  { key: "IT_APPROVAL", name: "IT Approval", description: "IT departmental approval before implementation." },
  { key: "IT_IMPLEMENTATION", name: "IT Implementation", description: "Executes approved requests: accounts, credentials and assets." },
];

const NOTIFICATION_TEMPLATES: { key: string; name: string; type: string; subject: string; body: string; variables: string[] }[] = [
  {
    key: "approval_required",
    name: "Approval Required",
    type: "APPROVAL_REQUIRED",
    subject: "Approval required: {{itemLabel}} for {{requestedForName}} ({{requestNumber}})",
    body: "Dear {{approverName}},<br/><br/>Your approval is required for request <strong>{{requestNumber}}</strong>.<br/>Item: <strong>{{itemLabel}}</strong><br/>Requested for: {{requestedForName}}<br/><br/><a href=\"{{actionUrl}}\">Review and act on this request</a>",
    variables: ["approverName", "itemLabel", "requestedForName", "requestNumber", "actionUrl"],
  },
  {
    key: "request_rejected",
    name: "Request Rejected",
    type: "REQUEST_REJECTED",
    subject: "Request {{requestNumber}}: {{itemLabel}} was rejected",
    body: "Dear {{requesterName}},<br/><br/>The item <strong>{{itemLabel}}</strong> on request <strong>{{requestNumber}}</strong> was rejected.<br/>Reason: {{comments}}",
    variables: ["requesterName", "itemLabel", "requestNumber", "comments"],
  },
  {
    key: "correction_requested",
    name: "Correction Requested",
    type: "CORRECTION_REQUESTED",
    subject: "Correction requested: {{itemLabel}} ({{requestNumber}})",
    body: "Dear {{requesterName}},<br/><br/>An approver requested a correction for <strong>{{itemLabel}}</strong> on request <strong>{{requestNumber}}</strong>.<br/>Comments: {{comments}}<br/><br/><a href=\"{{actionUrl}}\">Review and correct this item</a>",
    variables: ["requesterName", "itemLabel", "requestNumber", "comments", "actionUrl"],
  },
  {
    key: "credential_delivery",
    name: "Credential Delivery",
    type: "CREDENTIAL_DELIVERY",
    subject: "Your access to {{applicationName}} is ready",
    body: "Dear {{employeeName}},<br/><br/>Your access to <strong>{{applicationName}}</strong> has been set up. For security your credentials are not included in this email.<br/><br/><a href=\"{{actionUrl}}\">View your credentials securely</a>",
    variables: ["employeeName", "applicationName", "actionUrl"],
  },
  {
    key: "asset_handover",
    name: "Asset Handover",
    type: "ASSET_HANDOVER",
    subject: "Asset handover acknowledgement required",
    body: "Dear {{employeeName}},<br/><br/>{{assetCount}} company asset(s) have been assigned to you. Please review and acknowledge receipt.<br/><br/><a href=\"{{actionUrl}}\">Review and acknowledge asset handover</a>",
    variables: ["employeeName", "assetCount", "actionUrl"],
  },
  {
    key: "request_submitted",
    name: "Request Submitted",
    type: "REQUEST_SUBMITTED",
    subject: "Request {{requestNumber}} received",
    body: "Dear {{requesterName}},<br/><br/>We have received request <strong>{{requestNumber}}</strong> for {{requestedForName}}.<br/><br/>It is now with the approvers. We will email you once it has been fully approved, or if it is rejected or sent back for correction. You will not be emailed at each individual approval step.",
    variables: ["requesterName", "requestNumber", "requestedForName"],
  },
  {
    key: "implementation_required",
    name: "Implementation Required",
    type: "IMPLEMENTATION_REQUIRED",
    subject: "Ready to implement: {{itemLabel}} ({{requestNumber}})",
    body: "Dear {{recipientName}},<br/><br/><strong>{{itemLabel}}</strong> on request <strong>{{requestNumber}}</strong> has completed approval and is ready for IT to implement.<br/>Requested for: {{requestedForName}}<br/><br/><a href=\"{{actionUrl}}\">Open the request</a>",
    variables: ["recipientName", "itemLabel", "requestNumber", "requestedForName", "actionUrl"],
  },
  {
    key: "request_completed",
    name: "Request Completed",
    type: "REQUEST_COMPLETED",
    subject: "Request {{requestNumber}} is complete",
    body: "Dear {{requesterName}},<br/><br/>Request <strong>{{requestNumber}}</strong> for {{requestedForName}} is now complete.<br/><br/>{{itemSummary}}",
    variables: ["requesterName", "requestNumber", "requestedForName", "itemSummary"],
  },
  {
    key: "reminder",
    name: "Pending Action Reminder",
    type: "REMINDER",
    subject: "Reminder: action pending on {{requestNumber}}",
    body: "This is a reminder that an action assigned to you on request <strong>{{requestNumber}}</strong> is still pending.<br/><br/><a href=\"{{actionUrl}}\">Open the pending action</a>",
    variables: ["requestNumber", "actionUrl"],
  },
  {
    key: "system_alert",
    name: "System Alert",
    type: "SYSTEM_ALERT",
    subject: "Axivo system alert: {{alertTitle}}",
    body: "{{alertBody}}",
    variables: ["alertTitle", "alertBody"],
  },
];

const DOCUMENT_CATEGORIES = [
  "Asset Handover",
  "Asset Checkout",
  "Access Forms",
  "Role Change Evidence",
  "Clearance",
  "Credential Delivery",
  "Application Request",
  "Asset Disposal",
  "Contract",
  "Supporting Document",
  "System Generated",
  "User Uploaded",
];

const DEFAULT_ROLE_PERMISSIONS: Record<string, string[]> = {
  SYSTEM_ADMINISTRATOR: ["*"],
  IT_ADMINISTRATOR: [
    "organization.view", "organization.manage",
    "people.view", "people.manage", "people.accounts.manage",
    "applications.view", "applications.manage", "applications.assignments.manage", "applications.credentials.deliver",
    "licenses.view", "licenses.manage", "licenses.assignments.manage",
    "assets.view", "assets.manage", "assets.assignments.manage", "assets.maintenance.manage", "assets.disposal.manage",
    "contracts.view", "contracts.manage",
    "forms.view", "forms.manage",
    "workflows.view", "workflows.manage", "workflows.admin",
    "requests.view", "requests.admin", "requests.implement",
    "documents.view", "documents.manage",
    "notifications.view", "notifications.manage",
    "reports.view", "reports.export", "reports.manage",
    "audit.view",
  ],
  IT_SUPPORT: [
    "organization.view", "people.view",
    "applications.view", "applications.assignments.manage", "applications.credentials.deliver",
    "licenses.view", "licenses.assignments.manage",
    "assets.view", "assets.assignments.manage", "assets.maintenance.manage",
    "contracts.view", "forms.view", "workflows.view",
    "requests.view", "requests.implement",
    "documents.view", "documents.manage",
    "notifications.view", "reports.view",
  ],
  READ_ONLY: [
    "organization.view", "people.view", "applications.view", "licenses.view",
    "assets.view", "contracts.view", "forms.view", "workflows.view",
    "requests.view", "documents.view", "notifications.view", "reports.view", "audit.view",
  ],
};

const ALL_PERMISSIONS = [
  "organization.view", "organization.manage", "organization.company.manage", "organization.approvalRoles.manage",
  "people.view", "people.manage", "people.transfer", "people.accounts.manage",
  "applications.view", "applications.manage", "applications.assignments.manage", "applications.credentials.deliver",
  "licenses.view", "licenses.manage", "licenses.assignments.manage",
  "assets.view", "assets.manage", "assets.assignments.manage", "assets.maintenance.manage", "assets.disposal.manage",
  "contracts.view", "contracts.manage",
  "forms.view", "forms.manage",
  "workflows.view", "workflows.manage", "workflows.admin",
  "requests.view", "requests.admin", "requests.implement",
  "documents.view", "documents.manage",
  "notifications.view", "notifications.manage",
  "reports.view", "reports.export", "reports.manage",
  "audit.view", "audit.export",
  "settings.view", "settings.manage", "settings.security.manage", "settings.backup.manage",
];

async function main(): Promise<void> {
  console.log("[seed] Seeding system roles and permissions...");
  for (const role of SYSTEM_ROLES) {
    const created = await prisma.systemRole.upsert({
      where: { key: role.key },
      create: { key: role.key, name: role.name, description: role.description, isSystem: true },
      update: { name: role.name, description: role.description },
    });
    const permissions =
      DEFAULT_ROLE_PERMISSIONS[role.key]?.[0] === "*"
        ? ALL_PERMISSIONS
        : (DEFAULT_ROLE_PERMISSIONS[role.key] ?? []);
    for (const permission of permissions) {
      await prisma.rolePermission.upsert({
        where: { systemRoleId_permission: { systemRoleId: created.id, permission } },
        create: { systemRoleId: created.id, permission },
        update: {},
      });
    }
  }

  console.log("[seed] Seeding approval roles...");
  for (const role of APPROVAL_ROLES) {
    await prisma.approvalRole.upsert({
      where: { key: role.key },
      create: { key: role.key, name: role.name, description: role.description, isSystem: true },
      update: { name: role.name, description: role.description },
    });
  }

  console.log("[seed] Seeding standard request types for every company...");
  const allCompanies = await prisma.company.findMany({ where: { deletedAt: null } });
  for (const company of allCompanies) {
    await prisma.requestType.upsert({
      where: { companyId_name: { companyId: company.id, name: "Application Access" } },
      create: { companyId: company.id, name: "Application Access", kind: "APPLICATION_ACCESS", description: "Request access to business applications." },
      update: {},
    });
    await prisma.requestType.upsert({
      where: { companyId_name: { companyId: company.id, name: "Asset Request" } },
      create: { companyId: company.id, name: "Asset Request", kind: "ASSET_REQUEST", description: "Request company assets such as laptops and phones." },
      update: {},
    });
    await prisma.requestType.upsert({
      where: { companyId_name: { companyId: company.id, name: "Asset Checkout" } },
      create: { companyId: company.id, name: "Asset Checkout", kind: "ASSET_CHECKOUT", description: "Take equipment you already hold off site for a period of leave." },
      update: {},
    });
    await prisma.requestType.upsert({
      where: { companyId_name: { companyId: company.id, name: "Access Role Change" } },
      create: { companyId: company.id, name: "Access Role Change", kind: "ROLE_CHANGE", description: "Change the role or request fields on access somebody already has." },
      update: {},
    });
  }

  // Deduplicate down to exactly one request type per standard kind per company.
  // Legacy/duplicate rows from earlier builds are repointed and soft-deleted.
  console.log("[seed] Deduplicating request types...");
  const standardKinds: Array<{
    kind: "APPLICATION_ACCESS" | "ASSET_REQUEST" | "ASSET_CHECKOUT" | "ROLE_CHANGE";
    name: string;
  }> = [
    { kind: "APPLICATION_ACCESS", name: "Application Access" },
    { kind: "ASSET_REQUEST", name: "Asset Request" },
    { kind: "ASSET_CHECKOUT", name: "Asset Checkout" },
    { kind: "ROLE_CHANGE", name: "Access Role Change" },
  ];
  for (const company of allCompanies) {
    for (const { kind, name } of standardKinds) {
      const rows = await prisma.requestType.findMany({
        where: { companyId: company.id, kind, deletedAt: null },
        orderBy: { createdAt: "asc" },
      });
      if (rows.length <= 1) continue;
      const keep = rows.find((row) => row.name === name) ?? rows[0]!;
      for (const row of rows) {
        if (row.id === keep.id) continue;
        await prisma.form.updateMany({ where: { requestTypeId: row.id }, data: { requestTypeId: keep.id } });
        await prisma.requestType.update({
          where: { id: row.id },
          data: { deletedAt: new Date(), isActive: false, name: `${row.name} (removed ${row.id.slice(0, 8)})` },
        });
      }
    }
    // Retire request types of any non-standard kind that have no forms attached.
    const legacy = await prisma.requestType.findMany({
      where: {
        companyId: company.id,
        kind: { notIn: ["APPLICATION_ACCESS", "ASSET_REQUEST", "ASSET_CHECKOUT", "ROLE_CHANGE"] },
        deletedAt: null,
      },
      include: { _count: { select: { forms: true } } },
    });
    for (const row of legacy) {
      if (row._count.forms > 0) continue;
      await prisma.requestType.update({
        where: { id: row.id },
        data: { deletedAt: new Date(), isActive: false, name: `${row.name} (removed ${row.id.slice(0, 8)})` },
      });
    }
  }

  console.log("[seed] Seeding default contract categories catalog...");
  for (const category of ["Software", "Hardware Support", "Cloud Services", "Internet", "Telecom", "Maintenance", "Warranty", "Other"]) {
    const existing = await prisma.catalogItem.findFirst({
      where: { kind: "CONTRACT_CATEGORY", name: category, parentId: null },
    });
    if (!existing) {
      await prisma.catalogItem.create({ data: { kind: "CONTRACT_CATEGORY", name: category } });
    }
  }

  console.log("[seed] Seeding notification templates...");
  for (const template of NOTIFICATION_TEMPLATES) {
    await prisma.notificationTemplate.upsert({
      where: { key_version: { key: template.key, version: 1 } },
      create: {
        key: template.key,
        version: 1,
        name: template.name,
        type: template.type,
        subject: template.subject,
        body: template.body,
        variables: template.variables,
      },
      update: {},
    });
  }

  // First-run bootstrap: initial company + System Administrator account.
  const userCount = await prisma.systemUser.count();
  if (userCount === 0) {
    const username = process.env.SEED_ADMIN_USERNAME;
    const email = process.env.SEED_ADMIN_EMAIL;
    const password = process.env.SEED_ADMIN_PASSWORD;
    if (!username || !email || !password) {
      console.warn(
        "[seed] No system users exist and SEED_ADMIN_USERNAME/EMAIL/PASSWORD are not set; skipping administrator bootstrap.",
      );
    } else {
      console.log("[seed] Bootstrapping initial company and System Administrator...");
      const company =
        (await prisma.company.findFirst({ where: { name: "Default Company" } })) ??
        (await prisma.company.create({
          data: {
            name: "Default Company",
            description: "Initial company created at installation. Rename it in Organization settings.",
          },
        }));
      for (const categoryName of DOCUMENT_CATEGORIES) {
        await prisma.documentCategory.upsert({
          where: { companyId_name: { companyId: company.id, name: categoryName } },
          create: { companyId: company.id, name: categoryName, isSystem: true },
          update: {},
        });
      }
      const adminRole = await prisma.systemRole.findUniqueOrThrow({ where: { key: "SYSTEM_ADMINISTRATOR" } });
      const person = await prisma.person.upsert({
        where: { companyId_employeeId: { companyId: company.id, employeeId: "ADMIN-001" } },
        create: {
          companyId: company.id,
          employeeId: "ADMIN-001",
          firstName: "System",
          lastName: "Administrator",
          email,
        },
        update: {},
      });
      await prisma.systemUser.create({
        data: {
          personId: person.id,
          systemRoleId: adminRole.id,
          username,
          passwordHash: await hash(password, { memoryCost: 19456, timeCost: 2, parallelism: 1 }),
          passwordChangedAt: new Date(),
        },
      });
      await prisma.auditEvent.create({
        data: {
          module: "system",
          eventType: "system.bootstrapped",
          action: `Initial installation: created company "${company.name}" and administrator "${username}"`,
          actorLabel: "installer",
          companyId: company.id,
        },
      });
      console.log(`[seed] Administrator "${username}" created. Change the password immediately after first login.`);
    }
  }

  console.log("[seed] Done.");
}

main()
  .catch((error) => {
    console.error("[seed] Failed:", error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
