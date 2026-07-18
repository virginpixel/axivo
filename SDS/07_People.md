# Axivo Software Design Specification

# Document 07 - People

## Chapter 1 - People Module Overview

### Purpose

The People module is the central identity repository for every employee managed within Axivo.

Every operational module references People instead of duplicating employee information.

---

### Objectives

- Maintain a single employee record
- Support multi-company organizations
- Link employees to requests, assets, applications and licenses
- Preserve historical records
- Support future HR integrations

---

### Module Scope

The People module manages:

- Employee profiles
- Organizational assignments
- Contact information
- Employment status
- Application assignments
- Asset assignments
- License assignments
- Credential history

---

### Relationships

Each Person belongs to:

- One Company
- One Department
- One Position
- One Location

A Person may have:

- Many Requests
- Many Assets
- Many Applications
- Many Licenses
- Many Documents

---

### Design Principles

- Employee ID is the primary business identifier.
- Historical records are never overwritten.
- People may exist without portal accounts.

End of Chapter 1.


---

## Chapter 2 - Employee Profile

### Purpose

The Employee Profile stores the master record for every person within a Company.

---

### Core Fields

- Employee ID (required)
- First Name
- Last Name
- Company
- Department
- Position
- Location
- Email
- Phone (optional)
- Employment Status
- Active Status

---

### Business Rules

- Employee ID is required.
- Employee ID must be unique within the Company.
- Email must be valid.
- Company, Department, Position and Location must belong to the same Company.

---

### Employment Status

Supported values:

- Active
- On Leave
- Resigned
- Terminated

Inactive employees remain available for historical records.

---

### Relationships

Each Employee may have:

- One System User (optional)
- Multiple Application Assignments
- Multiple Asset Assignments
- Multiple License Assignments
- Multiple Requests
- Multiple Documents

---

### Audit

Audit events:
- Create
- Update
- Status Change
- Company Transfer

End of Chapter 2.

---

## Chapter 3 - System User Accounts

### Purpose

System User Accounts provide portal access for authorized employees.

A Person may exist without a System User account.

---

### Account Fields

- Linked Person
- Username
- System Role
- Active Status
- Last Login
- Password Changed Date

---

### Business Rules

- One System User per Person.
- Username must be globally unique.
- Passwords are stored only as secure hashes.
- Disabling an account prevents future logins but preserves history.

---

### Account Lifecycle

States:

- Active
- Disabled
- Locked (temporary rate limiting only)

Accounts are never permanently locked due to failed logins.

---

### Permissions

Only authorized administrators may:

- Create accounts
- Reset passwords
- Disable accounts
- Change System Roles

---

### Audit

Audit events:

- Account created
- Password reset
- Role changed
- Enabled
- Disabled
- Login
- Logout

End of Chapter 3.

---

## Chapter 4 - Contact Information

### Purpose

Contact information is used for notifications, workflow routing and credential delivery.

---

### Stored Information

Required:

- Work Email

Optional:

- Personal Email
- Mobile Number
- Extension
- Emergency Contact (future)

---

### Business Rules

- Work Email is required.
- Email addresses must be valid.
- Duplicate Work Emails within the same Company are not permitted.
- Email changes affect future notifications only.

---

### Notification Usage

The Work Email is used for:

- Credential acknowledgement
- Asset handover
- Clearance notifications
- Informational emails
- Future self-service features

---

### Validation

- RFC-compliant email validation
- Trim whitespace
- Case-insensitive uniqueness checks
- Server-side validation mandatory

---

### Audit

Audit events:

- Email updated
- Phone updated
- Contact information modified

End of Chapter 4.

---

## Chapter 5 - Employment Status & Lifecycle

### Purpose

This chapter defines how employee records progress throughout their employment while preserving historical data.

---

### Employment Statuses

Supported values:

- Active
- On Leave
- Suspended
- Resigned
- Terminated

Status values are configurable by administrators.

---

### Lifecycle Rules

Employees may move between statuses.

Historical requests, approvals, assets, documents and audit records remain unchanged regardless of status changes.

---

### Deactivation

Inactive employees:

- Cannot receive new assignments.
- Cannot receive new credentials.
- Cannot be selected for future requests where inappropriate.
- Remain available in historical reports.

---

### Reactivation

