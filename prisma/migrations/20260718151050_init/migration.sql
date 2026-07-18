-- CreateEnum
CREATE TYPE "EmploymentStatus" AS ENUM ('ACTIVE', 'ON_LEAVE', 'SUSPENDED', 'RESIGNED', 'TERMINATED');

-- CreateEnum
CREATE TYPE "ApprovalRule" AS ENUM ('ANY', 'ALL');

-- CreateEnum
CREATE TYPE "WorkflowStepType" AS ENUM ('APPROVAL', 'IT_APPROVAL', 'IT_IMPLEMENTATION');

-- CreateEnum
CREATE TYPE "WorkflowInstanceStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'WAITING_APPROVAL', 'CORRECTION_REQUESTED', 'APPROVED', 'REJECTED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "StepInstanceStatus" AS ENUM ('PENDING', 'ACTIVE', 'APPROVED', 'REJECTED', 'CORRECTION_REQUESTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ApprovalActionType" AS ENUM ('APPROVED', 'REJECTED', 'CORRECTION_REQUESTED');

-- CreateEnum
CREATE TYPE "RequestStatus" AS ENUM ('SUBMITTED', 'PENDING_APPROVAL', 'CORRECTION_REQUESTED', 'APPROVED', 'IMPLEMENTATION_PENDING', 'COMPLETED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "RequestItemStatus" AS ENUM ('PENDING_APPROVAL', 'CORRECTION_REQUESTED', 'APPROVED', 'IMPLEMENTATION_PENDING', 'IMPLEMENTED', 'COMPLETED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "RequestItemType" AS ENUM ('APPLICATION', 'ASSET', 'ROLE_CHANGE', 'GENERAL');

-- CreateEnum
CREATE TYPE "RequestTypeKind" AS ENUM ('APPLICATION_ACCESS', 'ASSET_REQUEST', 'ASSET_HANDOVER', 'ROLE_CHANGE', 'CLEARANCE', 'GENERAL');

-- CreateEnum
CREATE TYPE "AppAssignmentStatus" AS ENUM ('PENDING', 'ACTIVE', 'SUSPENDED', 'REMOVED');

-- CreateEnum
CREATE TYPE "CredentialFieldType" AS ENUM ('TEXT', 'URL', 'NUMBER', 'EMAIL', 'COMPANY_CODE', 'TENANT_ID', 'API_ENDPOINT', 'NOTES');

-- CreateEnum
CREATE TYPE "CredentialDeliveryStatus" AS ENUM ('PENDING', 'DELIVERED', 'ACKNOWLEDGED', 'EXPIRED', 'REVOKED');

-- CreateEnum
CREATE TYPE "LicenseType" AS ENUM ('SUBSCRIPTION', 'PERPETUAL');

-- CreateEnum
CREATE TYPE "LicenseStatus" AS ENUM ('DRAFT', 'ACTIVE', 'SUSPENDED', 'EXPIRED', 'RETIRED');

-- CreateEnum
CREATE TYPE "LicensePurchaseType" AS ENUM ('NEW_PURCHASE', 'RENEWAL', 'ADDITIONAL_SEATS');

-- CreateEnum
CREATE TYPE "LicenseAssignmentStatus" AS ENUM ('PENDING', 'ACTIVE', 'SUSPENDED', 'REMOVED');

-- CreateEnum
CREATE TYPE "AssetStatus" AS ENUM ('AVAILABLE', 'ASSIGNED', 'UNDER_REPAIR', 'OUT_OF_ORDER', 'RESERVED', 'DISCARDED');

-- CreateEnum
CREATE TYPE "AssetAssignmentStatus" AS ENUM ('PENDING', 'ASSIGNED', 'RETURNED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "MaintenanceStatus" AS ENUM ('SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "HandoverStatus" AS ENUM ('PENDING', 'ACKNOWLEDGED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ClearanceStatus" AS ENUM ('IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ClearanceItemStatus" AS ENUM ('PENDING', 'RECEIVED', 'MISSING', 'DAMAGED');

-- CreateEnum
CREATE TYPE "ContractStatus" AS ENUM ('DRAFT', 'ACTIVE', 'EXPIRING', 'EXPIRED', 'RENEWED', 'TERMINATED');

-- CreateEnum
CREATE TYPE "ContractRenewalType" AS ENUM ('MANUAL', 'MONTHLY', 'QUARTERLY', 'ANNUAL', 'CUSTOM');

-- CreateEnum
CREATE TYPE "FormStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "FormFieldType" AS ENUM ('TEXT', 'PARAGRAPH', 'NUMBER', 'EMAIL', 'PHONE', 'DATE', 'TIME', 'DATETIME', 'DROPDOWN', 'MULTI_SELECT', 'RADIO', 'CHECKBOX', 'YES_NO', 'FILE_UPLOAD');

-- CreateEnum
CREATE TYPE "DocumentKind" AS ENUM ('GENERATED_PDF', 'UPLOADED_FILE', 'IMAGE', 'SPREADSHEET', 'WORD_DOCUMENT', 'OTHER');

-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('EMAIL', 'IN_APP');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('QUEUED', 'SENDING', 'DELIVERED', 'FAILED', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "TokenPurpose" AS ENUM ('APPROVAL_ACTION', 'CORRECTION_EDIT', 'CREDENTIAL_ACKNOWLEDGEMENT', 'ASSET_HANDOVER', 'CLEARANCE_CONFIRMATION', 'REQUEST_VIEW');

-- CreateEnum
CREATE TYPE "AuditOutcome" AS ENUM ('SUCCESS', 'FAILURE', 'DENIED');

-- CreateEnum
CREATE TYPE "SettingScope" AS ENUM ('GLOBAL', 'COMPANY');

-- CreateTable
CREATE TABLE "companies" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "branding" JSONB,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" UUID,

    CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "departments" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "description" TEXT,
    "default_location_id" UUID,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" UUID,

    CONSTRAINT "departments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "locations" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" UUID,

    CONSTRAINT "locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "positions" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" UUID,

    CONSTRAINT "positions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approval_roles" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "description" TEXT,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "approval_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approval_role_assignments" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "approval_role_id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "effective_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "approval_role_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "department_heads" (
    "id" UUID NOT NULL,
    "department_id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "department_heads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "people" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "department_id" UUID,
    "position_id" UUID,
    "location_id" UUID,
    "employee_id" TEXT NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "personal_email" TEXT,
    "phone" TEXT,
    "extension" TEXT,
    "employment_status" "EmploymentStatus" NOT NULL DEFAULT 'ACTIVE',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" UUID,

    CONSTRAINT "people_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "person_org_assignments" (
    "id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "department_id" UUID,
    "position_id" UUID,
    "location_id" UUID,
    "effective_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,

    CONSTRAINT "person_org_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_roles" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "description" TEXT,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "system_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "id" UUID NOT NULL,
    "system_role_id" UUID NOT NULL,
    "permission" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_users" (
    "id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "system_role_id" UUID NOT NULL,
    "username" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "is_enabled" BOOLEAN NOT NULL DEFAULT true,
    "last_login_at" TIMESTAMP(3),
    "password_changed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "system_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "system_user_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_activity_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "idle_expires_at" TIMESTAMP(3) NOT NULL,
    "absolute_expires_at" TIMESTAMP(3) NOT NULL,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "revoked_at" TIMESTAMP(3),

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "login_throttle" (
    "id" UUID NOT NULL,
    "identifier" TEXT NOT NULL,
    "failure_count" INTEGER NOT NULL DEFAULT 0,
    "window_start" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "blocked_until" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "login_throttle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "applications" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT,
    "login_url" TEXT,
    "icon" TEXT,
    "allow_multiple_assignments" BOOLEAN NOT NULL DEFAULT false,
    "requires_license" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" UUID,

    CONSTRAINT "applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "application_roles" (
    "id" UUID NOT NULL,
    "application_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "application_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "application_credential_fields" (
    "id" UUID NOT NULL,
    "application_id" UUID NOT NULL,
    "field_name" TEXT NOT NULL,
    "field_type" "CredentialFieldType" NOT NULL,
    "is_required" BOOLEAN NOT NULL DEFAULT false,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "help_text" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "application_credential_fields_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "application_assignments" (
    "id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "application_id" UUID NOT NULL,
    "application_role_id" UUID,
    "username" TEXT,
    "status" "AppAssignmentStatus" NOT NULL DEFAULT 'PENDING',
    "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "implemented_by" UUID,
    "request_item_id" UUID,
    "removed_at" TIMESTAMP(3),
    "removal_reason" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "application_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credential_deliveries" (
    "id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "application_id" UUID NOT NULL,
    "application_assignment_id" UUID,
    "request_item_id" UUID,
    "username" TEXT NOT NULL,
    "secret_ciphertext" TEXT,
    "secret_expires_at" TIMESTAMP(3),
    "status" "CredentialDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "sent_at" TIMESTAMP(3),
    "acknowledged_at" TIMESTAMP(3),
    "viewed_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "revoked_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "credential_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credential_delivery_fields" (
    "id" UUID NOT NULL,
    "credential_delivery_id" UUID NOT NULL,
    "field_name" TEXT NOT NULL,
    "field_value" TEXT NOT NULL,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "credential_delivery_fields_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "licenses" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "application_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "license_type" "LicenseType" NOT NULL,
    "vendor" TEXT,
    "license_key" TEXT,
    "status" "LicenseStatus" NOT NULL DEFAULT 'ACTIVE',
    "contract_id" UUID,
    "notes" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" UUID,

    CONSTRAINT "licenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "license_purchases" (
    "id" UUID NOT NULL,
    "license_id" UUID NOT NULL,
    "purchase_type" "LicensePurchaseType" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "purchase_date" TIMESTAMP(3) NOT NULL,
    "start_date" TIMESTAMP(3),
    "expiry_date" TIMESTAMP(3),
    "price" DECIMAL(14,2),
    "currency" TEXT,
    "supplier" TEXT,
    "purchase_reference" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "license_purchases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "license_assignments" (
    "id" UUID NOT NULL,
    "license_id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "request_item_id" UUID,
    "status" "LicenseAssignmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assigned_by" UUID,
    "removed_at" TIMESTAMP(3),
    "removed_by" UUID,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "license_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_categories" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "require_handover_acceptance" BOOLEAN NOT NULL DEFAULT false,
    "require_clearance_recovery" BOOLEAN NOT NULL DEFAULT true,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "asset_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assets" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "category_id" UUID NOT NULL,
    "asset_tag" TEXT NOT NULL,
    "serial_number" TEXT,
    "manufacturer" TEXT,
    "model" TEXT,
    "status" "AssetStatus" NOT NULL DEFAULT 'AVAILABLE',
    "location_id" UUID,
    "supplier" TEXT,
    "purchase_date" TIMESTAMP(3),
    "purchase_price" DECIMAL(14,2),
    "currency" TEXT,
    "warranty_expiry" TIMESTAMP(3),
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" UUID,

    CONSTRAINT "assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_assignments" (
    "id" UUID NOT NULL,
    "asset_id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "request_item_id" UUID,
    "status" "AssetAssignmentStatus" NOT NULL DEFAULT 'ASSIGNED',
    "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assigned_by" UUID,
    "returned_at" TIMESTAMP(3),
    "returned_by" UUID,
    "acknowledged_at" TIMESTAMP(3),
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "asset_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_maintenance" (
    "id" UUID NOT NULL,
    "asset_id" UUID NOT NULL,
    "maintenance_type" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "service_provider" TEXT,
    "start_date" TIMESTAMP(3) NOT NULL,
    "completion_date" TIMESTAMP(3),
    "cost" DECIMAL(14,2),
    "currency" TEXT,
    "status" "MaintenanceStatus" NOT NULL DEFAULT 'SCHEDULED',
    "previous_asset_status" "AssetStatus",
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "asset_maintenance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_disposals" (
    "id" UUID NOT NULL,
    "asset_id" UUID NOT NULL,
    "disposal_date" TIMESTAMP(3) NOT NULL,
    "disposal_method" TEXT NOT NULL,
    "disposal_reason" TEXT NOT NULL,
    "disposal_value" DECIMAL(14,2),
    "currency" TEXT,
    "approved_by" UUID,
    "document_id" UUID NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,

    CONSTRAINT "asset_disposals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "handovers" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "status" "HandoverStatus" NOT NULL DEFAULT 'PENDING',
    "document_id" UUID,
    "sent_at" TIMESTAMP(3),
    "acknowledged_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "handovers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "handover_assets" (
    "id" UUID NOT NULL,
    "handover_id" UUID NOT NULL,
    "asset_assignment_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "handover_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clearances" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "status" "ClearanceStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "document_id" UUID,
    "completed_at" TIMESTAMP(3),
    "completed_by" UUID,
    "it_representative" UUID,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clearances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clearance_items" (
    "id" UUID NOT NULL,
    "clearance_id" UUID NOT NULL,
    "asset_assignment_id" UUID NOT NULL,
    "status" "ClearanceItemStatus" NOT NULL DEFAULT 'PENDING',
    "comments" TEXT,
    "verified_at" TIMESTAMP(3),
    "verified_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clearance_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contracts" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "contract_number" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "vendor" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "status" "ContractStatus" NOT NULL DEFAULT 'DRAFT',
    "start_date" TIMESTAMP(3),
    "end_date" TIMESTAMP(3),
    "renewal_date" TIMESTAMP(3),
    "renewal_type" "ContractRenewalType" NOT NULL DEFAULT 'MANUAL',
    "cost" DECIMAL(14,2),
    "currency" TEXT,
    "owner_person_id" UUID,
    "reminder_days" JSONB,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" UUID,

    CONSTRAINT "contracts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contract_renewals" (
    "id" UUID NOT NULL,
    "contract_id" UUID NOT NULL,
    "renewal_date" TIMESTAMP(3) NOT NULL,
    "new_start_date" TIMESTAMP(3),
    "new_end_date" TIMESTAMP(3),
    "cost" DECIMAL(14,2),
    "currency" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,

    CONSTRAINT "contract_renewals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contract_links" (
    "id" UUID NOT NULL,
    "contract_id" UUID NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,

    CONSTRAINT "contract_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflows" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" UUID,

    CONSTRAINT "workflows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_versions" (
    "id" UUID NOT NULL,
    "workflow_id" UUID NOT NULL,
    "version_number" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,

    CONSTRAINT "workflow_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_steps" (
    "id" UUID NOT NULL,
    "workflow_version_id" UUID NOT NULL,
    "step_order" INTEGER NOT NULL,
    "step_name" TEXT NOT NULL,
    "step_type" "WorkflowStepType" NOT NULL,
    "approval_role_id" UUID NOT NULL,
    "approval_rule" "ApprovalRule" NOT NULL DEFAULT 'ANY',
    "allow_delegation" BOOLEAN NOT NULL DEFAULT true,
    "comments_required" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workflow_steps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_instances" (
    "id" UUID NOT NULL,
    "request_item_id" UUID NOT NULL,
    "workflow_version_id" UUID NOT NULL,
    "status" "WorkflowInstanceStatus" NOT NULL DEFAULT 'PENDING',
    "current_step_order" INTEGER,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "cancelled_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workflow_instances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_step_instances" (
    "id" UUID NOT NULL,
    "workflow_instance_id" UUID NOT NULL,
    "step_order" INTEGER NOT NULL,
    "step_name" TEXT NOT NULL,
    "step_type" "WorkflowStepType" NOT NULL,
    "approval_role_id" UUID NOT NULL,
    "approval_rule" "ApprovalRule" NOT NULL,
    "status" "StepInstanceStatus" NOT NULL DEFAULT 'PENDING',
    "activated_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workflow_step_instances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approval_assignments" (
    "id" UUID NOT NULL,
    "workflow_step_instance_id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "delegated_from_person_id" UUID,
    "acted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "approval_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approval_actions" (
    "id" UUID NOT NULL,
    "workflow_step_instance_id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "on_behalf_of_person_id" UUID,
    "action" "ApprovalActionType" NOT NULL,
    "comments" TEXT,
    "via_secure_token" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "approval_actions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delegations" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "from_person_id" UUID NOT NULL,
    "to_person_id" UUID NOT NULL,
    "start_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "delegations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "request_types" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "RequestTypeKind" NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "request_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "forms" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "request_type_id" UUID NOT NULL,
    "workflow_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "slug" TEXT NOT NULL,
    "status" "FormStatus" NOT NULL DEFAULT 'DRAFT',
    "confirmation_message" TEXT,
    "current_version_id" UUID,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" UUID,

    CONSTRAINT "forms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "form_versions" (
    "id" UUID NOT NULL,
    "form_id" UUID NOT NULL,
    "version_number" INTEGER NOT NULL,
    "published_at" TIMESTAMP(3),
    "published_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "form_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "form_fields" (
    "id" UUID NOT NULL,
    "form_version_id" UUID NOT NULL,
    "field_key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "field_type" "FormFieldType" NOT NULL,
    "placeholder" TEXT,
    "help_text" TEXT,
    "is_required" BOOLEAN NOT NULL DEFAULT false,
    "default_value" TEXT,
    "options" JSONB,
    "validation" JSONB,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "visibility_rules" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "form_fields_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "requests" (
    "id" UUID NOT NULL,
    "request_number" TEXT NOT NULL,
    "company_id" UUID NOT NULL,
    "form_id" UUID NOT NULL,
    "form_version_id" UUID NOT NULL,
    "status" "RequestStatus" NOT NULL DEFAULT 'SUBMITTED',
    "requester_person_id" UUID,
    "requester_name" TEXT NOT NULL,
    "requester_email" TEXT NOT NULL,
    "requested_for_person_id" UUID,
    "requested_for_name" TEXT NOT NULL,
    "requested_for_email" TEXT NOT NULL,
    "requested_for_department_id" UUID,
    "field_data" JSONB NOT NULL,
    "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "cancelled_by" UUID,
    "source_ip" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "request_items" (
    "id" UUID NOT NULL,
    "request_id" UUID NOT NULL,
    "item_type" "RequestItemType" NOT NULL,
    "application_id" UUID,
    "application_role_id" UUID,
    "asset_category_id" UUID,
    "description" TEXT,
    "item_data" JSONB,
    "status" "RequestItemStatus" NOT NULL DEFAULT 'PENDING_APPROVAL',
    "implemented_at" TIMESTAMP(3),
    "implemented_by" UUID,
    "implementation_notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "request_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "request_corrections" (
    "id" UUID NOT NULL,
    "request_id" UUID NOT NULL,
    "request_item_id" UUID NOT NULL,
    "requested_by_person_id" UUID,
    "request_comments" TEXT NOT NULL,
    "previous_data" JSONB,
    "corrected_data" JSONB,
    "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submitted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "request_corrections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "secure_tokens" (
    "id" UUID NOT NULL,
    "purpose" "TokenPurpose" NOT NULL,
    "token_hash" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "person_id" UUID,
    "target_type" TEXT NOT NULL,
    "target_id" UUID NOT NULL,
    "metadata" JSONB,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "consumed_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "secure_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_categories" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "retention_days" INTEGER,
    "allow_versioning" BOOLEAN NOT NULL DEFAULT true,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "document_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documents" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "category_id" UUID,
    "name" TEXT NOT NULL,
    "kind" "DocumentKind" NOT NULL,
    "status" "DocumentStatus" NOT NULL DEFAULT 'ACTIVE',
    "current_version" INTEGER NOT NULL DEFAULT 1,
    "is_generated" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" UUID,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_versions" (
    "id" UUID NOT NULL,
    "document_id" UUID NOT NULL,
    "version_number" INTEGER NOT NULL,
    "file_path" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "file_size" INTEGER NOT NULL,
    "mime_type" TEXT NOT NULL,
    "checksum" TEXT NOT NULL,
    "change_summary" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,

    CONSTRAINT "document_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_links" (
    "id" UUID NOT NULL,
    "document_id" UUID NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "removed_at" TIMESTAMP(3),
    "removed_by" UUID,

    CONSTRAINT "document_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_templates" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "variables" JSONB,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "company_id" UUID,
    "template_id" UUID,
    "channel" "NotificationChannel" NOT NULL,
    "event_type" TEXT NOT NULL,
    "dedupe_key" TEXT,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" "NotificationStatus" NOT NULL DEFAULT 'QUEUED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "entity_type" TEXT,
    "entity_id" UUID,
    "scheduled_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sent_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "cancelled_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_recipients" (
    "id" UUID NOT NULL,
    "notification_id" UUID NOT NULL,
    "person_id" UUID,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_recipients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "in_app_notifications" (
    "id" UUID NOT NULL,
    "system_user_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "link" TEXT,
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "in_app_notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_events" (
    "id" UUID NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "module" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "outcome" "AuditOutcome" NOT NULL DEFAULT 'SUCCESS',
    "company_id" UUID,
    "actor_user_id" UUID,
    "actor_person_id" UUID,
    "actor_label" TEXT NOT NULL,
    "target_type" TEXT,
    "target_id" UUID,
    "target_label" TEXT,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "correlation_id" UUID,
    "details" JSONB,

    CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_event_details" (
    "id" UUID NOT NULL,
    "audit_event_id" UUID NOT NULL,
    "field" TEXT NOT NULL,
    "previous_value" TEXT,
    "new_value" TEXT,

    CONSTRAINT "audit_event_details_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_settings" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "scope" "SettingScope" NOT NULL DEFAULT 'GLOBAL',
    "company_id" UUID,
    "value" JSONB NOT NULL,
    "description" TEXT,
    "is_secret" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" UUID,

    CONSTRAINT "system_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_setting_history" (
    "id" UUID NOT NULL,
    "setting_id" UUID NOT NULL,
    "previous_value" JSONB,
    "new_value" JSONB NOT NULL,
    "changed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "changed_by" UUID,
    "reason" TEXT,

    CONSTRAINT "system_setting_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "counters" (
    "key" TEXT NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "counters_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "companies_code_key" ON "companies"("code");

-- CreateIndex
CREATE INDEX "companies_is_active_idx" ON "companies"("is_active");

-- CreateIndex
CREATE INDEX "departments_company_id_is_active_idx" ON "departments"("company_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "departments_company_id_name_key" ON "departments"("company_id", "name");

-- CreateIndex
CREATE INDEX "locations_company_id_is_active_idx" ON "locations"("company_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "locations_company_id_name_key" ON "locations"("company_id", "name");

-- CreateIndex
CREATE INDEX "positions_company_id_is_active_idx" ON "positions"("company_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "positions_company_id_name_key" ON "positions"("company_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "approval_roles_name_key" ON "approval_roles"("name");

-- CreateIndex
CREATE UNIQUE INDEX "approval_roles_key_key" ON "approval_roles"("key");

-- CreateIndex
CREATE INDEX "approval_role_assignments_company_id_approval_role_id_is_ac_idx" ON "approval_role_assignments"("company_id", "approval_role_id", "is_active");

-- CreateIndex
CREATE INDEX "approval_role_assignments_person_id_idx" ON "approval_role_assignments"("person_id");

-- CreateIndex
CREATE UNIQUE INDEX "approval_role_assignments_company_id_approval_role_id_perso_key" ON "approval_role_assignments"("company_id", "approval_role_id", "person_id");

-- CreateIndex
CREATE INDEX "department_heads_department_id_is_active_idx" ON "department_heads"("department_id", "is_active");

-- CreateIndex
CREATE INDEX "department_heads_person_id_idx" ON "department_heads"("person_id");

-- CreateIndex
CREATE UNIQUE INDEX "department_heads_department_id_person_id_key" ON "department_heads"("department_id", "person_id");

-- CreateIndex
CREATE INDEX "people_company_id_is_active_idx" ON "people"("company_id", "is_active");

-- CreateIndex
CREATE INDEX "people_email_idx" ON "people"("email");

-- CreateIndex
CREATE INDEX "people_last_name_first_name_idx" ON "people"("last_name", "first_name");

-- CreateIndex
CREATE UNIQUE INDEX "people_company_id_employee_id_key" ON "people"("company_id", "employee_id");

-- CreateIndex
CREATE INDEX "person_org_assignments_person_id_effective_at_idx" ON "person_org_assignments"("person_id", "effective_at");

-- CreateIndex
CREATE UNIQUE INDEX "system_roles_name_key" ON "system_roles"("name");

-- CreateIndex
CREATE UNIQUE INDEX "system_roles_key_key" ON "system_roles"("key");

-- CreateIndex
CREATE UNIQUE INDEX "role_permissions_system_role_id_permission_key" ON "role_permissions"("system_role_id", "permission");

-- CreateIndex
CREATE UNIQUE INDEX "system_users_person_id_key" ON "system_users"("person_id");

-- CreateIndex
CREATE UNIQUE INDEX "system_users_username_key" ON "system_users"("username");

-- CreateIndex
CREATE INDEX "system_users_system_role_id_idx" ON "system_users"("system_role_id");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_hash_key" ON "sessions"("token_hash");

-- CreateIndex
CREATE INDEX "sessions_system_user_id_revoked_at_idx" ON "sessions"("system_user_id", "revoked_at");

-- CreateIndex
CREATE INDEX "sessions_absolute_expires_at_idx" ON "sessions"("absolute_expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "login_throttle_identifier_key" ON "login_throttle"("identifier");

-- CreateIndex
CREATE INDEX "login_throttle_blocked_until_idx" ON "login_throttle"("blocked_until");

-- CreateIndex
CREATE INDEX "applications_company_id_is_active_idx" ON "applications"("company_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "applications_company_id_name_key" ON "applications"("company_id", "name");

-- CreateIndex
CREATE INDEX "application_roles_application_id_is_active_idx" ON "application_roles"("application_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "application_roles_application_id_name_key" ON "application_roles"("application_id", "name");

-- CreateIndex
CREATE INDEX "application_credential_fields_application_id_is_active_idx" ON "application_credential_fields"("application_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "application_credential_fields_application_id_field_name_key" ON "application_credential_fields"("application_id", "field_name");

-- CreateIndex
CREATE INDEX "application_assignments_person_id_status_idx" ON "application_assignments"("person_id", "status");

-- CreateIndex
CREATE INDEX "application_assignments_application_id_status_idx" ON "application_assignments"("application_id", "status");

-- CreateIndex
CREATE INDEX "application_assignments_username_idx" ON "application_assignments"("username");

-- CreateIndex
CREATE INDEX "credential_deliveries_person_id_status_idx" ON "credential_deliveries"("person_id", "status");

-- CreateIndex
CREATE INDEX "credential_deliveries_status_secret_expires_at_idx" ON "credential_deliveries"("status", "secret_expires_at");

-- CreateIndex
CREATE INDEX "credential_delivery_fields_credential_delivery_id_idx" ON "credential_delivery_fields"("credential_delivery_id");

-- CreateIndex
CREATE INDEX "licenses_company_id_status_idx" ON "licenses"("company_id", "status");

-- CreateIndex
CREATE INDEX "licenses_application_id_idx" ON "licenses"("application_id");

-- CreateIndex
CREATE UNIQUE INDEX "licenses_company_id_name_key" ON "licenses"("company_id", "name");

-- CreateIndex
CREATE INDEX "license_purchases_license_id_idx" ON "license_purchases"("license_id");

-- CreateIndex
CREATE INDEX "license_purchases_expiry_date_idx" ON "license_purchases"("expiry_date");

-- CreateIndex
CREATE INDEX "license_assignments_license_id_status_idx" ON "license_assignments"("license_id", "status");

-- CreateIndex
CREATE INDEX "license_assignments_person_id_status_idx" ON "license_assignments"("person_id", "status");

-- CreateIndex
CREATE INDEX "asset_categories_company_id_is_active_idx" ON "asset_categories"("company_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "asset_categories_company_id_name_key" ON "asset_categories"("company_id", "name");

-- CreateIndex
CREATE INDEX "assets_company_id_status_idx" ON "assets"("company_id", "status");

-- CreateIndex
CREATE INDEX "assets_serial_number_idx" ON "assets"("serial_number");

-- CreateIndex
CREATE INDEX "assets_category_id_idx" ON "assets"("category_id");

-- CreateIndex
CREATE UNIQUE INDEX "assets_company_id_asset_tag_key" ON "assets"("company_id", "asset_tag");

-- CreateIndex
CREATE INDEX "asset_assignments_asset_id_status_idx" ON "asset_assignments"("asset_id", "status");

-- CreateIndex
CREATE INDEX "asset_assignments_person_id_status_idx" ON "asset_assignments"("person_id", "status");

-- CreateIndex
CREATE INDEX "asset_maintenance_asset_id_status_idx" ON "asset_maintenance"("asset_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "asset_disposals_asset_id_key" ON "asset_disposals"("asset_id");

-- CreateIndex
CREATE INDEX "handovers_person_id_status_idx" ON "handovers"("person_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "handover_assets_handover_id_asset_assignment_id_key" ON "handover_assets"("handover_id", "asset_assignment_id");

-- CreateIndex
CREATE INDEX "clearances_person_id_status_idx" ON "clearances"("person_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "clearance_items_clearance_id_asset_assignment_id_key" ON "clearance_items"("clearance_id", "asset_assignment_id");

-- CreateIndex
CREATE INDEX "contracts_company_id_status_idx" ON "contracts"("company_id", "status");

-- CreateIndex
CREATE INDEX "contracts_end_date_idx" ON "contracts"("end_date");

-- CreateIndex
CREATE INDEX "contracts_renewal_date_idx" ON "contracts"("renewal_date");

-- CreateIndex
CREATE UNIQUE INDEX "contracts_company_id_contract_number_key" ON "contracts"("company_id", "contract_number");

-- CreateIndex
CREATE INDEX "contract_renewals_contract_id_idx" ON "contract_renewals"("contract_id");

-- CreateIndex
CREATE INDEX "contract_links_entity_type_entity_id_idx" ON "contract_links"("entity_type", "entity_id");

-- CreateIndex
CREATE UNIQUE INDEX "contract_links_contract_id_entity_type_entity_id_key" ON "contract_links"("contract_id", "entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "workflows_company_id_is_active_idx" ON "workflows"("company_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "workflows_company_id_name_key" ON "workflows"("company_id", "name");

-- CreateIndex
CREATE INDEX "workflow_versions_workflow_id_is_active_idx" ON "workflow_versions"("workflow_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "workflow_versions_workflow_id_version_number_key" ON "workflow_versions"("workflow_id", "version_number");

-- CreateIndex
CREATE UNIQUE INDEX "workflow_steps_workflow_version_id_step_order_key" ON "workflow_steps"("workflow_version_id", "step_order");

-- CreateIndex
CREATE INDEX "workflow_instances_request_item_id_idx" ON "workflow_instances"("request_item_id");

-- CreateIndex
CREATE INDEX "workflow_instances_status_idx" ON "workflow_instances"("status");

-- CreateIndex
CREATE INDEX "workflow_instances_workflow_version_id_idx" ON "workflow_instances"("workflow_version_id");

-- CreateIndex
CREATE INDEX "workflow_step_instances_status_idx" ON "workflow_step_instances"("status");

-- CreateIndex
CREATE UNIQUE INDEX "workflow_step_instances_workflow_instance_id_step_order_key" ON "workflow_step_instances"("workflow_instance_id", "step_order");

-- CreateIndex
CREATE INDEX "approval_assignments_person_id_acted_at_idx" ON "approval_assignments"("person_id", "acted_at");

-- CreateIndex
CREATE UNIQUE INDEX "approval_assignments_workflow_step_instance_id_person_id_key" ON "approval_assignments"("workflow_step_instance_id", "person_id");

-- CreateIndex
CREATE INDEX "approval_actions_workflow_step_instance_id_idx" ON "approval_actions"("workflow_step_instance_id");

-- CreateIndex
CREATE INDEX "approval_actions_person_id_idx" ON "approval_actions"("person_id");

-- CreateIndex
CREATE INDEX "delegations_from_person_id_is_active_start_date_end_date_idx" ON "delegations"("from_person_id", "is_active", "start_date", "end_date");

-- CreateIndex
CREATE INDEX "request_types_company_id_is_active_idx" ON "request_types"("company_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "request_types_company_id_name_key" ON "request_types"("company_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "forms_slug_key" ON "forms"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "forms_current_version_id_key" ON "forms"("current_version_id");

-- CreateIndex
CREATE INDEX "forms_company_id_status_idx" ON "forms"("company_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "forms_company_id_name_key" ON "forms"("company_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "form_versions_form_id_version_number_key" ON "form_versions"("form_id", "version_number");

-- CreateIndex
CREATE INDEX "form_fields_form_version_id_display_order_idx" ON "form_fields"("form_version_id", "display_order");

-- CreateIndex
CREATE UNIQUE INDEX "form_fields_form_version_id_field_key_key" ON "form_fields"("form_version_id", "field_key");

-- CreateIndex
CREATE UNIQUE INDEX "requests_request_number_key" ON "requests"("request_number");

-- CreateIndex
CREATE INDEX "requests_company_id_status_idx" ON "requests"("company_id", "status");

-- CreateIndex
CREATE INDEX "requests_submitted_at_idx" ON "requests"("submitted_at");

-- CreateIndex
CREATE INDEX "requests_requester_email_idx" ON "requests"("requester_email");

-- CreateIndex
CREATE INDEX "requests_requested_for_email_idx" ON "requests"("requested_for_email");

-- CreateIndex
CREATE INDEX "request_items_request_id_idx" ON "request_items"("request_id");

-- CreateIndex
CREATE INDEX "request_items_status_idx" ON "request_items"("status");

-- CreateIndex
CREATE INDEX "request_corrections_request_item_id_idx" ON "request_corrections"("request_item_id");

-- CreateIndex
CREATE UNIQUE INDEX "secure_tokens_token_hash_key" ON "secure_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "secure_tokens_target_type_target_id_idx" ON "secure_tokens"("target_type", "target_id");

-- CreateIndex
CREATE INDEX "secure_tokens_expires_at_idx" ON "secure_tokens"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "document_categories_company_id_name_key" ON "document_categories"("company_id", "name");

-- CreateIndex
CREATE INDEX "documents_company_id_kind_idx" ON "documents"("company_id", "kind");

-- CreateIndex
CREATE INDEX "documents_category_id_idx" ON "documents"("category_id");

-- CreateIndex
CREATE UNIQUE INDEX "document_versions_document_id_version_number_key" ON "document_versions"("document_id", "version_number");

-- CreateIndex
CREATE INDEX "document_links_entity_type_entity_id_idx" ON "document_links"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "document_links_document_id_idx" ON "document_links"("document_id");

-- CreateIndex
CREATE INDEX "notification_templates_key_is_active_idx" ON "notification_templates"("key", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "notification_templates_key_version_key" ON "notification_templates"("key", "version");

-- CreateIndex
CREATE INDEX "notifications_status_scheduled_at_idx" ON "notifications"("status", "scheduled_at");

-- CreateIndex
CREATE INDEX "notifications_entity_type_entity_id_idx" ON "notifications"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "notifications_dedupe_key_idx" ON "notifications"("dedupe_key");

-- CreateIndex
CREATE INDEX "notification_recipients_notification_id_idx" ON "notification_recipients"("notification_id");

-- CreateIndex
CREATE INDEX "notification_recipients_email_idx" ON "notification_recipients"("email");

-- CreateIndex
CREATE INDEX "in_app_notifications_system_user_id_read_at_idx" ON "in_app_notifications"("system_user_id", "read_at");

-- CreateIndex
CREATE INDEX "audit_events_occurred_at_idx" ON "audit_events"("occurred_at");

-- CreateIndex
CREATE INDEX "audit_events_module_event_type_idx" ON "audit_events"("module", "event_type");

-- CreateIndex
CREATE INDEX "audit_events_company_id_occurred_at_idx" ON "audit_events"("company_id", "occurred_at");

-- CreateIndex
CREATE INDEX "audit_events_actor_user_id_idx" ON "audit_events"("actor_user_id");

-- CreateIndex
CREATE INDEX "audit_events_target_type_target_id_idx" ON "audit_events"("target_type", "target_id");

-- CreateIndex
CREATE INDEX "audit_events_correlation_id_idx" ON "audit_events"("correlation_id");

-- CreateIndex
CREATE INDEX "audit_event_details_audit_event_id_idx" ON "audit_event_details"("audit_event_id");

-- CreateIndex
CREATE INDEX "system_settings_category_idx" ON "system_settings"("category");

-- CreateIndex
CREATE UNIQUE INDEX "system_settings_key_scope_company_id_key" ON "system_settings"("key", "scope", "company_id");

-- CreateIndex
CREATE INDEX "system_setting_history_setting_id_changed_at_idx" ON "system_setting_history"("setting_id", "changed_at");

-- AddForeignKey
ALTER TABLE "departments" ADD CONSTRAINT "departments_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "departments" ADD CONSTRAINT "departments_default_location_id_fkey" FOREIGN KEY ("default_location_id") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "locations" ADD CONSTRAINT "locations_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "positions" ADD CONSTRAINT "positions_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_role_assignments" ADD CONSTRAINT "approval_role_assignments_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_role_assignments" ADD CONSTRAINT "approval_role_assignments_approval_role_id_fkey" FOREIGN KEY ("approval_role_id") REFERENCES "approval_roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_role_assignments" ADD CONSTRAINT "approval_role_assignments_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "people"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "department_heads" ADD CONSTRAINT "department_heads_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "department_heads" ADD CONSTRAINT "department_heads_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "people"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "people" ADD CONSTRAINT "people_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "people" ADD CONSTRAINT "people_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "people" ADD CONSTRAINT "people_position_id_fkey" FOREIGN KEY ("position_id") REFERENCES "positions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "people" ADD CONSTRAINT "people_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "person_org_assignments" ADD CONSTRAINT "person_org_assignments_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "people"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_system_role_id_fkey" FOREIGN KEY ("system_role_id") REFERENCES "system_roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "system_users" ADD CONSTRAINT "system_users_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "people"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "system_users" ADD CONSTRAINT "system_users_system_role_id_fkey" FOREIGN KEY ("system_role_id") REFERENCES "system_roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_system_user_id_fkey" FOREIGN KEY ("system_user_id") REFERENCES "system_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_roles" ADD CONSTRAINT "application_roles_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_credential_fields" ADD CONSTRAINT "application_credential_fields_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_assignments" ADD CONSTRAINT "application_assignments_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "people"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_assignments" ADD CONSTRAINT "application_assignments_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_assignments" ADD CONSTRAINT "application_assignments_application_role_id_fkey" FOREIGN KEY ("application_role_id") REFERENCES "application_roles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_assignments" ADD CONSTRAINT "application_assignments_request_item_id_fkey" FOREIGN KEY ("request_item_id") REFERENCES "request_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credential_deliveries" ADD CONSTRAINT "credential_deliveries_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "people"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credential_deliveries" ADD CONSTRAINT "credential_deliveries_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credential_deliveries" ADD CONSTRAINT "credential_deliveries_application_assignment_id_fkey" FOREIGN KEY ("application_assignment_id") REFERENCES "application_assignments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credential_deliveries" ADD CONSTRAINT "credential_deliveries_request_item_id_fkey" FOREIGN KEY ("request_item_id") REFERENCES "request_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credential_delivery_fields" ADD CONSTRAINT "credential_delivery_fields_credential_delivery_id_fkey" FOREIGN KEY ("credential_delivery_id") REFERENCES "credential_deliveries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "licenses" ADD CONSTRAINT "licenses_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "licenses" ADD CONSTRAINT "licenses_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "licenses" ADD CONSTRAINT "licenses_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "contracts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "license_purchases" ADD CONSTRAINT "license_purchases_license_id_fkey" FOREIGN KEY ("license_id") REFERENCES "licenses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "license_assignments" ADD CONSTRAINT "license_assignments_license_id_fkey" FOREIGN KEY ("license_id") REFERENCES "licenses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "license_assignments" ADD CONSTRAINT "license_assignments_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "people"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "license_assignments" ADD CONSTRAINT "license_assignments_request_item_id_fkey" FOREIGN KEY ("request_item_id") REFERENCES "request_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_categories" ADD CONSTRAINT "asset_categories_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "asset_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_assignments" ADD CONSTRAINT "asset_assignments_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_assignments" ADD CONSTRAINT "asset_assignments_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "people"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_assignments" ADD CONSTRAINT "asset_assignments_request_item_id_fkey" FOREIGN KEY ("request_item_id") REFERENCES "request_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_maintenance" ADD CONSTRAINT "asset_maintenance_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_disposals" ADD CONSTRAINT "asset_disposals_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_disposals" ADD CONSTRAINT "asset_disposals_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "handovers" ADD CONSTRAINT "handovers_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "handovers" ADD CONSTRAINT "handovers_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "people"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "handovers" ADD CONSTRAINT "handovers_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "handover_assets" ADD CONSTRAINT "handover_assets_handover_id_fkey" FOREIGN KEY ("handover_id") REFERENCES "handovers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "handover_assets" ADD CONSTRAINT "handover_assets_asset_assignment_id_fkey" FOREIGN KEY ("asset_assignment_id") REFERENCES "asset_assignments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clearances" ADD CONSTRAINT "clearances_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clearances" ADD CONSTRAINT "clearances_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "people"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clearances" ADD CONSTRAINT "clearances_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clearance_items" ADD CONSTRAINT "clearance_items_clearance_id_fkey" FOREIGN KEY ("clearance_id") REFERENCES "clearances"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clearance_items" ADD CONSTRAINT "clearance_items_asset_assignment_id_fkey" FOREIGN KEY ("asset_assignment_id") REFERENCES "asset_assignments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_owner_person_id_fkey" FOREIGN KEY ("owner_person_id") REFERENCES "people"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_renewals" ADD CONSTRAINT "contract_renewals_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "contracts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_links" ADD CONSTRAINT "contract_links_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "contracts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflows" ADD CONSTRAINT "workflows_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_versions" ADD CONSTRAINT "workflow_versions_workflow_id_fkey" FOREIGN KEY ("workflow_id") REFERENCES "workflows"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_steps" ADD CONSTRAINT "workflow_steps_workflow_version_id_fkey" FOREIGN KEY ("workflow_version_id") REFERENCES "workflow_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_steps" ADD CONSTRAINT "workflow_steps_approval_role_id_fkey" FOREIGN KEY ("approval_role_id") REFERENCES "approval_roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_instances" ADD CONSTRAINT "workflow_instances_request_item_id_fkey" FOREIGN KEY ("request_item_id") REFERENCES "request_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_instances" ADD CONSTRAINT "workflow_instances_workflow_version_id_fkey" FOREIGN KEY ("workflow_version_id") REFERENCES "workflow_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_step_instances" ADD CONSTRAINT "workflow_step_instances_workflow_instance_id_fkey" FOREIGN KEY ("workflow_instance_id") REFERENCES "workflow_instances"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_assignments" ADD CONSTRAINT "approval_assignments_workflow_step_instance_id_fkey" FOREIGN KEY ("workflow_step_instance_id") REFERENCES "workflow_step_instances"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_assignments" ADD CONSTRAINT "approval_assignments_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "people"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_actions" ADD CONSTRAINT "approval_actions_workflow_step_instance_id_fkey" FOREIGN KEY ("workflow_step_instance_id") REFERENCES "workflow_step_instances"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_actions" ADD CONSTRAINT "approval_actions_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "people"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delegations" ADD CONSTRAINT "delegations_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delegations" ADD CONSTRAINT "delegations_from_person_id_fkey" FOREIGN KEY ("from_person_id") REFERENCES "people"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delegations" ADD CONSTRAINT "delegations_to_person_id_fkey" FOREIGN KEY ("to_person_id") REFERENCES "people"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "request_types" ADD CONSTRAINT "request_types_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "forms" ADD CONSTRAINT "forms_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "forms" ADD CONSTRAINT "forms_request_type_id_fkey" FOREIGN KEY ("request_type_id") REFERENCES "request_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "forms" ADD CONSTRAINT "forms_workflow_id_fkey" FOREIGN KEY ("workflow_id") REFERENCES "workflows"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "forms" ADD CONSTRAINT "forms_current_version_id_fkey" FOREIGN KEY ("current_version_id") REFERENCES "form_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "form_versions" ADD CONSTRAINT "form_versions_form_id_fkey" FOREIGN KEY ("form_id") REFERENCES "forms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "form_fields" ADD CONSTRAINT "form_fields_form_version_id_fkey" FOREIGN KEY ("form_version_id") REFERENCES "form_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requests" ADD CONSTRAINT "requests_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requests" ADD CONSTRAINT "requests_form_id_fkey" FOREIGN KEY ("form_id") REFERENCES "forms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requests" ADD CONSTRAINT "requests_form_version_id_fkey" FOREIGN KEY ("form_version_id") REFERENCES "form_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requests" ADD CONSTRAINT "requests_requester_person_id_fkey" FOREIGN KEY ("requester_person_id") REFERENCES "people"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requests" ADD CONSTRAINT "requests_requested_for_person_id_fkey" FOREIGN KEY ("requested_for_person_id") REFERENCES "people"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "request_items" ADD CONSTRAINT "request_items_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "request_items" ADD CONSTRAINT "request_items_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "request_items" ADD CONSTRAINT "request_items_application_role_id_fkey" FOREIGN KEY ("application_role_id") REFERENCES "application_roles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "request_items" ADD CONSTRAINT "request_items_asset_category_id_fkey" FOREIGN KEY ("asset_category_id") REFERENCES "asset_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "request_corrections" ADD CONSTRAINT "request_corrections_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "request_corrections" ADD CONSTRAINT "request_corrections_request_item_id_fkey" FOREIGN KEY ("request_item_id") REFERENCES "request_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_categories" ADD CONSTRAINT "document_categories_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "document_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_links" ADD CONSTRAINT "document_links_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "notification_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_recipients" ADD CONSTRAINT "notification_recipients_notification_id_fkey" FOREIGN KEY ("notification_id") REFERENCES "notifications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "in_app_notifications" ADD CONSTRAINT "in_app_notifications_system_user_id_fkey" FOREIGN KEY ("system_user_id") REFERENCES "system_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_event_details" ADD CONSTRAINT "audit_event_details_audit_event_id_fkey" FOREIGN KEY ("audit_event_id") REFERENCES "audit_events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "system_settings" ADD CONSTRAINT "system_settings_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "system_setting_history" ADD CONSTRAINT "system_setting_history_setting_id_fkey" FOREIGN KEY ("setting_id") REFERENCES "system_settings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
