import { db } from "@/shared/db";
import { fullName, formatDate, formatDateTime } from "@/shared/utils";
import type { AuthenticatedUser } from "@/shared/auth/session";
import type { AuditContext } from "@/shared/audit/audit";
import { buildRequestEvidencePdf } from "@/modules/requests/evidence-pdf";
import { leaveTypeLabel } from "@/modules/assets/checkouts";
import { getDocumentFileForUser } from "@/modules/documents/service";

/**
 * Standard report definitions (SDS Doc 15 Ch2).
 * Each report executes an optimized query scoped to the requesting user's
 * company (System Administrators see all companies) and returns tabular data
 * used by the report page and exports.
 */

export interface ReportResult {
  headers: string[];
  rows: string[][];
  /** Optional per-row link (e.g. a request PDF), aligned to `rows`. */
  rowLinks?: (string | null)[];
  /**
   * Identifier of the document behind each row, aligned to `rows`. Rows that
   * carry one can be ticked and downloaded together as a ZIP via `bundle`.
   */
  rowIds?: (string | null)[];
}

export interface ReportFilter {
  key: string;
  label: string;
  options: { value: string; label: string }[];
}

/** Applied filter values, keyed by ReportFilter.key. */
export type ReportFilters = Record<string, string | undefined>;

export interface ReportDefinition {
  key: string;
  name: string;
  category: string;
  description: string;
  /** Filter controls this report offers, resolved live for the current user. */
  filters?: (user: AuthenticatedUser) => Promise<ReportFilter[]>;
  /** Placeholder for a free-text search box; omitted when the report has none. */
  searchPlaceholder?: string;
  /**
   * Header of the column holding the company, so every report can offer the
   * same company filter without each one re-implementing it. Omit when the
   * report has no company dimension.
   */
  companyColumn?: string;
  /** Header of the column the date-range filter applies to. */
  dateColumn?: string;
  run: (user: AuthenticatedUser, filters?: ReportFilters) => Promise<ReportResult>;
  /** Build one PDF per selected `rowIds` entry, for the bulk ZIP download. */
  bundle?: (
    user: AuthenticatedUser,
    context: AuditContext,
    ids: string[],
  ) => Promise<{ fileName: string; data: Buffer }[]>;
}

/** A report's rows after the shared filters and paging have been applied. */
export interface ReportView extends ReportResult {
  /** Rows matching the filters, before paging: what an export should contain. */
  filteredRows: string[][];
  filteredRowLinks?: (string | null)[];
  filteredRowIds?: (string | null)[];
  /** Distinct values found in the company column, for the filter control. */
  companyOptions: string[];
  total: number;
  page: number;
  pageCount: number;
}

/**
 * Apply the filters every report shares - company, date range, free text - and
 * then page the result.
 *
 * Deliberately generic and applied after the query rather than inside each of
 * the seventeen reports: one implementation means the controls behave
 * identically everywhere and cannot drift apart. The reports already load their
 * full result set, so this adds no extra database cost; if one ever grows large
 * enough to matter, that report should gain a real indexed filter of its own
 * rather than this being made cleverer.
 */
