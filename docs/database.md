# Axivo — Database Documentation

Engine: PostgreSQL 17 · ORM: Prisma · Schema: `prisma/schema.prisma`
(authoritative). Conventions per SDS Doc 04: UUID primary keys (application
generated), snake_case tables/columns, UTC timestamps, foreign keys on every
relationship, soft deletes (`deleted_at`) on operational records, no cascade
deletes on business data, no business logic in triggers.

## Entity groups

### Organization (Doc 06)
`companies` → `departments` / `locations` / `positions` (unique names per
company). `approval_roles` are **global** definitions; `approval_role_assignments`
map company + role + **person** (Doc 00 §5: approvers do not need portal
accounts). `department_heads` map department + person and resolve
Department-Head workflow steps for the Requested For employee's department.

### People & identity (Doc 07, Doc 05)
`people` is the central entity referenced everywhere (employee_id unique per
company, work email unique per company). `person_org_assignments` keeps the
placement history. `system_users` (1:1 with a person, globally unique
username, Argon2id `password_hash`) + `system_roles` + `role_permissions`
implement RBAC. `sessions` are server-side (SHA-256 token hash, idle+absolute
expiry, revocation). `login_throttle` implements temporary login throttling.

### Catalogue (Docs 08/10/11/23)
- Applications: `applications`, `application_roles`,
  `application_credential_fields`, `application_assignments` (history kept).
- Licenses: `licenses`, `license_purchases` (purchases/renewals/seats),
  `license_assignments`. Availability = Σ purchased − active assignments,
  enforced in-transaction.
- Assets: `asset_categories` (handover/clearance flags), `assets` (tag unique
  per company), `asset_assignments` (one active per asset),
  `asset_maintenance` (restores previous status), `asset_disposals`
  (requires linked document), `handovers`/`handover_assets`,
  `clearances`/`clearance_items`.
- Contracts: `contracts` (number unique per company), `contract_renewals`,
  `contract_links` (optional links to applications/licenses/assets).

### Workflow & requests (Docs 09/13/22)
`workflows` → `workflow_versions` (editing creates a new version; only one
active) → `workflow_steps` (ordered; last step must be IT_IMPLEMENTATION).
`request_types` + `forms` → `form_versions` (published versions immutable) →
`form_fields` (types, options, validation, visibility rules as JSON).
`requests` (immutable `field_data` snapshot; requester/requested-for captured
by value and matched to people where possible) → `request_items` →
`workflow_instances` (pinned to a workflow version; an item may have several
across correction restarts, one non-terminal) → `workflow_step_instances` →
`approval_assignments` (resolved approvers incl. delegation) +
`approval_actions` (immutable decisions). `request_corrections` record
correction rounds with data snapshots. `delegations` cover approver absence.

### Security, documents, notifications, audit
- `secure_tokens`: hashed single-purpose email action tokens with expiry,
  consumption and revocation.
- `credential_deliveries` + `credential_delivery_fields`: username and
  non-secret fields persist; the temporary secret is AES-256-GCM ciphertext
  destroyed on reveal/expiry.
- `documents` → `document_versions` (immutable) → `document_links`
  (one file, many records); `document_categories` with retention config.
- `notification_templates` (versioned), `notifications` +
  `notification_recipients` (immutable delivery history),
  `in_app_notifications`.
- `audit_events` + `audit_event_details` (before/after per field):
  **append-only** — the application never updates or deletes audit rows.
- `system_settings` + `system_setting_history`, `counters` (atomic request
  numbering: `REQ-<year>-<seq>`).

## Migrations

- Version-controlled under `prisma/migrations/`; applied with
  `prisma migrate deploy` (the compose `migrate` service does this on every
  deploy, after the automated backup step in the update procedure).
- Never modify production tables manually (Doc 04 Ch14).
- Rollback strategy: restore the pre-migration backup; migrations are written
  additively wherever possible to keep old app versions compatible during
  controlled upgrades.

## Purging & retention (Doc 04 Ch12)

Automatic deletion applies only to: expired credential secrets (ciphertext
nulled, metadata retained), expired secure tokens (30-day grace, then purged),
expired sessions (30-day grace). Business records are never automatically
deleted; soft-deleted records remain for audit.
