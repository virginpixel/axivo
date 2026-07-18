/**
 * RBAC permission catalog (SDS Doc 00 §7, Doc 05 Ch3).
 * Permissions are assigned to System Roles only; users receive permissions
 * exclusively through their role. Deny by default.
 */

export const PERMISSIONS = {
  // Organization
  "organization.view": "View organization structure",
  "organization.manage": "Create and edit companies, departments, locations, positions",
  "organization.company.manage": "Create, edit and disable companies",
  "organization.approvalRoles.manage": "Manage approval roles and assignments",

  // People
  "people.view": "View people records",
  "people.manage": "Create and edit people records",
  "people.transfer": "Transfer people between companies",
  "people.accounts.manage": "Manage system user accounts",

  // Applications
  "applications.view": "View applications",
  "applications.manage": "Manage application definitions, roles and credential fields",
  "applications.assignments.manage": "Manage application assignments",
  "applications.credentials.deliver": "Prepare, send and resend credential deliveries",

  // Licenses
  "licenses.view": "View licenses",
  "licenses.manage": "Manage license definitions, purchases and renewals",
  "licenses.assignments.manage": "Assign and remove licenses",

  // Assets
  "assets.view": "View assets",
  "assets.manage": "Manage asset records and categories",
  "assets.assignments.manage": "Assign, return, hand over and clear assets",
  "assets.maintenance.manage": "Manage maintenance records",
  "assets.disposal.manage": "Dispose and retire assets",

  // Contracts
  "contracts.view": "View contracts",
  "contracts.manage": "Manage contracts and renewals",

  // Forms
  "forms.view": "View forms",
  "forms.manage": "Create, edit, publish and archive forms",

  // Workflows
  "workflows.view": "View workflow definitions and instances",
  "workflows.manage": "Manage workflow definitions",
  "workflows.admin": "Administer running workflows (cancel, resend, reassign)",

  // Requests
  "requests.view": "View requests",
  "requests.admin": "Administer requests (cancel, resend notifications)",
  "requests.implement": "Complete IT implementation tasks",

  // Documents
  "documents.view": "View and download documents",
  "documents.manage": "Upload documents and manage links",

  // Notifications
  "notifications.view": "View notification history",
  "notifications.manage": "Manage templates, resend and cancel notifications",

  // Reports
  "reports.view": "View reports and dashboards",
  "reports.export": "Export reports",
  "reports.manage": "Create and share custom reports",

  // Audit
  "audit.view": "View audit and activity logs",
  "audit.export": "Export audit logs",

  // Settings
  "settings.view": "View system settings",
  "settings.manage": "Manage system settings, SMTP, branding, feature toggles",
  "settings.security.manage": "Manage security policies, sessions and tokens",
  "settings.backup.manage": "Manage backups and restores",
} as const;

export type Permission = keyof typeof PERMISSIONS;

export const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as Permission[];

/** Default role → permission matrix (SDS Docs 06-17 permission sections). */
export const DEFAULT_ROLE_PERMISSIONS: Record<string, Permission[]> = {
  SYSTEM_ADMINISTRATOR: ALL_PERMISSIONS,
  IT_ADMINISTRATOR: [
    "organization.view",
    "organization.manage",
    "people.view",
    "people.manage",
    "people.accounts.manage",
    "applications.view",
    "applications.manage",
    "applications.assignments.manage",
    "applications.credentials.deliver",
    "licenses.view",
    "licenses.manage",
    "licenses.assignments.manage",
    "assets.view",
    "assets.manage",
    "assets.assignments.manage",
    "assets.maintenance.manage",
    "assets.disposal.manage",
    "contracts.view",
    "contracts.manage",
    "forms.view",
    "forms.manage",
    "workflows.view",
    "workflows.manage",
    "workflows.admin",
    "requests.view",
    "requests.admin",
    "requests.implement",
    "documents.view",
    "documents.manage",
    "notifications.view",
    "notifications.manage",
    "reports.view",
    "reports.export",
    "reports.manage",
    "audit.view",
  ],
  IT_SUPPORT: [
    "organization.view",
    "people.view",
    "applications.view",
    "applications.assignments.manage",
    "applications.credentials.deliver",
    "licenses.view",
    "licenses.assignments.manage",
    "assets.view",
    "assets.assignments.manage",
    "assets.maintenance.manage",
    "contracts.view",
    "forms.view",
    "workflows.view",
    "requests.view",
    "requests.implement",
    "documents.view",
    "documents.manage",
    "notifications.view",
    "reports.view",
  ],
  READ_ONLY: [
    "organization.view",
    "people.view",
    "applications.view",
    "licenses.view",
    "assets.view",
    "contracts.view",
    "forms.view",
    "workflows.view",
    "requests.view",
    "documents.view",
    "notifications.view",
    "reports.view",
    "audit.view",
  ],
};

export const SYSTEM_ROLE_KEYS = {
  SYSTEM_ADMINISTRATOR: "SYSTEM_ADMINISTRATOR",
  IT_ADMINISTRATOR: "IT_ADMINISTRATOR",
  IT_SUPPORT: "IT_SUPPORT",
  READ_ONLY: "READ_ONLY",
} as const;

export const APPROVAL_ROLE_KEYS = {
  DEPARTMENT_HEAD: "DEPARTMENT_HEAD",
  ASSISTANT_DEPARTMENT_HEAD: "ASSISTANT_DEPARTMENT_HEAD",
  HR: "HR",
  GENERAL_MANAGER: "GENERAL_MANAGER",
  IT_APPROVAL: "IT_APPROVAL",
  IT_IMPLEMENTATION: "IT_IMPLEMENTATION",
} as const;
