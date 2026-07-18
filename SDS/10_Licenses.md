# Axivo Software Design Specification

# Document 10 - Licenses

## Chapter 1 - Licenses Module Overview

### Purpose

The Licenses module manages software licenses, subscriptions and entitlement tracking across all companies.

It records purchases, assignments, renewals and availability while integrating with Applications, People and Contracts.

---

### Objectives

- Centralize license management
- Track subscription and perpetual licenses
- Monitor license utilization
- Prevent over-assignment
- Support renewals and expiry tracking
- Preserve assignment history

---

### Module Scope

The module manages:

- License Definitions
- Subscription Licenses
- Perpetual Licenses
- License Assignments
- Renewal History
- Availability Tracking

---

### Relationships

Licenses integrate with:

- Companies
- Applications
- People
- Contracts
- Requests
- Reporting

---

### Design Principles

- Licenses belong to one Company.
- License history is immutable.
- Assignments are fully auditable.
- Renewals preserve historical pricing.

End of Chapter 1.


---

## Chapter 2 - License Definitions

### Purpose

License Definitions store the master record for every software license managed within Axivo.

---

### Core Fields

- Company
- Application
- License Name
- License Type
- Vendor
- License Key (optional)
- Active Status

---

### License Types

Supported types:

- Subscription
- Perpetual

Future types may be added without changing the data model.

---

### Relationships

Each License Definition belongs to:

- One Company
- One Application

A License Definition may have:

- Multiple Purchases
- Multiple Assignments
- Multiple Renewals

---

### Business Rules

- License names must be unique within the Company.
- Disabled licenses cannot receive new assignments.
- Historical records remain unchanged.

---

### Audit

Audit events:

- Create
- Update
- Enable
- Disable

End of Chapter 2.

---

## Chapter 3 - License Purchases

### Purpose

License Purchases record every acquisition of software licenses.

Each purchase remains permanently associated with its License Definition.

---

### Purchase Fields

- License Definition
- Purchase Type
- Quantity Purchased
- Purchase Date
- Start Date (Subscription)
- Expiry Date (Subscription)
- Purchase Price
- Currency
- Supplier
- Purchase Reference (optional)

---

### Purchase Types

Supported:

- New Purchase
- Renewal
- Additional Seats

---

### Business Rules

- Subscription licenses require Start and Expiry dates.
- Perpetual licenses require Purchase Date only.
- Purchase quantities cannot be negative.
- Historical purchase records cannot be edited after completion except through controlled administrative corrections.

---

### Availability

Available licenses are calculated as:

Purchased Quantity − Active Assignments

The system shall prevent over-assignment.

---

### Audit

Audit events:

- Purchase created
- Purchase updated
- Renewal recorded

End of Chapter 3.

---

## Chapter 4 - License Assignments

### Purpose

License Assignments record which employees consume software licenses.

Assignments preserve complete historical ownership.

---

### Assignment Fields

- Employee
- License
- Application
- Assignment Date
- Assignment Status
- Assigned By
- Notes (optional)

---

### Assignment Status

Supported values:

- Pending
- Active
- Suspended
- Removed

Historical assignments are never deleted.

---

### Business Rules

- Only active employees may receive new licenses.
- Available license count must be greater than zero before assignment.
- A removed assignment immediately returns the license to the available pool.
- Historical assignments remain visible.

---

### Availability Calculation

Available Licenses = Purchased Licenses − Active Assignments

The system shall prevent license over-allocation.

---

### Audit

Audit events:

- License assigned
- Assignment updated
- Assignment suspended
- Assignment removed

End of Chapter 4.

---

## Chapter 5 - Renewals & Expiry Management

### Purpose

This chapter defines how subscription licenses are renewed and monitored throughout their lifecycle.

---

### Renewal Information

Each renewal records:

- License
- Renewal Date
- New Start Date
- New Expiry Date
- Quantity
- Price
- Currency
- Supplier
- Notes (optional)

---

### Expiry Monitoring

The system shall monitor:

- Expired licenses
- Licenses expiring soon
- Renewals due

Reminder periods shall be configurable.

---

### Notifications

Notifications may be sent to:

- IT Administrators
- Assigned recipients
- Procurement (optional)

Notifications are generated before and after expiry based on configuration.