Administrators may reactivate eligible employees.

Previous relationships remain intact.

---

### Audit

Audit events:

- Status changed
- Employee reactivated
- Employee deactivated

End of Chapter 5.

---

## Chapter 6 - Organizational Assignments

### Purpose

Organizational Assignments define where an employee belongs within the company structure.

---

### Assignment Fields

- Company
- Department
- Position
- Location
- Effective Date
- Active Status

---

### Business Rules

- Every employee must belong to one Company.
- Department, Position and Location must belong to the same Company.
- Only one active organizational assignment is allowed at a time.
- Historical assignments are preserved.

---

### Organizational Changes

Changes to Company, Department, Position or Location create a new assignment history entry.

Historical requests, approvals and audit records continue to reference the assignment that existed at the time.

---

### Workflow Impact

Future workflow approvals use the employee's current organizational assignment.

Completed workflows are never recalculated.

---

### Audit

Audit events:

- Assignment created
- Department changed
- Position changed
- Location changed
- Company transferred

End of Chapter 6.

---

## Chapter 7 - Application, Asset & License Relationships

### Purpose

This chapter defines how People interact with operational modules.

---

### Application Assignments

Each employee may have multiple application assignments.

Stored information includes:
- Application
- Role
- Username
- Assignment Status
- Assigned Date

Passwords are never stored permanently.

---

### Asset Assignments

Employees may be assigned:

- Laptops
- Phones
- Tablets
- SIM Cards
- Other company assets

Asset history is permanently preserved.

---

### License Assignments

Employees may receive:

- Subscription licenses
- Perpetual licenses

Assignments maintain historical ownership.

---

### Business Rules

- Only active employees receive new assignments.
- Completed assignments remain historical.
- Removing an assignment never deletes history.

---

### Audit

Audit events:

- Application assigned
- Asset assigned
- Asset returned
- License assigned
- License removed

End of Chapter 7.

---

## Chapter 8 - Requests & Workflow Relationships

### Purpose

Every request within Axivo references People through two distinct roles.

---

### Request Participants

Each request contains:

- Requester
- Requested For

The same person may occupy both roles.

Both users require valid work email addresses.

---

### Requester

The Requester:

- Creates the request
- Receives rejection notifications
- Receives correction requests
- Resubmits corrected requests

---

### Requested For

The Requested For employee:

- Receives credential acknowledgement emails
- Receives asset handover emails
- Receives future user notifications

---

### Business Rules

- Requester and Requested For may be different people.
- Historical participant information is preserved.
- Company validation is enforced unless future cross-company workflows are supported.

---

### Workflow Resolution

Approval routing is based on the Requested For employee's current organizational assignment at the time the workflow starts.

Completed approvals are never recalculated.

---

### Audit

Audit events:

- Request submitted
- Request corrected
- Request cancelled
- Request completed

End of Chapter 8.

---

## Chapter 9 - Credential Delivery History

### Purpose

This chapter defines how credential deliveries are associated with People.

---

### Stored Information

Each delivery records:

- Employee
- Application
- Username
- Custom Fields
- Delivery Status
- Sent Date
- Acknowledged Date
- Expiry Date

Passwords are never permanently stored.

---

### Delivery States

- Pending
- Delivered
- Acknowledged
- Expired
- Revoked

---

### Business Rules

- Only active employees may receive new credentials.
- Credentials are delivered using secure email links.
- Acknowledgement permanently records receipt.
- Expired secrets cannot be viewed again.

---

### Resending

IT may resend credentials.

If the viewing period has expired, new secrets must be entered before delivery.

---

### Audit

Audit events:

- Credentials sent
- Credentials acknowledged
- Credentials resent
- Delivery revoked

End of Chapter 9.

---

## Chapter 10 - Documents & History

### Purpose

This chapter defines how People relate to generated and uploaded documents.

---

### Associated Documents

A Person may be linked to:

- Asset Handover Forms
- Clearance Forms
- Credential Deliveries
- Application Requests
- Supporting Documents

A single document may be linked to multiple records where applicable.

---

### Historical Preservation

Documents remain permanently associated with the employee even if:

- Department changes
- Position changes
- Company transfer occurs
- Employment ends

Historical documents are never modified.

---

### Document Access

Access depends on:

- System Role
- Company
- Record permissions

