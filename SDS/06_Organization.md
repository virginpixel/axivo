# Axivo Software Design Specification

# Document 06 - Organization

## Chapter 1 - Organization Module Overview

### Purpose

The Organization module manages the business structure used throughout Axivo.

It defines:
- Companies
- Departments
- Locations
- Positions
- Approval Role Assignments
- Department Heads

Every other module depends on this organizational hierarchy.

---

### Objectives

- Support multiple companies
- Separate organizational data by company
- Allow reusable workflows
- Centralize approval routing
- Eliminate hardcoded organizational logic

---

### Module Scope

The Organization module includes:

- Companies
- Departments
- Locations
- Positions
- Department Head assignments
- Approval Role assignments

---

### Core Principles

- Each department belongs to one company.
- Each location belongs to one company.
- Each position belongs to one company.
- Companies are isolated from each other.
- Approval routing uses organizational assignments.

End of Chapter 1.


---

## Chapter 2 - Companies

### Purpose

Companies are the highest business boundary within Axivo.

All company-scoped data belongs to exactly one company.

---

### Company Fields

- Name
- Code
- Description
- Active Status
- Default Branding
- Default Timezone
- Default Currency
- Created Date
- Updated Date

---

### Relationships

A company owns:

- Departments
- Locations
- Positions
- Forms
- Workflows
- Applications
- Assets
- Contracts
- People

---

### Business Rules

- Company Code must be unique.
- Companies cannot be deleted while referenced.
- Companies may be disabled.
- Disabled companies cannot receive new records.

---

### Permissions

Only System Administrators may:

- Create companies
- Edit companies
- Disable companies

---

### Audit

Audit:
- Create
- Update
- Enable
- Disable

End of Chapter 2.

---

## Chapter 3 - Departments

### Purpose

Departments organize People within a Company and determine Department Head approval routing.

---

### Department Fields

- Company
- Department Name
- Department Code (optional)
- Description
- Active Status
- Default Location (optional)

---

### Relationships

Each Department belongs to one Company.

A Department may contain:
- Many People
- Many Department Heads

Department Heads are assigned separately from System Roles.

---

### Business Rules

- Department names must be unique within the same Company.
- Departments cannot be deleted while referenced by People, Forms or historical Requests.
- Departments may be disabled.
- Disabled Departments cannot receive new People assignments.

---

### Approval Routing

When a workflow step uses the "Department Head" Approval Role:

1. Determine the Requested For person's Department.
2. Find active Department Head assignments.
3. Route approval according to the workflow rule:
   - Any approver
   - All approvers

---

### Permissions

Only authorized administrators may:
- Create Departments
- Edit Departments
- Disable Departments
- Assign Department Heads

---

### Audit

Audit events:
- Create
- Update
- Enable
- Disable
- Department Head assignment changes

End of Chapter 3.

---

## Chapter 4 - Locations

### Purpose

Locations represent physical places within a Company.

Locations are used by:
- People
- Assets
- Reports
- Future inventory modules

---

### Location Fields

- Company
- Location Name
- Location Code (optional)
- Description
- Active Status

Examples:
- Head Office
- Resort
- Warehouse
- IT Office
- Reception

---

### Relationships

Each Location belongs to one Company.

A Location may contain:
- Many People
- Many Assets

---

### Business Rules

- Location names must be unique within the same Company.
- Disabled Locations cannot receive new assignments.
- Existing historical records remain unchanged.

---

### Permissions

Authorized administrators may:
- Create Locations
- Edit Locations
- Disable Locations

---

### Reporting

Locations are available as filters throughout the reporting module.

---

### Audit

Audit events:
- Create
- Update
- Enable
- Disable

End of Chapter 4.

---

## Chapter 5 - Positions

### Purpose

Positions identify an employee's organizational role within a Company.

Positions are informational and may also be used for reporting, filtering and future workflow conditions.

---

### Position Fields

- Company
- Position Name
- Position Code (optional)
- Description
- Active Status

Examples:
- IT Executive
- HR Manager
- Front Office Agent
- Finance Manager

---

### Relationships

Each Position belongs to one Company.

A Position may be assigned to many People.

---

### Business Rules

- Position names must be unique within the same Company.
- Disabled Positions cannot be assigned to new People.
- Historical assignments remain unchanged.