---

### Business Rules

- Only Subscription licenses require renewal.
- Perpetual licenses do not expire.
- Renewals preserve previous purchase history.
- Renewals update future availability without modifying historical records.

---

### Audit

Audit events:

- Renewal created
- Renewal updated
- Expiry reminder sent
- License expired

End of Chapter 5.

---

## Chapter 6 - Contract Integration

### Purpose

This chapter defines how software licenses integrate with the Contracts module.

---

### Contract Relationships

A License may optionally reference one Contract.

A Contract may cover:

- One License
- Multiple Licenses
- One Vendor
- Multiple Vendors (future)

---

### Shared Information

The License module may inherit:

- Supplier
- Renewal Date
- Contract Expiry
- Pricing
- Billing Frequency

Contract records remain the authoritative source.

---

### Renewal Behaviour

When a linked Contract is renewed:

- Contract history is updated.
- Related licenses reflect the new renewal period.
- Historical license purchases remain unchanged.

---

### Business Rules

- Contracts are optional.
- Removing a contract link does not delete license history.
- Contract expiry notifications complement license expiry notifications.

---

### Audit

Audit events:

- Contract linked
- Contract unlinked
- Contract renewal synchronized

End of Chapter 6.

---

## Chapter 7 - License Request Integration

### Purpose

This chapter defines how license assignments integrate with the Requests module.

---

### Request Flow

1. A requester submits one or more application requests.
2. The workflow completes all required approvals.
3. IT implements the requested access.
4. If the application requires a license, a License Assignment is created.
5. Available license count is updated automatically.

---

### Validation

Before assignment:

- License must exist.
- License must be active.
- Available quantity must be greater than zero.
- Employee must be active.

Requests fail gracefully if insufficient licenses are available.

---

### Workflow Behaviour

License assignment occurs during the IT Implementation stage after final approval.

No license is reserved before approval.

---

### Business Rules

- One request may assign multiple licenses.
- Each license assignment is audited.
- Historical assignments remain unchanged after removal.

---

### Audit

Audit events:

- License requested
- License assigned
- Assignment failed
- Availability updated

End of Chapter 7.

---

## Chapter 8 - Administration & Configuration

### Purpose

This chapter defines administrative management of licenses.

---

### Administration Features

Authorized administrators may:

- Create License Definitions
- Record Purchases
- Record Renewals
- Assign Licenses
- Remove Assignments
- Link Contracts
- Disable Licenses

---

### Validation

Before saving:

- Required fields validated
- Company consistency verified
- Purchase quantities validated
- Expiry dates validated
- Duplicate license names prevented

Server-side validation is mandatory.

---

### Availability Dashboard

The module shall display:

- Purchased
- Assigned
- Available
- Expiring Soon
- Expired

Values update automatically after assignment changes.

---

### Audit

Audit events:

- License modified
- Purchase recorded
- Assignment changed
- Contract linked
- Renewal recorded

End of Chapter 8.

---

## Chapter 9 - Search, Reporting & Analytics

### Purpose

This chapter defines reporting and analytical capabilities for license management.

---

### Search

Support searching by:

- License Name
- Application
- Employee
- Vendor
- License Key
- Company

Search shall be case-insensitive.

---

### Filters

Available filters:

- Company
- License Type
- Vendor
- Assignment Status
- Expiry Status
- Date Range

Filters may be combined.

---

### Reports

Standard reports include:

- License Utilization
- Available vs Assigned
- Expiring Licenses
- Expired Licenses
- License Costs
- Assignments by Application
- Vendor Summary

---

### Export

Authorized users may export filtered reports.

Supported export formats are configurable.

---

### Audit

Audit events:

- Report generated
- Export completed

End of Chapter 9.

---

## Chapter 10 - Validation, Permissions & Security

### Purpose

This chapter defines the security controls, validation rules and permission model for the Licenses module.

---

### Validation Rules

Before any license operation is completed, the system shall validate:

- Required fields
- Company ownership
- Valid Application reference
- Valid License Definition
- Positive purchase quantities
- Available license count before assignment
- Valid renewal dates
- Active employee for assignments

Server-side validation is mandatory.

---

### Permissions

System Administrator:
- Full access

IT Administrator:
- License management access where permitted