export function buildReportView(
  definition: ReportDefinition,
  result: ReportResult,
  filters: ReportFilters,
  page: number,
  pageSize: number,
): ReportView {
  const companyIndex = definition.companyColumn
    ? result.headers.indexOf(definition.companyColumn)
    : -1;
  const dateIndex = definition.dateColumn ? result.headers.indexOf(definition.dateColumn) : -1;

  const companyOptions =
    companyIndex >= 0
      ? Array.from(new Set(result.rows.map((row) => row[companyIndex] ?? "").filter(Boolean))).sort()
      : [];

  const term = filters.q?.trim().toLowerCase();
  const from = filters.from ? new Date(filters.from) : null;
  const to = filters.to ? new Date(`${filters.to}T23:59:59`) : null;

  // Filter by index so the per-row links and ids stay aligned with their rows.
  const keptIndexes: number[] = [];
  result.rows.forEach((row, index) => {
    if (filters.company && companyIndex >= 0 && row[companyIndex] !== filters.company) return;
    if ((from || to) && dateIndex >= 0) {
      const raw = row[dateIndex];
      const value = raw && raw !== "None" && raw !== "-" ? new Date(raw) : null;
      // A row with no date cannot satisfy a date range, so it drops out.
      if (!value || Number.isNaN(value.getTime())) return;
      if (from && value < from) return;
      if (to && value > to) return;
    }
    if (term && !row.some((cell) => cell.toLowerCase().includes(term))) return;
    keptIndexes.push(index);
  });

  const filteredRows = keptIndexes.map((index) => result.rows[index]!);
  const filteredRowLinks = result.rowLinks
    ? keptIndexes.map((index) => result.rowLinks![index] ?? null)
    : undefined;
  const filteredRowIds = result.rowIds
    ? keptIndexes.map((index) => result.rowIds![index] ?? null)
    : undefined;

  const total = filteredRows.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, page), pageCount);
  const start = (safePage - 1) * pageSize;
  const slice = keptIndexes.slice(start, start + pageSize);

  return {
    headers: result.headers,
    rows: slice.map((index) => result.rows[index]!),
    rowLinks: result.rowLinks ? slice.map((index) => result.rowLinks![index] ?? null) : undefined,
    rowIds: result.rowIds ? slice.map((index) => result.rowIds![index] ?? null) : undefined,
    filteredRows,
    filteredRowLinks,
    filteredRowIds,
    companyOptions,
    total,
    page: safePage,
    pageCount,
  };
}

/** Free-text search term, trimmed; undefined when the box is empty. */
export function searchTerm(filters?: ReportFilters): string | undefined {
  const value = filters?.q?.trim();
  return value ? value : undefined;
}

/**
 * Turn a stored enum into something a person reads: IMPLEMENTATION_PENDING
 * becomes "Implementation pending". Reports are read on screen and handed to
 * auditors as spreadsheets, so raw constants have no place in either.
 */
export function readableEnum(value: string): string {
  if (!value) return value;
  const words = value.toLowerCase().split("_");
  return words
    .map((word, index) => (index === 0 ? word.charAt(0).toUpperCase() + word.slice(1) : word))
    .join(" ");
}

function companyScope(user: AuthenticatedUser): { companyId?: string } {
  return user.systemRoleKey === "SYSTEM_ADMINISTRATOR" ? {} : { companyId: user.companyId };
}

