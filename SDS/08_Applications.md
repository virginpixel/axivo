# Axivo Software Design Specification

# Document 08 - Applications

## Chapter 1 - Applications Module Overview

### Purpose

The Applications module manages all business systems that employees may access.

It centralizes application definitions, application roles, credential metadata and assignment history.

---

### Objectives

- Maintain a single application catalogue
- Support company-specific applications
- Support application role templates
- Store usernames only
- Deliver credentials securely
- Preserve assignment history

---

### Module Scope

The module manages:

- Applications
- Application Roles
- Assignment Templates
- User Assignments
- Credential Metadata
- Custom Credential Fields

---

### Relationships

Applications are linked to:

- Companies
- People
- Requests
- Credential Deliveries
- Workflows

---

### Design Principles

- Passwords are never stored permanently.
- Applications belong to one Company.
- Historical assignments are preserved.

End of Chapter 1.


---

## Chapter 2 - Application Definitions

### Purpose

Application Definitions store the master record for every business application.

---

### Core Fields

- Company
- Application Name
- Description
- Category (optional)
- Active Status
- Login URL (optional)
- Icon (optional)

---

### Relationships

Each Application belongs to one Company.

Each Application may have:

- Multiple Application Roles
- Multiple User Assignments
- Multiple Credential Deliveries
- Multiple Request Items

---

### Business Rules

- Application names must be unique within the Company.
- Disabled Applications cannot be requested.
- Historical assignments remain unchanged.

---

### Permissions

Authorized administrators may:

- Create Applications
- Edit Applications
- Disable Applications

---

### Audit

Audit events:

- Create
- Update
- Enable
- Disable

End of Chapter 2.

---

## Chapter 3 - Application Roles

### Purpose

Application Roles define the access levels available within an Application.

---

### Role Fields

- Application
- Role Name
- Description
- Active Status

Examples:

- User
- Supervisor
- Manager
- Administrator

---

### Relationships

Each Application Role belongs to one Application.

Roles may be referenced by:

- Request Items
- Application Assignments
- Credential Deliveries

---

### Business Rules

- Role names must be unique within an Application.
- Disabled Roles cannot be assigned to new users.
- Historical assignments remain unchanged.

---

### Workflow Integration

Application Roles appear as selectable options in request forms.

Each requested application may specify a different role.

---

### Audit

Audit events:

- Create
- Update
- Enable
- Disable

End of Chapter 3.

---

## Chapter 4 - Custom Credential Fields

### Purpose

Applications may define additional credential fields required during implementation.

These fields allow IT to deliver application-specific information alongside usernames and temporary passwords.

---

### Supported Field Types

- Text
- URL
- Number
- Email
- Company Code
- Tenant ID
- API Endpoint
- Notes

Future versions may support additional field types.

---

### Field Properties

Each field contains:

- Field Name
- Field Type
- Required Status
- Display Order
- Help Text
- Active Status

---

### Business Rules

- Username is always available.
- Password is always temporary and never stored permanently.
- Custom fields are defined per Application.
- Required fields must be completed before credential delivery.

---

### Credential Delivery

Credential emails display:

- Username
- Temporary Password
- All configured custom fields

After acknowledgement and expiry, only the username and non-secret custom fields remain available.

---

### Audit

Audit events:

- Field created
- Field updated
- Field enabled
- Field disabled

End of Chapter 4.

---

## Chapter 5 - Application Assignments

### Purpose

Application Assignments record which employees have access to which applications.

---

### Assignment Fields

- Employee
- Application
- Application Role
- Username
- Assignment Status
- Assigned Date
- Implemented By

Passwords are never stored permanently.

---

### Assignment Status

Supported values:

- Pending
- Active
- Suspended
- Removed

---

### Business Rules

- Only active employees may receive new assignments.
- One employee may have multiple applications.
- An application may be assigned multiple times only if explicitly supported by the application configuration.
- Historical assignments are never deleted.

---

### Credential Relationship

Each assignment may reference multiple credential deliveries over time.