IT Support:
- Assignment management only where granted

Read Only:
- View only

---

### Security

Every create, update, assignment, renewal and removal action shall:

- Verify authentication
- Verify authorization
- Validate all input
- Record an immutable audit event

License keys shall be protected from unauthorized disclosure.

---

### Acceptance Criteria

- Over-allocation is prevented.
- Unauthorized modifications are rejected.
- License history is preserved.
- Audit records remain complete.

End of Chapter 10.

---

## Chapter 11 - License Lifecycle Management

### Purpose

This chapter defines how software licenses progress throughout their operational lifecycle.

---

### Lifecycle States

A License Definition may progress through:

- Draft
- Active
- Suspended
- Expired
- Retired

Purchase records and assignment history remain permanent.

---

### Assignment Lifecycle

Individual license assignments may transition through:

- Pending
- Active
- Suspended
- Removed

Removing an assignment returns the license to the available pool while preserving historical ownership.

---

### Retirement

When a license is retired:

- New purchases are prevented.
- New assignments are prevented.
- Existing historical assignments remain available.
- Historical reports remain unchanged.

---

### Business Rules

- Perpetual licenses never expire automatically.
- Subscription licenses may expire but remain visible historically.
- Retired licenses cannot be reactivated without administrative approval.

---

### Audit

Audit events:

- License activated
- License suspended
- License expired
- License retired
- Assignment removed

End of Chapter 11.

---

## Chapter 12 - Integration & Automation

### Purpose

This chapter defines how the Licenses module integrates with other Axivo modules and future automation platforms.

---

### Module Integrations

The Licenses module integrates with:

- Applications
- People
- Requests
- Contracts
- Notifications
- Reporting
- Audit

---

### Automation

The system may automatically:

- Calculate available licenses
- Update assignment counts
- Trigger renewal reminders
- Create renewal tasks
- Notify administrators of low availability

All automation shall respect authorization rules.

---

### Future Integrations

The design supports future integration with:

- Microsoft 365
- Microsoft Entra ID
- Google Workspace
- Adobe Admin Console
- Vendor licensing portals
- Procurement systems

---

### Business Rules

- Automated synchronization shall never overwrite historical records.
- Failed integrations shall not corrupt license assignments.
- Manual administrative control is always available.

---

### Acceptance Criteria

- Integrations operate independently.
- Automation preserves audit history.
- Historical license data remains unchanged.

End of Chapter 12.

---

## Chapter 13 - Governance, Reporting & Module Completion

### Governance

The Licenses module is the authoritative source for software licensing information within Axivo.

All license purchases, assignments and renewals shall be managed through this module.

---

### Governance Principles

The module shall:

- Preserve complete purchase history.
- Preserve assignment history.
- Prevent over-allocation.
- Maintain company isolation.
- Record every administrative action.

---

### Operational Reporting

Standard governance reports include:

- License compliance
- License utilization
- Expiring subscriptions
- Vendor expenditure
- Unassigned licenses
- Assignment history

---

### Future Expansion

The architecture supports future capabilities including:

- Automatic vendor synchronization
- Cost centre allocation
- Department chargeback
- Consumption forecasting
- SaaS usage analytics

---

### Acceptance Criteria

Document 10 is complete when:

- License lifecycle is fully documented.
- Assignment tracking is complete.
- Renewal management is defined.
- Security and validation requirements are satisfied.
- Reporting and governance requirements are complete.

## End of Document 10.

---

## Chapter 14 - Final Acceptance & Future Compatibility

### Future Compatibility

The Licenses module is designed to support future licensing models without changing the core architecture.

Future capabilities may include:

- Named and concurrent licensing
- Device-based licensing
- Automatic seat reclamation
- Vendor API synchronization
- AI-driven renewal forecasting
- Cost optimization recommendations

---

### Design Principles

Future enhancements shall:

- Preserve purchase history
- Preserve assignment history
- Maintain backward compatibility
- Respect company isolation
- Reuse existing audit mechanisms

---

### Final Acceptance Criteria

Document 10 is accepted when:

- License definitions are fully documented.
- Purchase, renewal and assignment lifecycles are complete.
- Availability calculations are defined.
- Security and validation requirements are complete.
- Reporting and governance requirements are satisfied.

## End of Document 10.