/** Company options for a report filter, empty for a single-company user. */
async function companyFilterOptions(user: AuthenticatedUser): Promise<{ value: string; label: string }[]> {
  if (user.systemRoleKey !== "SYSTEM_ADMINISTRATOR") return [];
  const companies = await db.company.findMany({
    where: { deletedAt: null, isActive: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
  return companies.map((company) => ({ value: company.id, label: company.name }));
}

export const STANDARD_REPORTS: ReportDefinition[] = [
  {
    key: "requests-by-application",
    name: "Access Requests by Application",
    category: "Audit evidence",
    description:
      "Every application access request with its approvers and outcome. Filter by application, status or department, then download each request as a PDF to hand an auditor the sample they ask for.",
    dateColumn: "Submitted",
    filters: async (user) => {
      const [applications, departments] = await Promise.all([
        db.application.findMany({
          where: { deletedAt: null, ...companyScope(user) },
          orderBy: { name: "asc" },
          select: { id: true, name: true },
        }),
        db.department.findMany({
          where: { deletedAt: null, ...companyScope(user) },
          orderBy: { name: "asc" },
          select: { id: true, name: true },
        }),
      ]);
      return [
        {
          key: "applicationId",
          label: "Application",
          options: applications.map((application) => ({ value: application.id, label: application.name })),
        },
        {
          key: "status",
          label: "Status",
          options: [
            "PENDING_APPROVAL",
            "IMPLEMENTATION_PENDING",
            "IMPLEMENTED",
            "COMPLETED",
            "REJECTED",
            "CANCELLED",
          ].map((status) => ({ value: status, label: readableEnum(status) })),
        },
        {
          key: "departmentName",
          label: "Department",
          options: departments.map((department) => ({ value: department.name, label: department.name })),
        },
      ];
    },
    searchPlaceholder: "Employee name, employee ID or request number",
    run: async (user, filters) => {
      const term = searchTerm(filters);
      const items = await db.requestItem.findMany({
        where: {
          itemType: "APPLICATION",
          ...(filters?.applicationId ? { applicationId: filters.applicationId } : {}),
          ...(filters?.status ? { status: filters.status as never } : {}),
          request: {
            ...companyScope(user),
            ...(filters?.departmentName ? { requestedForDepartment: filters.departmentName } : {}),
            ...(term
              ? {
                  OR: [
                    { requestedForName: { contains: term, mode: "insensitive" as const } },
                    { requestedForEmployeeId: { contains: term, mode: "insensitive" as const } },
                    { requestNumber: { contains: term, mode: "insensitive" as const } },
                  ],
                }
              : {}),
          },
        },
        orderBy: { request: { submittedAt: "desc" } },
        include: {
          application: { select: { name: true } },
          applicationRole: { select: { name: true } },
          request: true,
          workflowInstances: {
            include: {
              stepInstances: {
                orderBy: { stepOrder: "asc" },
                include: { actions: { include: { person: true }, orderBy: { createdAt: "asc" } } },
              },
            },
          },
        },
      });
      return {
        headers: [
          "Request",
          "Application",
          "Role",
          "Requested for",
          "Employee ID",
          "Department",
          "Requested by",
          "Submitted",
          "Status",
          "Approvals",
          "Completed",
        ],
        // Each row links to that request's evidence PDF.
        rowLinks: items.map((item) => `/api/requests/${item.requestId}/pdf`),
        rowIds: items.map((item) => item.requestId),
        rows: items.map((item) => {
          // Names come from the snapshot when the live record is gone.
          const application = item.application?.name ?? item.targetNameSnapshot ?? "Removed";
          const role = item.applicationRole?.name ?? item.roleNameSnapshot ?? "None";
          const approvals = item.workflowInstances
            .flatMap((instance) => instance.stepInstances)
            .flatMap((step) =>
              step.actions.map(
                (action) =>
                  `${action.person.firstName} ${action.person.lastName}: ${action.action} (${formatDate(action.createdAt)})`,
              ),
            )
            .join(" | ");
          return [
            item.request.requestNumber,
            application,
            role,
            item.request.requestedForName,
            item.request.requestedForEmployeeId ?? "None",
            item.request.requestedForDepartment ?? "None",
            item.request.requesterName,
            formatDate(item.request.submittedAt),
            readableEnum(item.status),
            approvals || "None",
            item.implementedAt ? formatDate(item.implementedAt) : "None",
          ];
        }),
      };
    },
    bundle: async (user, _context, ids) => {
      const files = [];
      for (const id of ids) {
        const pdf = await buildRequestEvidencePdf(user, id);
        if (pdf) files.push(pdf);
      }
      return files;
    },
  },
  {
    key: "clearances",
    name: "Employee Clearances",
    category: "Audit evidence",
    description: "Completed employee clearances with what was recovered and who verified it. Cancelled and in-progress clearances are excluded.",
    companyColumn: "Company",
    dateColumn: "Completed",
    filters: async (user) => {
      const [companies, departments] = await Promise.all([
        db.company.findMany({
          where: {
            deletedAt: null,
            ...(user.systemRoleKey === "SYSTEM_ADMINISTRATOR" ? {} : { id: user.companyId }),
          },
          orderBy: { name: "asc" },
          select: { id: true, name: true },
        }),
        db.department.findMany({
          where: { deletedAt: null, ...companyScope(user) },
          orderBy: { name: "asc" },
          select: { id: true, name: true },
        }),
      ]);
      return [
        {
          key: "companyId",
          label: "Company",
          options: companies.map((company) => ({ value: company.id, label: company.name })),
        },
        {
          key: "departmentId",
          label: "Department",
          options: departments.map((department) => ({ value: department.id, label: department.name })),
        },
      ];
    },
    searchPlaceholder: "Employee name or employee ID",
    run: async (user, filters) => {
      const term = searchTerm(filters);
      const clearances = await db.clearance.findMany({
        // Only completed clearances are audit evidence; cancelled and
        // in-progress records are not kept here.
        where: {
          ...companyScope(user),
          status: "COMPLETED",
          ...(filters?.companyId ? { companyId: filters.companyId } : {}),
          ...(filters?.departmentId || term
            ? {
                person: {
                  ...(filters?.departmentId ? { departmentId: filters.departmentId } : {}),
                  ...(term
                    ? {
                        OR: [
                          { firstName: { contains: term, mode: "insensitive" as const } },
                          { lastName: { contains: term, mode: "insensitive" as const } },
                          { employeeId: { contains: term, mode: "insensitive" as const } },
                        ],
                      }
                    : {}),
                },
              }
            : {}),
        },
        orderBy: { completedAt: "desc" },
        include: {
          person: { include: { company: true, department: true } },
          items: true,
        },
      });
      return {
        headers: [
          "Employee",
          "Employee ID",
          "Company",
          "Department",
          "Started",
          "Completed",
          "Status",
          "Items",
          "Outstanding",
        ],
        // The completed clearance form is filed as a document on the employee.
        rowLinks: clearances.map((clearance) =>
          clearance.documentId ? `/api/documents/${clearance.documentId}/download` : null,
        ),
        rowIds: clearances.map((clearance) => clearance.documentId),
        rows: clearances.map((clearance) => {
          const outstanding = clearance.items.filter((item) => item.status !== "RECEIVED").length;
          return [
            fullName(clearance.person),
            clearance.person.employeeId,
            clearance.person.company.name,
            clearance.person.department?.name ?? "None",
            formatDate(clearance.createdAt),
            clearance.completedAt ? formatDate(clearance.completedAt) : "None",
            readableEnum(clearance.status),
            String(clearance.items.length),
            outstanding > 0 ? String(outstanding) : "None",
          ];
        }),
      };
    },
    bundle: async (user, context, ids) => {
      const files = [];
      for (const id of ids) {
        // Clearance forms are stored documents rather than rendered on demand.
        const file = await getDocumentFileForUser(user, context, id);
        files.push({ fileName: file.version.fileName, data: file.content });
      }
      return files;
    },
  },
  {
    key: "role-changes",
    name: "Access Role Changes",
    category: "Audit evidence",
    description:
      "Every change to access somebody already had: what the role and request fields were, what they became, and the approval filed for it.",
    companyColumn: "Company",
    dateColumn: "Changed",
    searchPlaceholder: "Employee, application or role",
    filters: async (user) => {
      const applications = await db.application.findMany({
        where: { deletedAt: null, ...companyScope(user) },
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      });
      return [
        {
          key: "applicationId",
          label: "Application",
          options: applications.map((application) => ({ value: application.id, label: application.name })),
        },
      ];
    },
    run: async (user, filters) => {
      const changes = await db.assignmentChange.findMany({
        where: {
          ...companyScope(user),
          ...(filters?.applicationId
            ? { applicationAssignment: { applicationId: filters.applicationId } }
            : {}),
        },
        orderBy: { changedAt: "desc" },
        include: {
          applicationAssignment: {
            include: {
              application: { select: { name: true } },
              person: { include: { company: true, department: true } },
            },
          },
          // A change raised through a form has no separate proof document; the
          // approved request itself is the evidence, so pull its id.
          requestItem: { select: { requestId: true } },
        },
      });

      /** Render request-field answers as "Label: a, b" for side-by-side reading. */
      const describe = (data: unknown): string => {
        const record = (data as Record<string, unknown> | null) ?? {};
        const parts = Object.entries(record)
          .filter(([, value]) => value !== null && value !== "" && !(Array.isArray(value) && value.length === 0))
          .map(([key, value]) =>
            `${key.replace(/_/g, " ")}: ${Array.isArray(value) ? value.join(", ") : String(value)}`,
          );
        return parts.length > 0 ? parts.join(" | ") : "None";
      };

      return {
        headers: [
          "Employee",
          "Employee ID",
          "Company",
          "Application",
          "Role before",
          "Role after",
          "Fields before",
          "Fields after",
          "Reason",
          "Changed by",
          "Changed",
        ],
        // The filed approval, so an auditor can open the evidence from the row.
        // An inline edit has a proof document; a change made through a form has
        // the approved request itself, whose evidence PDF is rendered on demand.
        rowLinks: changes.map((change) =>
          change.proofDocumentId
            ? `/api/documents/${change.proofDocumentId}/download`
            : change.requestItem
              ? `/api/requests/${change.requestItem.requestId}/pdf`
              : null,
        ),
        rowIds: changes.map((change) =>
          change.proofDocumentId
            ? `doc:${change.proofDocumentId}`
            : change.requestItem
              ? `req:${change.requestItem.requestId}`
              : null,
        ),
        rows: changes.map((change) => [
          fullName(change.applicationAssignment.person),
          change.applicationAssignment.person.employeeId,
          change.applicationAssignment.person.company.name,
          change.applicationAssignment.application.name,
          change.previousRoleName ?? "None",
          change.newRoleName ?? "None",
          describe(change.previousFieldData),
          describe(change.newFieldData),
          change.reason ?? "None",
          change.changedByLabel ?? "System",
          formatDate(change.changedAt),
        ]),
      };
    },
    bundle: async (user, context, ids) => {
      const files = [];
      for (const id of ids) {
        if (id.startsWith("req:")) {
          const pdf = await buildRequestEvidencePdf(user, id.slice(4));
          if (pdf) files.push({ fileName: pdf.fileName, data: pdf.data });
        } else {
          // Both a bare id (older links) and a "doc:" prefixed one are a document.
          const documentId = id.startsWith("doc:") ? id.slice(4) : id;
          const file = await getDocumentFileForUser(user, context, documentId);
          files.push({ fileName: file.version.fileName, data: file.content });
        }
      }
      return files;
    },
  },
  {
    key: "asset-checkouts",
    name: "Asset Checkouts",
    category: "Audit evidence",
    description:
      "Equipment taken off site for leave, and whether it has come back. Anything still out past its return date is called out so it can be chased.",
    companyColumn: "Company",
    dateColumn: "Until",
    searchPlaceholder: "Employee, asset or serial number",
    run: async (user) => {
      const checkouts = await db.assetCheckout.findMany({
        where: { ...companyScope(user), status: { not: "CANCELLED" } },
        orderBy: [{ status: "asc" }, { endDate: "desc" }],
        include: {
          person: { include: { company: true, department: true } },
          asset: { include: { category: true } },
        },
      });
      const today = new Date();
      return {
        headers: [
          "Employee",
          "Employee ID",
          "Company",
          "Department",
          "Asset",
          "Serial number",
          "Leave",
          "From",
          "Until",
          "Status",
        ],
        // The authorisation PDF, where one was generated.
        rowLinks: checkouts.map((checkout) =>
          checkout.documentId ? `/api/documents/${checkout.documentId}/download` : null,
        ),
        rowIds: checkouts.map((checkout) => checkout.documentId),
        rows: checkouts.map((checkout) => {
          // "Overdue" is a reading of the data, not a stored state: an approved
          // checkout whose return date has passed and which has not been
          // checked in is what somebody needs to chase.
          const overdue =
            checkout.status === "APPROVED" && !checkout.returnedAt && checkout.endDate < today;
          return [
            fullName(checkout.person),
            checkout.person.employeeId,
            checkout.person.company.name,
            checkout.person.department?.name ?? "None",
            [checkout.asset.category?.name, checkout.asset.name].filter(Boolean).join(" · "),
            checkout.asset.serialNumber ?? "None",
            leaveTypeLabel(checkout.leaveType),
            formatDate(checkout.startDate),
            formatDate(checkout.endDate),
            overdue
              ? "Overdue"
              : checkout.returnedAt
                ? `Returned ${formatDate(checkout.returnedAt)}`
                : readableEnum(checkout.status),
          ];
        }),
      };
    },
    bundle: async (user, context, ids) => {
      const files = [];
      for (const id of ids) {
        const file = await getDocumentFileForUser(user, context, id);
        files.push({ fileName: file.version.fileName, data: file.content });
      }
      return files;
    },
  },
  {
    key: "people-by-department",
    name: "Employees by Department",
    category: "People",
    description: "Active employees grouped with company, department, position and portal account status.",
    searchPlaceholder: "Name, employee ID or email",
    filters: async (user) => {
      const [companies, departments] = await Promise.all([
        companyFilterOptions(user),
        db.department.findMany({
          where: { deletedAt: null, isActive: true, ...companyScope(user) },
          orderBy: { name: "asc" },
          select: { id: true, name: true },
        }),
      ]);
      const built: ReportFilter[] = [];
      if (companies.length > 0) built.push({ key: "companyId", label: "Company", options: companies });
      built.push({
        key: "departmentId",
        label: "Department",
        options: departments.map((department) => ({ value: department.id, label: department.name })),
      });
      return built;
    },
    run: async (user, filters) => {
      const people = await db.person.findMany({
        where: {
          deletedAt: null,
          ...companyScope(user),
          ...(filters?.companyId ? { companyId: filters.companyId } : {}),
          ...(filters?.departmentId ? { departmentId: filters.departmentId } : {}),
        },
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
          readableEnum(person.employmentStatus),
          person.systemUser ? person.systemUser.username : "None",
        ]),
      };
    },
  },
  {
    key: "people-with-accounts",
    name: "Employees with Portal Accounts",
    category: "People",
    description: "Employees who hold an Axivo portal account, with their role and whether it is enabled. Most staff have none; this is the short list that does.",
    searchPlaceholder: "Name, employee ID or username",
    filters: async (user) => {
      const companies = await companyFilterOptions(user);
      return companies.length > 0
        ? [{ key: "companyId", label: "Company", options: companies }]
        : [];
    },
    run: async (user, filters) => {
      const people = await db.person.findMany({
        where: {
          deletedAt: null,
          systemUser: { isNot: null },
          ...companyScope(user),
          ...(filters?.companyId ? { companyId: filters.companyId } : {}),
        },
        orderBy: { lastName: "asc" },
        include: { company: true, department: true, systemUser: { include: { systemRole: true } } },
      });
      return {
        headers: ["Employee ID", "Name", "Company", "Department", "Username", "Role", "Account", "Last login"],
        rows: people.map((person) => [
          person.employeeId,
          fullName(person),
          person.company.name,
          person.department?.name ?? "None",
          person.systemUser?.username ?? "None",
          person.systemUser?.systemRole.name ?? "None",
          person.systemUser ? (person.systemUser.isEnabled ? "Enabled" : "Disabled") : "None",
          person.systemUser?.lastLoginAt ? formatDate(person.systemUser.lastLoginAt) : "Never",
        ]),
      };
    },
  },
  {
    key: "users-by-application",
    name: "Users by Application",
    category: "Applications",
    description: "Active application assignments with role and username.",
    searchPlaceholder: "Employee, username or role",
    filters: async (user) => {
      const [companies, applications] = await Promise.all([
        companyFilterOptions(user),
        db.application.findMany({
          where: { deletedAt: null, ...companyScope(user) },
          orderBy: { name: "asc" },
          select: { id: true, name: true },
        }),
      ]);
      const built: ReportFilter[] = [];
      if (companies.length > 0) built.push({ key: "companyId", label: "Company", options: companies });
      built.push({
        key: "applicationId",
        label: "Application",
        options: applications.map((application) => ({ value: application.id, label: application.name })),
      });
      return built;
    },
    run: async (user, filters) => {
      const assignments = await db.applicationAssignment.findMany({
        where: {
          deletedAt: null,
          status: { in: ["ACTIVE", "PENDING", "SUSPENDED"] },
          ...(filters?.applicationId ? { applicationId: filters.applicationId } : {}),
          application: {
            deletedAt: null,
            ...companyScope(user),
            ...(filters?.companyId ? { companyId: filters.companyId } : {}),
          },
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
          readableEnum(assignment.status),
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
    dateColumn: "Submitted",
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
    dateColumn: "Submitted",
    searchPlaceholder: "Request number or requested-for name",
    filters: async (user) => {
      const [companies, forms] = await Promise.all([
        companyFilterOptions(user),
        db.form.findMany({
          where: { deletedAt: null, ...companyScope(user) },
          orderBy: { name: "asc" },
          select: { id: true, name: true },
        }),
      ]);
      const built: ReportFilter[] = [];
      if (companies.length > 0) built.push({ key: "companyId", label: "Company", options: companies });
      built.push({
        key: "formId",
        label: "Form",
        options: forms.map((form) => ({ value: form.id, label: form.name })),
      });
      return built;
    },
    run: async (user, filters) => {
      const requests = await db.request.findMany({
        where: {
          ...companyScope(user),
          ...(filters?.companyId ? { companyId: filters.companyId } : {}),
          ...(filters?.formId ? { formId: filters.formId } : {}),
        },
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
          readableEnum(request.status),
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
            readableEnum(step.status),
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
    companyColumn: "Company",
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
            readableEnum(license.status),
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
    companyColumn: "Company",
    dateColumn: "Expires",
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
    searchPlaceholder: "Asset, serial or holder",
    filters: async (user) => {
      const [companies, categories] = await Promise.all([
        companyFilterOptions(user),
        db.assetCategory.findMany({
          where: { deletedAt: null, isActive: true },
          orderBy: { name: "asc" },
          select: { id: true, name: true },
        }),
      ]);
      const built: ReportFilter[] = [];
      if (companies.length > 0) built.push({ key: "companyId", label: "Company", options: companies });
      built.push({
        key: "categoryId",
        label: "Category",
        options: categories.map((category) => ({ value: category.id, label: category.name })),
      });
      return built;
    },
    run: async (user, filters) => {
      const assets = await db.asset.findMany({
        where: {
          deletedAt: null,
          ...companyScope(user),
          ...(filters?.companyId ? { companyId: filters.companyId } : {}),
          ...(filters?.categoryId ? { categoryId: filters.categoryId } : {}),
        },
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
          readableEnum(asset.status),
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
    companyColumn: "Company",
    dateColumn: "Warranty expires",
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
    dateColumn: "End date",
    searchPlaceholder: "Contract, name or vendor",
    filters: async (user) => {
      const companies = await companyFilterOptions(user);
      return companies.length > 0
        ? [{ key: "companyId", label: "Company", options: companies }]
        : [];
    },
    run: async (user, filters) => {
      const soon = new Date(Date.now() + 90 * 86_400_000);
      const contracts = await db.contract.findMany({
        where: {
          deletedAt: null,
          ...companyScope(user),
          ...(filters?.companyId ? { companyId: filters.companyId } : {}),
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
    dateColumn: "Sent",
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
          readableEnum(delivery.status),
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
          .map((group) => [readableEnum(group.eventType), readableEnum(group.status), String(group._count)]),
      };
    },
  },
];

export function getReport(key: string): ReportDefinition | undefined {
  return STANDARD_REPORTS.find((report) => report.key === key);
}
