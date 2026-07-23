import { db } from "@/shared/db";
import { fullName, formatDate, formatDateTime } from "@/shared/utils";
import type { AuthenticatedUser } from "@/shared/auth/session";

/**
 * Standard report definitions (SDS Doc 15 Ch2).
 * Each report executes an optimized query scoped to the requesting user's
 * company (System Administrators see all companies) and returns tabular data
 * used by the report page and exports.
 */

export interface ReportResult {
  headers: string[];
  rows: string[][];
}

export interface ReportDefinition {
  key: string;
  name: string;
  category: string;
  description: string;
  run: (user: AuthenticatedUser) => Promise<ReportResult>;
}

function companyScope(user: AuthenticatedUser): { companyId?: string } {
  return user.systemRoleKey === "SYSTEM_ADMINISTRATOR" ? {} : { companyId: user.companyId };
}

export const STANDARD_REPORTS: ReportDefinition[] = [
  {
    key: "people-by-department",
    name: "Employees by Department",
    category: "People",
    description: "Active employees grouped with company, department, position and portal account status.",
    run: async (user) => {
      const people = await db.person.findMany({
        where: { deletedAt: null, ...companyScope(user) },
        orderBy: [{ company: { name: "asc" } }, { department: { name: "asc" } }, { lastName: "asc" }],
        include: { company: true, department: true, position: true, systemUser: true },
      });
      return {
        headers: ["Employee ID", "Name", "Email", "Company", "Department", "Position", "Status", "Portal account"],
        rows: people.map((person) => [
          person.employeeId,
          fullName(person),
          person.email,
          person.company.name,
          person.department?.name ?? "None",
          person.position?.name ?? "None",
          person.employmentStatus,
          person.systemUser ? person.systemUser.username : "None",
        ]),
      };
    },
  },
  {
    key: "people-without-accounts",
    name: "Employees without Portal Accounts",
    category: "People",
    description: "Active employees who have no Axivo portal account.",
    run: async (user) => {
      const people = await db.person.findMany({
        where: { deletedAt: null, isActive: true, systemUser: null, ...companyScope(user) },
        orderBy: { lastName: "asc" },
        include: { company: true, department: true },
      });
      return {
        headers: ["Employee ID", "Name", "Email", "Company", "Department"],
        rows: people.map((person) => [
          person.employeeId, fullName(person), person.email, person.company.name, person.department?.name ?? "None",
        ]),
      };
    },
  },
  {
    key: "users-by-application",
    name: "Users by Application",
    category: "Applications",
    description: "Active application assignments with role and username.",
    run: async (user) => {
      const assignments = await db.applicationAssignment.findMany({
        where: {
          deletedAt: null,
          status: { in: ["ACTIVE", "PENDING", "SUSPENDED"] },
          application: { deletedAt: null, ...companyScope(user) },
        },
        orderBy: [{ application: { name: "asc" } }],
        include: { application: { include: { company: true } }, person: true, applicationRole: true },
      });
      return {
        headers: ["Application", "Company", "Employee", "Role", "Username", "Status", "Assigned"],
        rows: assignments.map((assignment) => [
          assignment.application.name,
          assignment.application.company.name,
          fullName(assignment.person),
          assignment.applicationRole?.name ?? "None",
          assignment.username ?? "None",
          assignment.status,
          formatDate(assignment.assignedAt),
        ]),
      };
    },
  },
  {
    key: "pending-implementations",
    name: "Pending Implementations",
    category: "Requests",
    description: "Approved request items waiting for IT implementation.",
    run: async (user) => {
      const items = await db.requestItem.findMany({
        where: { status: "IMPLEMENTATION_PENDING", request: companyScope(user) },
        orderBy: { updatedAt: "asc" },
        include: { request: true, application: true, assetCategory: true },
      });
      return {
        headers: ["Request", "Item", "Requested for", "Submitted", "Waiting since"],
        rows: items.map((item) => [
          item.request.requestNumber,
          item.application?.name ?? item.assetCategory?.name ?? item.description ?? item.itemType,
          `${item.request.requestedForName} (${item.request.requestedForEmail})`,
          formatDateTime(item.request.submittedAt),
          formatDateTime(item.updatedAt),
        ]),
      };
    },
  },
  {
    key: "requests-by-status",
    name: "Requests by Status",
    category: "Requests",
    description: "All requests with per-item counts and current workflow status.",
    run: async (user) => {
      const requests = await db.request.findMany({
        where: companyScope(user),
        orderBy: { submittedAt: "desc" },
        include: { company: true, items: true, form: true },
        take: 2000,
      });
      return {
        headers: ["Request", "Form", "Company", "Requested for", "Items", "Status", "Submitted", "Completed"],
        rows: requests.map((request) => [
          request.requestNumber,
          request.form.name,
          request.company.name,
          request.requestedForName,
          String(request.items.length),
          request.status,
          formatDateTime(request.submittedAt),
          request.completedAt ? formatDateTime(request.completedAt) : "None",
        ]),
      };
    },
  },
  {
    key: "approval-performance",
    name: "Approval Turnaround",
    category: "Workflows",
    description: "Completed approval steps with time from activation to decision.",
    run: async (user) => {
      const steps = await db.workflowStepInstance.findMany({
        where: {
          status: { in: ["APPROVED", "REJECTED"] },
          activatedAt: { not: null },
          completedAt: { not: null },
          workflowInstance: { requestItem: { request: companyScope(user) } },
        },
        orderBy: { completedAt: "desc" },
        take: 2000,
        include: {
          workflowInstance: { include: { requestItem: { include: { request: true } } } },
        },
      });
      return {
        headers: ["Request", "Step", "Outcome", "Activated", "Completed", "Hours to decision"],
        rows: steps.map((step) => {
          const hours =
            step.activatedAt && step.completedAt
              ? ((step.completedAt.getTime() - step.activatedAt.getTime()) / 3_600_000).toFixed(1)
              : "None";
          return [
            step.workflowInstance.requestItem.request.requestNumber,
            step.stepName,
            step.status,
            formatDateTime(step.activatedAt),
            formatDateTime(step.completedAt),
            hours,
          ];
        }),
      };
    },
  },
  {
    key: "license-utilization",
    name: "License Utilization",
    category: "Licenses",
    description: "Purchased vs assigned seats per license with availability.",
    run: async (user) => {
      const licenses = await db.license.findMany({
        where: { deletedAt: null, ...companyScope(user) },
        orderBy: { name: "asc" },
        include: {
          company: true,
          application: true,
          purchases: { where: { deletedAt: null } },
          assignments: { where: { deletedAt: null, status: { in: ["ACTIVE", "PENDING", "SUSPENDED"] } } },
        },
      });
      return {
        headers: ["License", "Application", "Company", "Type", "Status", "Purchased", "Assigned", "Available"],
        rows: licenses.map((license) => {
          const purchased = license.purchases.reduce((sum, purchase) => sum + purchase.quantity, 0);
          const assigned = license.assignments.length;
          return [
            license.name,
            license.application?.name ?? "Standalone",
            license.company.name,
            license.licenseType,
            license.status,
            String(purchased),
            String(assigned),
            String(purchased - assigned),
          ];
        }),
      };
    },
  },
  {
    key: "expiring-licenses",
    name: "Expiring Licenses (90 days)",
    category: "Licenses",
    description: "Subscription licenses with purchase windows expiring within 90 days.",
    run: async (user) => {
      const soon = new Date(Date.now() + 90 * 86_400_000);
      const purchases = await db.licensePurchase.findMany({
        where: {
          deletedAt: null,
          expiryDate: { not: null, lte: soon, gte: new Date() },
          license: { deletedAt: null, ...companyScope(user) },
        },
        orderBy: { expiryDate: "asc" },
        include: { license: { include: { company: true, application: true } } },
      });
      return {
        headers: ["License", "Application", "Company", "Quantity", "Expires", "Supplier"],
        rows: purchases.map((purchase) => [
          purchase.license.name,
          purchase.license.application?.name ?? "Standalone",
          purchase.license.company.name,
          String(purchase.quantity),
          formatDate(purchase.expiryDate),
          purchase.supplier ?? "None",
        ]),
      };
    },
  },
  {
    key: "assets-by-status",
    name: "Assets by Status",
    category: "Assets",
    description: "Full asset register with category, holder and status.",
    run: async (user) => {
      const assets = await db.asset.findMany({
        where: { deletedAt: null, ...companyScope(user) },
        orderBy: [{ status: "asc" }, { assetTag: "asc" }],
        include: {
          company: true,
          category: true,
          assignments: {
            where: { status: "ASSIGNED", deletedAt: null },
            include: { person: true },
            take: 1,
          },
        },
        take: 5000,
      });
      return {
        headers: ["Asset", "Category", "Company", "Manufacturer/model", "Serial", "Status", "Assigned to", "Warranty"],
        rows: assets.map((asset) => [
          asset.name || (asset.assetTag ?? "None"),
          asset.category.name,
          asset.company.name,
          [asset.manufacturer, asset.model].filter(Boolean).join(" ") || "None",
          asset.serialNumber ?? "None",
          asset.status,
          asset.assignments[0] ? fullName(asset.assignments[0].person) : "None",
          asset.warrantyExpiry ? formatDate(asset.warrantyExpiry) : "None",
        ]),
      };
    },
  },
  {
    key: "warranty-expiry",
    name: "Warranty Expiry (180 days)",
    category: "Assets",
    description: "Assets whose warranty expires within 180 days.",
    run: async (user) => {
      const soon = new Date(Date.now() + 180 * 86_400_000);
      const assets = await db.asset.findMany({
        where: {
          deletedAt: null,
          warrantyExpiry: { not: null, lte: soon, gte: new Date() },
          ...companyScope(user),
        },
        orderBy: { warrantyExpiry: "asc" },
        include: { company: true, category: true },
      });
      return {
        headers: ["Asset", "Category", "Company", "Model", "Warranty expires"],
        rows: assets.map((asset) => [
          asset.name || (asset.assetTag ?? "None"),
          asset.category.name,
          asset.company.name,
          asset.model ?? "None",
          formatDate(asset.warrantyExpiry),
        ]),
      };
    },
  },
  {
    key: "expiring-contracts",
    name: "Expiring Contracts (90 days)",
    category: "Contracts",
    description: "Contracts ending or renewing within 90 days.",
    run: async (user) => {
      const soon = new Date(Date.now() + 90 * 86_400_000);
      const contracts = await db.contract.findMany({
        where: {
          deletedAt: null,
          ...companyScope(user),
          status: { notIn: ["TERMINATED"] },
          OR: [
            { endDate: { not: null, lte: soon, gte: new Date() } },
            { renewalDate: { not: null, lte: soon, gte: new Date() } },
          ],
        },
        orderBy: { endDate: "asc" },
        include: { company: true, owner: true },
      });
      return {
        headers: ["Contract", "Name", "Vendor", "Company", "End date", "Renewal date", "Cost", "Owner"],
        rows: contracts.map((contract) => [
          contract.contractNumber ?? "None",
          contract.name,
          contract.vendor,
          contract.company.name,
          contract.endDate ? formatDate(contract.endDate) : "None",
          contract.renewalDate ? formatDate(contract.renewalDate) : "None",
          contract.cost ? `${Number(contract.cost).toLocaleString()} ${contract.currency ?? ""}` : "None",
          contract.owner ? fullName(contract.owner) : "None",
        ]),
      };
    },
  },
  {
    key: "contract-cost-summary",
    name: "Contract Cost Summary",
    category: "Contracts",
    description: "Active contract costs grouped by vendor.",
    run: async (user) => {
      const contracts = await db.contract.findMany({
        where: { deletedAt: null, status: { in: ["ACTIVE", "EXPIRING", "RENEWED"] }, ...companyScope(user) },
        include: { company: true },
      });
      const byVendor = new Map<string, { count: number; total: number; currency: string }>();
      for (const contract of contracts) {
        const entry = byVendor.get(contract.vendor) ?? { count: 0, total: 0, currency: contract.currency ?? "" };
        entry.count += 1;
        entry.total += contract.cost ? Number(contract.cost) : 0;
        byVendor.set(contract.vendor, entry);
      }
      return {
        headers: ["Vendor", "Active contracts", "Total cost"],
        rows: Array.from(byVendor.entries())
          .sort((a, b) => b[1].total - a[1].total)
          .map(([vendor, entry]) => [vendor, String(entry.count), `${entry.total.toLocaleString()} ${entry.currency}`]),
      };
    },
  },
  {
    key: "credential-deliveries",
    name: "Credential Deliveries",
    category: "Applications",
    description: "Credential delivery history with acknowledgement status.",
    run: async (user) => {
      const deliveries = await db.credentialDelivery.findMany({
        where: { person: companyScope(user) },
        orderBy: { createdAt: "desc" },
        take: 2000,
        include: { person: true, application: true },
      });
      return {
        headers: ["Employee", "Application", "Username", "Status", "Sent", "Acknowledged"],
        rows: deliveries.map((delivery) => [
          fullName(delivery.person),
          delivery.application.name,
          delivery.username,
          delivery.status,
          delivery.sentAt ? formatDateTime(delivery.sentAt) : "None",
          delivery.acknowledgedAt ? formatDateTime(delivery.acknowledgedAt) : "None",
        ]),
      };
    },
  },
  {
    key: "notification-volume",
    name: "Notification Delivery Summary",
    category: "Notifications",
    description: "Notification counts by event type and delivery status.",
    run: async (user) => {
      const groups = await db.notification.groupBy({
        by: ["eventType", "status"],
        _count: true,
        where:
          user.systemRoleKey === "SYSTEM_ADMINISTRATOR"
            ? {}
            : { OR: [{ companyId: user.companyId }, { companyId: null }] },
      });
      return {
        headers: ["Event type", "Status", "Count"],
        rows: groups
          .sort((a, b) => a.eventType.localeCompare(b.eventType))
          .map((group) => [group.eventType, group.status, String(group._count)]),
      };
    },
  },
];

export function getReport(key: string): ReportDefinition | undefined {
  return STANDARD_REPORTS.find((report) => report.key === key);
}