---

### Permissions

Authorized administrators may:
- Create Positions
- Edit Positions
- Disable Positions

---

### Audit

Audit events:
- Create
- Update
- Enable
- Disable

End of Chapter 5.

---

## Chapter 6 - Approval Roles

### Purpose

Approval Roles define workflow responsibilities independently from System Roles.

---

### Standard Approval Roles

Default roles include:
- Department Head
- HR
- General Manager
- IT Approval
- IT Implementation

Additional Approval Roles may be created by administrators.

---

### Role Definition Fields

- Role Name
- Description
- Active Status

Approval Roles are global definitions.

---

### Company Assignments

Approval Roles are assigned once per Company.

One role may have:
- One approver
- Multiple approvers

Workflow rules determine whether:
- Any approver may approve
- All approvers must approve

---

### Business Rules

- Approval Roles do not grant portal permissions.
- Approval Roles are referenced by workflow steps.
- Removing an assignment shall not affect historical approvals.

---

### Permissions

Only System Administrators may:
- Create Approval Roles
- Edit Approval Roles
- Assign users to Approval Roles

---

### Audit

Audit events:
- Create
- Update
- Assignment changes
- Enable
- Disable

End of Chapter 6.

---

## Chapter 7 - Department Head Assignments

### Purpose

Department Head assignments determine who receives Department Head approval requests for each department.

---

### Assignment Model

Each assignment links:

- Company
- Department
- System User

A department may have one or multiple Department Heads.

---

### Approval Behaviour

Workflow configuration determines whether:

- Any assigned Department Head may approve.
- All assigned Department Heads must approve.

---

### Business Rules

- Assigned users must belong to the same company.
- Inactive users cannot receive approvals.
- Historical approvals remain unchanged after assignment changes.
- At least one active Department Head is recommended before publishing forms using the Department Head role.

---

### Administration

Authorized administrators may:

- Assign Department Heads
- Remove assignments
- Change approval participants

---

### Audit

Audit events:
- Assignment created
- Assignment removed
- Assignment updated

End of Chapter 7.

---

## Chapter 8 - Organization Administration

### Administration Interface

The Organization module provides centralized management for:

- Companies
- Departments
- Locations
- Positions
- Approval Roles
- Department Heads

---

### Page Layout

Each management page includes:

- Search
- Filters
- Active/Inactive toggle
- Create button
- Edit action
- Disable action
- Audit history

---

### Validation

Before saving:

- Required fields validated
- Duplicate names prevented
- Company relationships verified
- Active references checked

Inline validation shall be displayed for all fields.

---

### Permissions

System Administrators:
- Full access

IT Administrators:
- Access only if explicitly granted

Read Only:
- View only

---

### Audit

Every administrative change records:

- Actor
- Previous value
- New value
- Timestamp
- Company
- Source IP

End of Chapter 8.

---

## Chapter 9 - Organizational Relationships & Business Rules

### Relationship Hierarchy

The organizational hierarchy is:

Company
→ Department
→ Position
→ Person

Locations are assigned independently within the Company.

---

### Cross-Company Rules

Business records shall never reference organizational records from another Company.

Examples:
- A Person cannot belong to a Department in another Company.
- A Form cannot reference another Company's Workflow.
- Assets cannot be assigned across Companies unless explicitly transferred.

---

### Inactive Records

When an organizational record becomes inactive:

- Existing historical records remain unchanged.
- New assignments are prevented.
- Reports continue to display historical values.

---

### Referential Integrity

Before deleting or disabling records, the system shall verify active dependencies.

Examples:
- Departments with active People
- Locations with assigned Assets
- Positions assigned to People
- Companies with active operational records

---

### Acceptance Criteria

- Organizational hierarchy remains consistent.
- Cross-company references are prevented.
- Historical data is preserved.
- Validation prevents invalid assignments.

End of Chapter 9.

---

## Chapter 10 - Company Transfers & Organizational Changes

### Purpose

This chapter defines how organizational changes affect existing records while preserving history.

---

### Company Transfers

A Person may be transferred to another Company through an approved administrative action.

The transfer creates a new organizational assignment while preserving historical records.

Historical requests, approvals, assets and audit events remain linked to the original company context.

---

### Department Changes