Only the latest username remains current.

---

### Audit

Audit events:

- Assignment created
- Assignment updated
- Assignment suspended
- Assignment removed
- Username changed

End of Chapter 5.

---

## Chapter 6 - Credential Delivery Workflow

### Purpose

Credential Delivery securely provides application access details to employees after implementation.

---

### Delivery Process

1. IT completes implementation.
2. Username and temporary password are entered.
3. Application-specific custom fields are completed.
4. Secure acknowledgement email is sent.
5. Employee acknowledges receipt.
6. Credentials are revealed.
7. Temporary password expires automatically.

---

### Delivery Rules

- Passwords are never stored permanently.
- Usernames remain associated with the assignment.
- Custom non-secret fields remain available.
- Expired passwords cannot be viewed again.

---

### Resend Behaviour

IT may resend credentials.

If the previous temporary password is still valid:
- Reuse existing temporary password, or
- Generate a new one.

If expired:
- A new temporary password is required.

---

### Audit

Audit events:

- Delivery created
- Delivery sent
- Credentials acknowledged
- Delivery resent
- Delivery expired

End of Chapter 6.

---

## Chapter 7 - Request Integration

### Purpose

The Applications module integrates with the Request module to automate application provisioning.

---

### Request Flow

1. Employee selects one or more applications.
2. Appropriate Application Roles are selected.
3. Individual workflows execute for each requested application.
4. IT implements approved applications.
5. Credential deliveries are generated.

---

### Independent Processing

Each requested application maintains its own:

- Approval history
- Correction requests
- Implementation status
- Credential delivery
- Audit history

Applications within the same request do not depend on each other.

---

### Workflow Behaviour

Different applications may use different workflows.

Examples:

- Email: HOD → IT Approval → GM → IT Implementation
- HR System: HOD → HR → IT Approval → GM → IT Implementation

---

### Audit

Audit events:

- Application requested
- Workflow started
- Workflow completed
- Implementation completed

End of Chapter 7.

---

## Chapter 8 - Administration & Configuration

### Purpose

The Applications module provides centralized administration of all application definitions and access templates.

---

### Administration Features

Administrators may:

- Create Applications
- Edit Applications
- Disable Applications
- Configure Application Roles
- Configure Custom Credential Fields
- Configure Login URLs
- Configure Icons

---

### Assignment Management

Authorized IT users may:

- View assignments
- Change usernames
- Suspend assignments
- Remove assignments
- Resend credentials

Passwords are never viewable after expiry.

---

### Validation

Before saving:

- Required fields validated
- Duplicate application names prevented
- Duplicate role names prevented
- Required custom fields verified

Server-side validation is mandatory.

---

### Audit

Audit events:

- Configuration updated
- Assignment modified
- Credentials resent
- Username changed

End of Chapter 8.

---

## Chapter 9 - Search, Reporting & Auditing

### Purpose

The Applications module provides comprehensive visibility into application usage across the organization.

---

### Search

Support searching by:

- Application Name
- Employee Name
- Employee ID
- Username
- Company
- Application Role

Search shall be case-insensitive.

---

### Filters

Available filters:

- Company
- Application
- Assignment Status
- Application Role
- Department
- Date Range

Filters may be combined.

---

### Reports

Standard reports include:

- Applications by Company
- Users by Application
- Users by Role
- Pending Implementations
- Credential Deliveries
- Inactive Assignments

---

### Export

Authorized users may export filtered reports.

---

### Audit

Audit events:

- Report generated
- Export completed
- Search performed (optional)

End of Chapter 9.

---

## Chapter 10 - Validation, Permissions & Security

### Validation Rules

All application records and assignments shall be validated before saving.

Validation includes:

- Required fields
- Company ownership
- Valid Application Role
- Active employee
- Active application
- Valid username format where applicable

Server-side validation is mandatory.

---

### Permissions

System Administrator:
- Full access

IT Administrator:
- Configurable management access

IT Support:
- Assignment management where permitted

Read Only:
- View only

---

