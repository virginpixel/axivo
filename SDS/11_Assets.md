# Axivo Software Design Specification

# Document 11 - Assets

## Chapter 1 - Assets Module Overview

### Purpose

The Assets module manages all company-owned physical assets throughout their lifecycle.

It tracks procurement, assignment, movement, maintenance, handover, clearance and disposal while maintaining a complete audit history.

---

### Objectives

- Centralize asset management
- Support multiple asset categories
- Track asset ownership and location
- Integrate with Requests and People
- Maintain full assignment history
- Support disposal and lifecycle reporting

---

### Module Scope

The module manages:

- Asset Definitions
- Asset Categories
- Asset Assignments
- Asset Movements
- Maintenance Records
- Handover & Clearance
- Disposal Records

---

### Relationships

Assets integrate with:

- Companies
- People
- Requests
- Organization
- Documents
- Reporting
- Audit

---

### Design Principles

- Every asset belongs to one Company.
- Asset Tags are the primary business identifier.
- Historical records are never deleted.
- Every asset action is fully auditable.

End of Chapter 1.


---

## Chapter 2 - Asset Definitions

### Purpose

Asset Definitions store the master record for every physical asset managed within Axivo.

Each asset represents an individually tracked company-owned item.

---

### Core Fields

- Company
- Asset Tag
- Serial Number
- Manufacturer
- Model
- Category
- Status
- Current Location
- Supplier
- Purchase Date
- Purchase Price
- Warranty Expiry (optional)
- Notes (optional)

---

### Relationships

Each Asset belongs to:

- One Company
- One Asset Category

An Asset may have:

- Multiple Assignments
- Multiple Maintenance Records
- Multiple Documents
- One Disposal Record

---

### Business Rules

- Asset Tag must be unique within the Company.
- Serial Number should be unique where available.
- Disabled or disposed assets cannot receive new assignments.
- Historical records remain unchanged.

---

### Audit

Audit events:

- Asset created
- Asset updated
- Status changed
- Asset retired

End of Chapter 2.

---

## Chapter 3 - Asset Categories

### Purpose

Asset Categories organize assets into logical groups for management, reporting and workflow automation.

---

### Standard Categories

Default categories include:

- Laptop
- Desktop
- Monitor
- Mobile Phone
- Tablet
- Printer
- Network Equipment
- Server
- Storage
- Peripheral
- SIM Card
- Other

Administrators may create additional categories.

---

### Category Fields

- Category Name
- Description
- Active Status
- Require Handover Acceptance (Yes/No)
- Require Clearance Recovery (Yes/No)

---

### Business Rules

- Category names must be unique within a Company.
- Disabling a category prevents new asset creation but preserves existing assets.
- Category settings become defaults for newly created assets.

---

### Workflow Integration

Categories determine whether:

- Asset handover forms are required.
- Employee acknowledgement is required.
- Clearance recovery is required.

---

### Audit

Audit events:

- Category created
- Category updated
- Category enabled
- Category disabled

End of Chapter 3.

---

## Chapter 4 - Asset Status & Lifecycle

### Purpose

This chapter defines the operational lifecycle of every asset managed within Axivo.

---

### Asset Statuses

Supported statuses:

- Available
- Assigned
- Under Repair
- Out of Order
- Reserved
- Discarded

Historical status changes are preserved.

---

### Lifecycle

An asset typically progresses through:

1. Procured
2. Available
3. Assigned
4. Returned
5. Reassigned
6. Under Repair (optional)
7. Available
8. Discarded

Not every asset follows every stage.

---

### Business Rules

- Discarded assets cannot be reassigned.
- Assets under repair cannot be assigned.
- Only Available assets may receive new assignments.
- Status changes are fully audited.

---

### Disposal

Before an asset becomes Discarded:

- Required approvals must be completed.
- Disposal documentation must be linked.
- Assignment history remains permanently available.

---

### Audit

Audit events:

- Status changed
- Asset assigned
- Asset returned
- Repair started
- Repair completed
- Asset discarded

End of Chapter 4.

---

## Chapter 5 - Asset Assignments

### Purpose

Asset Assignments record which employee is responsible for each company asset.

Assignment history is permanently preserved.

---

### Assignment Fields

- Asset
- Employee
- Assignment Date
- Return Date (optional)
- Assignment Status
- Assigned By
- Current Location
- Notes (optional)

---

### Assignment Status

Supported values:

- Pending
- Assigned
- Returned
- Cancelled

Historical assignments are never deleted.

---

### Business Rules

- Only Available assets may be assigned.
- Only Active employees may receive assignments.
- An asset may have only one active assignment at a time.
- Returning an asset automatically changes its status to Available unless another operational status applies.

---

### Handover Integration

If the Asset Category requires acknowledgement:

- A handover document is generated.
- The employee must acknowledge receipt.
- The assignment becomes fully completed after acknowledgement.