Unauthorized users cannot access linked documents.

---

### Audit

Audit events:

- Document linked
- Document viewed
- Document downloaded
- Document association updated

---

### Acceptance Criteria

- Historical documents remain accessible.
- Employee history is preserved.
- Document permissions are enforced.

End of Chapter 10.

---

## Chapter 11 - Search, Filters & Reporting

### Purpose

The People module provides fast search and reporting across all employee records.

---

### Search

Support searching by:

- Employee ID
- Name
- Email
- Company
- Department
- Position
- Location

Search shall be case-insensitive.

---

### Filters

Available filters:

- Company
- Department
- Position
- Location
- Employment Status
- Active Status

Filters may be combined.

---

### Reporting

Reports include:

- Employees by Company
- Employees by Department
- Employees by Position
- Active vs Inactive Employees
- Employees without System Accounts
- Employees with Assigned Assets
- Employees with Assigned Applications

---

### Export

Authorized users may export filtered results to supported formats.

---

### Audit

Audit events:

- Report generated
- Export completed

End of Chapter 11.

---

## Chapter 12 - Validation, Permissions & Security

### Validation Rules

All People records shall be validated before being saved.

Validation includes:

- Required fields
- Employee ID uniqueness within Company
- Valid email format
- Company consistency
- Active organizational references

Server-side validation is mandatory.

---

### Permissions

System Administrator:
- Full access

IT Administrator:
- Configurable create, edit and view permissions

IT Support:
- View and limited update permissions where granted

Read Only:
- View only

---

### Security

Every create, update, transfer, activation and deactivation shall:

- Verify authentication
- Verify authorization
- Validate input
- Record an audit event

---

### Privacy

Personally identifiable information shall only be visible to authorized users.

Sensitive information shall never be exposed through logs or client-side code.

---

### Acceptance Criteria

- Invalid employee data rejected.
- Unauthorized changes prevented.
- Historical records preserved.
- Audit history maintained.

End of Chapter 12.

---

## Chapter 13 - Governance, Future Expansion & Acceptance

### Governance

The People module is the authoritative source for employee identity within Axivo.

No other module shall duplicate employee master data.

---

### Future Expansion

The design supports future additions including:

- HR system synchronization
- Microsoft Entra ID integration
- LDAP integration
- Employee self-service
- Manager hierarchy
- Profile photos
- Skills and certifications
- Emergency contacts

These additions shall extend the existing data model without affecting historical records.

---

### Change Management

Future enhancements shall:

- Preserve audit history
- Maintain backward compatibility
- Reuse existing authorization
- Respect company boundaries

---

### Acceptance Criteria

The People module is accepted when:

- Employee identity is centralized.
- Organizational relationships function correctly.
- Historical data is preserved.
- Credential relationships are maintained.
- Security and validation requirements are satisfied.
- Reporting requirements are met.

## End of Document 07.

---

## Chapter 14 - Data Quality & Operational Controls

### Purpose

This chapter defines the operational controls used to maintain accurate employee information.

---

### Data Quality Rules

Administrators shall periodically review:

- Duplicate Employee IDs
- Missing Work Emails
- Inactive organizational references
- Employees without Departments
- Employees without Positions
- Employees without Locations

---

### Operational Controls

The system shall support:

- Bulk import (future)
- Bulk export
- Duplicate detection
- Employee merge (future)
- Validation reports

---

### Notifications

Administrators may receive reminders for:

- Missing mandatory information
- Invalid organizational assignments
- Employees requiring review

---

### Acceptance Criteria

- Employee records remain accurate.
- Invalid data is identified.
- Operational reviews are supported.
- Data quality reports are available.

End of Chapter 14.

---

## Chapter 15 - Module Completion

### Completion Criteria

Document 07 is complete when:

- Employee records are centralized.
- Company relationships are enforced.
- Organizational assignments are preserved.
- Application, asset and license relationships are documented.
- Request and credential relationships are defined.
- Security, validation and auditing requirements are satisfied.
- Reporting and governance requirements are complete.

### Future Compatibility

Future enhancements shall not compromise:

- Historical records
- Audit history
- Company isolation
- Referential integrity
- Existing workflows

The module shall remain backward compatible with future HR and identity integrations wherever practical.

## End of Document 07.