Changing a Person's Department:

- Updates future workflow routing.
- Does not modify historical approvals.
- Does not alter completed requests.

---

### Position Changes

Position updates affect only current and future records.

Historical reports retain the position held at the time of the transaction where applicable.

---

### Organizational History

The system shall maintain an assignment history including:

- Company
- Department
- Position
- Location
- Effective date
- Changed by

---

### Audit

Audit events:
- Company transfer
- Department change
- Position change
- Location change

End of Chapter 10.

---

## Chapter 11 - Approval Role Assignments

### Purpose

Approval Role Assignments connect Approval Roles to System Users on a per-company basis.

This allows reusable workflows while keeping organizational responsibility configurable.

---

### Assignment Model

Each assignment contains:

- Company
- Approval Role
- System User
- Active Status
- Effective Date

Multiple users may be assigned to the same Approval Role.

---

### Workflow Resolution

When a workflow reaches an Approval Role step:

1. Determine the Company.
2. Locate active Approval Role assignments.
3. Apply the workflow approval rule:
   - Any assigned user
   - All assigned users

Department Head steps are resolved separately using Department Head assignments.

---

### Business Rules

- Assigned users must be active.
- Assigned users must belong to the same Company.
- Removing an assignment affects future requests only.
- Historical approvals remain unchanged.

---

### Administration

Administrators may:

- Assign users
- Remove assignments
- Activate assignments
- Deactivate assignments

Changes take effect immediately for new workflow instances.

---

### Audit

Audit events:
- Assignment created
- Assignment updated
- Assignment removed
- Assignment activated
- Assignment deactivated

End of Chapter 11.

---

## Chapter 12 - Validation, Permissions & Security

### Validation Rules

All organization records shall be validated before saving.

Validation includes:

- Required fields
- Duplicate names
- Company ownership
- Active references
- Circular relationship prevention

Server-side validation is mandatory.

---

### Permissions Matrix

System Administrator:
- Full access

IT Administrator:
- Configurable access

IT Support:
- View only unless explicitly granted

Read Only:
- View only

Approval Roles never grant administrative permissions.

---

### Security

Every create, update, enable, disable and assignment action shall:

- Verify authentication
- Verify authorization
- Validate input
- Record an audit event

---

### Error Handling

Validation failures return user-friendly messages.

Internal implementation details shall never be exposed.

---

### Acceptance Criteria

- Invalid organization data rejected.
- Unauthorized access prevented.
- Audit history preserved.
- Cross-company modifications blocked.

End of Chapter 12.

---

## Chapter 13 - Reporting, Governance & Acceptance

### Organizational Reporting

The Organization module shall support reporting by:

- Company
- Department
- Location
- Position
- Department Head
- Approval Role
- Active / Inactive status

These reports shall be available throughout the reporting module.

---

### Governance

The Organization module is the authoritative source for all organizational data used by Axivo.

Other modules shall reference organizational records and shall not duplicate Company, Department, Position or Location information.

---

### Change Management

Organizational changes shall affect only future business operations unless explicitly stated.

Historical approvals, requests, assignments and audit records shall remain unchanged.

---

### Acceptance Criteria

The Organization module is accepted when:

- Multi-company structure functions correctly.
- Department Head routing functions correctly.
- Approval Role assignments resolve correctly.
- Cross-company isolation is enforced.
- Historical data is preserved.
- All administrative actions are audited.

## End of Document 06.

---

## Chapter 14 - Future Expansion & Completion

### Future Expansion

The Organization module is designed to support future capabilities without major architectural changes.

Future enhancements may include:

- Business Units
- Cost Centres
- Regions
- Properties
- Organizational Charts
- Approval Delegation Rules
- Temporary Acting Department Heads

These additions shall extend the existing hierarchy without breaking existing relationships.

---

### Design Principles

Future organizational entities shall:

- Remain company-aware
- Preserve historical records
- Support audit logging
- Integrate with workflow routing
- Reuse existing authorization mechanisms

---

### Completion Criteria

Document 06 is complete when:

- Organizational hierarchy is fully defined.
- Company isolation is enforced.
- Approval routing is documented.
- Administrative behaviour is specified.
- Validation and security rules are complete.
- Reporting requirements are defined.

## End of Document 06.