---

### Audit

Audit events:

- Asset assigned
- Assignment acknowledged
- Asset returned
- Assignment cancelled

End of Chapter 5.

---

## Chapter 6 - Asset Handover

### Purpose

This chapter defines the electronic handover process for assets assigned to employees.

---

### Handover Process

1. Asset assignment is completed by IT.
2. A handover document is generated.
3. A secure email is sent to the employee.
4. The employee reviews the assigned assets.
5. The employee acknowledges receipt electronically.
6. The completed handover document is stored permanently.

---

### Handover Contents

Each handover includes:

- Employee details
- Asset Tag
- Serial Number
- Manufacturer
- Model
- Assignment Date
- Terms of Responsibility
- Electronic acknowledgement
- Timestamp

---

### Business Rules

- Only categories configured to require acknowledgement generate handover documents.
- A single handover may contain multiple assets.
- Acknowledgement is recorded only once.
- Historical handover documents are immutable.

---

### Audit

Audit events:

- Handover generated
- Email sent
- Handover acknowledged
- Document archived

End of Chapter 6.

---

## Chapter 7 - Asset Clearance Process

### Purpose

This chapter defines the clearance process used when an employee leaves the organization or transfers responsibility.

---

### Clearance Process

1. Clearance request is initiated.
2. All assigned assets are identified automatically.
3. IT verifies each asset.
4. Each asset is marked as:
   - Received
   - Missing
   - Damaged
5. Clearance is completed.
6. Clearance document is archived.

---

### Clearance Document

The document includes:

- Employee details
- Asset inventory
- Asset condition
- Return status
- IT representative
- Employee acknowledgement (optional)
- Completion timestamp

---

### Business Rules

- Only assets actively assigned to the employee appear.
- Historical assignments remain unchanged.
- Missing or damaged assets require comments.
- Clearance completion updates assignment status where applicable.

---

### Integration

Completed clearance records become part of the employee's permanent history and are available from both the People and Assets modules.

---

### Audit

Audit events:

- Clearance started
- Asset verified
- Clearance completed
- Clearance document archived

End of Chapter 7.

---

## Chapter 8 - Maintenance & Repairs

### Purpose

This chapter defines how maintenance and repair activities are recorded throughout an asset's lifecycle.

---

### Maintenance Record

Each maintenance entry records:

- Asset
- Maintenance Type
- Description
- Service Provider
- Start Date
- Completion Date
- Cost (optional)
- Status
- Notes

---

### Maintenance Status

Supported values:

- Scheduled
- In Progress
- Completed
- Cancelled

---

### Business Rules

- Assets under maintenance cannot be assigned.
- Completing maintenance restores the previous operational status unless manually changed.
- All maintenance history is permanently preserved.
- Multiple maintenance records may exist for a single asset.

---

### Reporting

Maintenance history is available from:

- Asset details
- Asset reports
- Cost reports
- Audit history

---

### Audit

Audit events:

- Maintenance created
- Maintenance started
- Maintenance completed
- Maintenance cancelled

End of Chapter 8.

---

## Chapter 9 - Asset Disposal & Retirement

### Purpose

This chapter defines the controlled retirement and disposal process for company assets.

---

### Disposal Process

1. Asset is identified for disposal.
2. Disposal approval request is completed.
3. Supporting disposal documentation is attached.
4. Asset status changes to Discarded.
5. Asset is retained for historical reporting.

---

### Disposal Record

Each disposal records:

- Asset
- Disposal Date
- Disposal Method
- Disposal Reason
- Disposal Value (optional)
- Approved By
- Linked Disposal Document
- Notes (optional)

---

### Business Rules

- Assets cannot be discarded while actively assigned.
- A completed disposal document is required before the status changes to Discarded.
- Discarded assets cannot be reassigned.
- Historical assignments, maintenance and handover records remain unchanged.

---

### Reporting

Disposed assets remain available in:

- Asset history
- Financial reports
- Audit reports
- Disposal reports

---

### Audit

Audit events:

- Disposal initiated
- Disposal approved
- Disposal document linked
- Asset discarded

End of Chapter 9.

---

## Chapter 10 - Search, Reporting & Analytics

### Purpose

This chapter defines search, reporting and analytical capabilities for the Assets module.

---

### Search

Support searching by:

- Asset Tag
- Serial Number
- Manufacturer
- Model
- Employee
- Company
- Category
- Status

Search shall be case-insensitive.

---

### Filters

Available filters:

- Company
- Category
- Status
- Location
- Assigned Employee
- Purchase Date
- Warranty Status

Filters may be combined.

---

### Reports

Standard reports include:

- Assets by Category
- Assets by Company
- Assigned vs Available Assets
- Asset Age
- Warranty Expiry
- Maintenance History
- Disposed Assets
- Asset Value Summary