### Security

Every create, update, assignment and credential delivery action shall:

- Verify authentication
- Verify authorization
- Validate input
- Record an audit event

Passwords shall never be exposed after expiry.

---

### Acceptance Criteria

- Invalid assignments rejected.
- Unauthorized changes prevented.
- Credential security maintained.
- Audit history preserved.

End of Chapter 10.

---

## Chapter 11 - Lifecycle Management

### Purpose

This chapter defines how application access changes throughout an employee's lifecycle.

---

### Assignment Lifecycle

Application assignments may transition through:

- Pending
- Approved
- Implemented
- Active
- Suspended
- Removed

Historical records are never deleted.

---

### Employee Changes

When an employee:

- Changes Department
- Changes Position
- Transfers Company
- Leaves the organization

Existing assignments remain historical.

Future access requests use the employee's current organizational information.

---

### Application Retirement

When an Application is disabled:

- New requests are prevented.
- Existing assignments remain visible.
- Historical reports remain available.

---

### Access Removal

Removing access:

- Preserves history
- Records removal reason
- Records removal date
- Generates audit events

---

### Audit

Audit events:

- Assignment activated
- Assignment suspended
- Assignment removed
- Application retired

End of Chapter 11.

---

## Chapter 12 - Integration & Automation

### Purpose

This chapter defines how the Applications module integrates with other Axivo modules.

---

### Module Integrations

The Applications module integrates with:

- People
- Requests
- Workflows
- Credential Delivery
- Audit
- Notifications
- Reporting

---

### Workflow Automation

After final workflow approval:

1. IT receives the implementation task.
2. IT provisions the application.
3. Credentials are entered.
4. Secure acknowledgement email is generated.
5. Assignment becomes Active after completion.

---

### Future Integrations

The design supports future integration with:

- Microsoft Entra ID
- Active Directory
- LDAP
- SCIM
- HR Systems
- Identity Management Platforms

---

### Business Rules

- Automation shall never bypass approvals.
- External synchronization shall preserve audit history.
- Failed integrations shall not corrupt assignments.

---

### Acceptance Criteria

- Module integrations function correctly.
- Workflow automation is preserved.
- Historical records remain intact.

End of Chapter 12.

---

## Chapter 13 - Governance, Future Expansion & Acceptance

### Governance

The Applications module is the authoritative source for all business application definitions and application assignments within Axivo.

No other module shall duplicate application metadata.

---

### Future Expansion

The design supports future enhancements including:

- Automated account provisioning
- Automated account deprovisioning
- Role synchronization
- SSO integration
- SCIM provisioning
- License optimization
- Usage analytics

Future enhancements shall preserve existing assignment history and audit records.

---

### Change Management

Future enhancements shall:

- Preserve historical records
- Maintain backward compatibility
- Reuse existing workflow engine
- Respect company isolation

---

### Acceptance Criteria

The Applications module is accepted when:

- Application definitions are centralized.
- Assignment history is preserved.
- Credential delivery functions correctly.
- Workflow integration is complete.
- Security requirements are satisfied.
- Reporting requirements are met.

## End of Document 08.

---

## Chapter 14 - Operational Controls & Module Completion

### Operational Controls

Administrators shall periodically review:

- Unused application assignments
- Suspended assignments
- Orphaned usernames
- Disabled applications with active assignments
- Pending implementations
- Expired credential deliveries

---

### Administrative Reports

Support reports for:

- Applications requiring review
- Users with multiple assignments
- Unimplemented approved requests
- Credential delivery status
- Assignment trends

---

### Operational Principles

The Applications module shall:

- Preserve all historical assignments.
- Never permanently store passwords.
- Maintain complete audit history.
- Respect company boundaries.
- Support future automation.

---

### Completion Criteria

Document 08 is complete when:

- Application management is fully defined.
- Assignment lifecycle is documented.
- Credential delivery is specified.
- Workflow integration is complete.
- Security and validation requirements are satisfied.
- Reporting and governance requirements are complete.

## End of Document 08.