---

### Export

Authorized users may export filtered reports in supported formats.

---

### Audit

Audit events:

- Report generated
- Export completed

End of Chapter 10.

---

## Chapter 11 - Validation, Permissions & Security

### Purpose

This chapter defines the validation rules, permission model and security controls for the Assets module.

---

### Validation Rules

Before any asset operation is completed, the system shall validate:

- Required fields
- Unique Asset Tag within the Company
- Valid Company ownership
- Valid Asset Category
- Active employee before assignment
- Asset availability before assignment
- Disposal prerequisites before retirement

Server-side validation is mandatory.

---

### Permissions

System Administrator:
- Full access

IT Administrator:
- Full asset management where permitted

IT Support:
- Asset assignment, handover and maintenance management where granted

Read Only:
- View only

---

### Security

Every create, update, assignment, return, maintenance and disposal action shall:

- Verify authentication
- Verify authorization
- Validate all input
- Record an immutable audit event

Asset history shall never be permanently deleted.

---

### Acceptance Criteria

- Unauthorized operations are prevented.
- Invalid asset records are rejected.
- Historical asset records are preserved.
- Audit history remains complete.

End of Chapter 11.

---

## Chapter 12 - Integration & Automation

### Purpose

This chapter defines how the Assets module integrates with other Axivo modules and future automation services.

---

### Module Integrations

The Assets module integrates with:

- People
- Organization
- Requests
- Documents
- Notifications
- Reporting
- Audit

---

### Workflow Automation

After final approval of an asset request:

1. IT assigns the asset.
2. The asset status changes to Assigned.
3. A handover document is generated if required.
4. A secure acknowledgement email is sent.
5. Assignment history is updated automatically.

---

### Future Integrations

The architecture supports future integration with:

- Barcode scanners
- QR code scanners
- RFID asset tracking
- Procurement systems
- ERP platforms
- Mobile inventory applications

---

### Business Rules

- Automation shall never bypass approvals.
- Failed integrations shall not alter historical records.
- Manual administrative control shall always remain available.

---

### Acceptance Criteria

- Module integrations function correctly.
- Automated asset workflows preserve audit history.
- Historical asset information remains unchanged.

End of Chapter 12.

---

## Chapter 13 - Governance, Future Expansion & Operational Controls

### Governance

The Assets module is the authoritative source for all physical asset records within Axivo.

All asset lifecycle events shall be managed through this module.

---

### Operational Controls

Administrators shall periodically review:

- Unassigned assets
- Long-term assigned assets
- Assets under repair
- Warranty expirations
- Missing acknowledgements
- Assets pending disposal

---

### Future Expansion

The architecture supports future capabilities including:

- GPS asset tracking
- IoT device monitoring
- Automated depreciation
- Mobile asset audits
- NFC asset identification
- Predictive maintenance scheduling

Future enhancements shall preserve all historical records.

---

### Governance Principles

The module shall:

- Preserve assignment history
- Preserve maintenance history
- Preserve disposal history
- Maintain company isolation
- Record all administrative actions

---

### Acceptance Criteria

- Asset governance is fully documented.
- Operational controls are defined.
- Future expansion remains backward compatible.
- Historical records remain immutable.

End of Chapter 13.

---

## Chapter 14 - Final Acceptance & Future Compatibility

### Future Compatibility

The Assets module is designed to support future asset management capabilities without changing the core architecture.

Future enhancements may include:

- Automated procurement integration
- Asset depreciation calculations
- Vendor warranty synchronization
- Self-service asset requests
- Mobile stocktaking
- AI-assisted lifecycle planning

---

### Design Principles

Future enhancements shall:

- Preserve asset history
- Preserve assignment history
- Preserve maintenance history
- Maintain backward compatibility
- Respect company isolation
- Reuse the existing audit framework

---

### Final Acceptance Criteria

Document 11 is accepted when:

- Asset lifecycle is fully documented.
- Assignment, handover and clearance processes are complete.
- Maintenance and disposal procedures are defined.
- Security and validation requirements are satisfied.
- Reporting and governance requirements are complete.
- Future compatibility requirements are documented.

## End of Document 11.

---

## Chapter 15 - Module Completion

### Completion Criteria

Document 11 is complete when:

- Asset definitions are centralized.
- Asset categories and lifecycle rules are fully documented.
- Assignment, handover and clearance processes are complete.
- Maintenance and disposal workflows are defined.
- Security, validation and permission requirements are satisfied.
- Reporting, governance and operational controls are documented.
- Future expansion remains backward compatible.

---

### Architectural Principles

The Assets module shall continue to:

- Preserve complete historical records.
- Maintain immutable audit history.
- Enforce company isolation.
- Integrate with Requests, People and Organization.
- Support future asset management capabilities without redesign.

## End of Document 11.