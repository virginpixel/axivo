# Axivo Software Design Specification

# Document 09 - Requests

## Chapter 1 - Requests Module Overview

### Purpose

The Requests module manages all business requests submitted through Axivo.

It provides a single workflow engine for application access, asset requests, role changes, handovers and future request types.

---

### Objectives

- Single request platform
- Support multiple request types
- Multi-company support
- Dynamic workflows
- Complete audit history
- Secure approval routing

---

### Module Scope

The module manages:

- Request Forms
- Request Items
- Workflow Instances
- Approvals
- Corrections
- Implementations
- Completion Status

---

### Relationships

Requests integrate with:

- People
- Organization
- Applications
- Assets
- Workflows
- Notifications
- Audit

---

### Design Principles

- One request may contain multiple items.
- Each item may use its own workflow.
- Historical requests are immutable.
- All actions are audited.

End of Chapter 1.


---

## Chapter 2 - Request Types

### Purpose

Request Types define the business processes supported by Axivo.

---

### Standard Request Types

- Application Access
- Asset Request
- Asset Handover
- Role Change
- Clearance
- General Request (future)

Additional request types may be created by administrators.

---

### Request Structure

Each request type defines:

- Form
- Workflow
- Request Items
- Required Fields
- Notifications
- Completion Rules

---

### Business Rules

- Each request belongs to one Company.
- Each request type references one Form.
- Each request type references one Workflow.
- Request Types may be enabled or disabled.
- Historical requests remain unchanged.

---

### Permissions

Authorized administrators may:

- Create Request Types
- Edit Request Types
- Enable or Disable Request Types

---

### Audit

Audit events:

- Create
- Update
- Enable
- Disable

End of Chapter 2.

---

## Chapter 3 - Request Form Structure

### Purpose

Every request is submitted using a dynamic single-page form.

Forms are company-specific and linked to a Request Type.

---

### Form Layout

Each form contains:

- Request Information
- Requested By
- Requested For
- Request Items
- Supporting Information
- Attachments (optional)

Inline validation is applied to every field.

---

### Validation

Client-side:
- Required fields
- Email format
- Numeric ranges

Server-side:
- Repeat all validation
- Business rules
- Company consistency

Invalid email addresses are rejected.

---

### Request Items

A single request may contain:

- Multiple Applications
- Multiple Assets
- Multiple Role Changes

Each item is processed independently using its own workflow.

---

### Business Rules

- Drafts are optional (future).
- Submitted requests become immutable except through the correction process.
- Every submission creates a complete timeline.

---

### Audit

Audit events:

- Draft created (future)
- Submitted
- Validation failed
- Updated through correction

End of Chapter 3.

---

## Chapter 4 - Request Lifecycle

### Purpose

This chapter defines the lifecycle of every request submitted through Axivo.

---

### Request States

A request progresses through:

- Draft (future)
- Submitted
- Pending Approval
- Correction Requested
- Approved
- Implementation Pending
- Completed
- Rejected
- Cancelled

---

### Lifecycle Rules

- Submission starts one or more workflow instances.
- Each request item maintains its own workflow.
- The overall request remains open until all items reach a final state.
- Historical states are never removed.

---

### Corrections

Approvers may request corrections.

Rules:

- Comments are mandatory.
- Only selected request items enter Correction Requested.
- Other items continue without interruption.
- Requester edits only the affected items.
- Timeline is preserved.

---

### Completion

The request is completed only after:

- All approvals finish.
- Required implementations finish.
- Required acknowledgements are complete.

---

### Audit

Audit events:

- Status changed
- Correction requested
- Correction submitted
- Request completed
- Request cancelled

End of Chapter 4.

---

## Chapter 5 - Workflow Execution

### Purpose

This chapter defines how workflow instances are executed for each request item.

---

### Workflow Model

Each request item starts its own workflow instance.

A single request may therefore have multiple workflows running simultaneously.

---

### Workflow Resolution

For each workflow step:

1. Resolve the required Approval Role.
2. Determine the assigned approver(s).
3. Generate secure email links.
4. Wait for approval, rejection or correction.
5. Advance only the affected request item.

---

### Mixed Workflows

Different request items may use different workflows.

Example:

- Email Account → HOD → IT Approval → GM → IT Implementation
- HR System → HOD → HR → IT Approval → GM → IT Implementation

The HR approver only receives the HR System approval.

---

### Final Approval

Implementation begins only after the final approval step for that workflow item.

The implementation task is then assigned to the configured IT Implementation role.

---

### Audit

Audit events:

- Workflow started
- Step assigned
- Step completed
- Workflow completed

End of Chapter 5.

---

## Chapter 6 - Approval Actions

### Purpose

This chapter defines the actions available to approvers during workflow execution.

---

### Available Actions

Approvers may:

- Approve
- Reject
- Request Correction

All actions are performed through secure email links or the portal.

---

### Approval

When approved:

- The current workflow step completes.
- The next step begins automatically.
- Audit history is updated.

---

### Rejection

When rejected:

- Comments are mandatory.
- The affected request item ends immediately.
- Other request items continue independently.

---

### Request Correction

Rules:

- Comments are mandatory.
- One or more specific request items may be selected.
- Only selected items return to the requester.
- Other workflow items continue unaffected.
- Original approval timeline is preserved.

---

### Notifications

Notifications are sent to:

- Requester
- Current approver
- Next approver (after approval)
- IT Implementation (after final approval)

---

### Audit

Audit events:

- Approved
- Rejected
- Correction requested
- Correction submitted

End of Chapter 6.

---

## Chapter 7 - Notifications & Email Flow

### Purpose

This chapter defines notification behavior throughout the request lifecycle.

---

### Notification Events

Emails are sent when:

- Request submitted
- Approval required
- Request rejected
- Correction requested
- Correction submitted
- Final approval completed
- IT implementation required
- Credentials delivered
- Asset handover required
- Request completed

---

### Secure Links

Every actionable email contains a unique secure token.

Tokens:

- Are time limited
- Are single-purpose
- Validate the request and recipient
- Cannot be reused after completion where applicable

---

### Reminder Emails

Automatic reminders may be sent for:

- Pending approvals
- Pending implementations
- Pending acknowledgements

Reminder schedules are configurable.

---

### Business Rules

- IT Implementation notifications are sent only after the final approval step.
- Approval emails are never sent to IT Implementation users before final approval.
- Expired links display a friendly page with resend options where permitted.

---

### Audit

Audit events:

- Email queued
- Email delivered
- Reminder sent
- Token consumed

End of Chapter 7.

---

## Chapter 8 - Implementation Stage

### Purpose

This chapter defines the implementation phase after workflow approval.

---

### Entry Criteria

Implementation begins only after:

- The final approval step is completed.
- The request item reaches the Implement Pending state.

---

### IT Responsibilities

The assigned IT Implementation user shall:

- Create application accounts
- Configure access
- Assign assets where required
- Record usernames
- Enter temporary passwords
- Complete custom credential fields
- Mark implementation complete

---

### Completion Rules

When implementation is completed:

- Credential delivery emails are generated where applicable.
- Asset handover emails are generated where applicable.
- Request timelines are updated.
- Audit history is recorded.

---

### Business Rules

- Only assigned IT Implementation users may complete implementation.
- Implementation cannot begin before final approval.
- Each request item is implemented independently.

---

### Audit

Audit events:

- Implementation started
- Implementation completed
- Credentials prepared
- Assets assigned

End of Chapter 8.

---

## Chapter 9 - Request Timeline & Audit History

### Purpose

Every request maintains a permanent chronological timeline of all activity.

---

### Timeline Entries

The timeline records:

- Request submitted
- Workflow started
- Approval assigned
- Approved
- Rejected
- Correction requested
- Correction submitted
- Final approval
- Implementation started
- Implementation completed
- Credentials delivered
- Asset handover acknowledged
- Request completed

---

### Timeline Rules

- Entries are displayed in chronological order.
- Timeline entries cannot be edited or deleted.
- Corrections preserve the original timeline.
- Each request item maintains its own workflow history within the request.

---

### Display

The timeline shows:

- Timestamp
- User
- Action
- Comments (where applicable)
- Related request item

---

### Audit

Timeline entries are generated automatically from immutable audit events.

End of Chapter 9.

---

## Chapter 10 - Search, Reporting & Administration

### Purpose

The Requests module provides centralized administration and reporting for all requests.

---

### Search

Support searching by:

- Request Number
- Requester
- Requested For
- Company
- Department
- Request Type
- Status

Search shall be case-insensitive.

---

### Filters

Available filters:

- Company
- Request Type
- Workflow Status
- Implementation Status
- Date Range
- Approver
- Department

Filters may be combined.

---

### Reports

Standard reports include:

- Requests by Company
- Requests by Status
- Approval Performance
- Pending Implementations
- Rejected Requests
- Correction Requests
- Completion Times

---

### Administration

Authorized users may:

- View requests
- Cancel eligible requests
- Resend notifications
- Reassign implementation where permitted

---

### Audit

Audit events:

- Report generated
- Export completed
- Administrative action performed

End of Chapter 10.

---

## Chapter 11 - Validation, Permissions & Security

### Validation Rules

Every request shall be validated before submission and before every workflow action.

Validation includes:

- Required fields
- Valid email addresses
- Company consistency
- Active organizational references
- Workflow availability
- Request item integrity

Server-side validation is mandatory.

---

### Permissions

System Administrator:
- Full access

IT Administrator:
- Configurable administrative access

IT Support:
- Implementation access where assigned

Approvers:
- Access only to workflow items assigned to them.

Requesters:
- Access only to their own requests unless additional permissions are granted.

---

### Security

Every request action shall:

- Verify authentication where required
- Verify authorization
- Validate input
- Verify secure email tokens where applicable
- Record an immutable audit event

---

### Acceptance Criteria

- Unauthorized actions are rejected.
- Invalid requests cannot be submitted.
- Cross-company access is prevented.
- Audit history remains complete.

End of Chapter 11.

---

## Chapter 12 - Governance, Future Expansion & Integration

### Governance

The Requests module is the authoritative source for all business request records within Axivo.

All request processing shall use the workflow engine.

---

### Module Integrations

The Requests module integrates with:

- People
- Organization
- Applications
- Assets
- Notifications
- Audit
- Reporting

No module shall bypass the request process where approval is required.

---

### Future Expansion

The design supports future request types including:

- Software purchases
- Vendor access
- Hardware disposal
- Visitor access
- Facilities requests

These additions shall reuse the existing workflow engine.

---

### Change Management

Future enhancements shall:

- Preserve request history
- Preserve workflow timelines
- Maintain company isolation
- Maintain audit integrity

---

### Acceptance Criteria

- Workflow engine supports multiple request types.
- Independent item workflows function correctly.
- Timeline integrity is preserved.
- Security requirements are satisfied.
- Module integrations remain consistent.

End of Chapter 12.

---

## Chapter 13 - Operational Controls & Module Completion

### Operational Controls

Administrators shall periodically review:

- Pending approvals
- Pending implementations
- Overdue requests
- Stalled workflows
- Expired email tokens
- Outstanding acknowledgements

---

### Administrative Reports

Support reports for:

- Workflow bottlenecks
- Approval turnaround times
- Requests by company
- Requests by department
- Implementation workload
- Completed vs rejected requests

---

### Operational Principles

The Requests module shall:

- Preserve complete timelines.
- Support independent item workflows.
- Prevent unauthorized modifications.
- Maintain immutable audit history.
- Respect company boundaries.

---

### Completion Criteria

Document 09 is complete when:

- Request processing is fully defined.
- Workflow execution is documented.
- Approval and implementation stages are complete.
- Notification behaviour is specified.
- Security and validation requirements are satisfied.
- Reporting and governance requirements are complete.

## End of Document 09.

---

## Chapter 14 - Final Acceptance & Future Compatibility

### Future Compatibility

The Requests module is designed to support future workflow enhancements without changing the core request architecture.

Future capabilities may include:

- Conditional workflow branching
- Parallel approvals
- SLA escalation
- Auto-approvals
- External approvals
- API integrations

---

### Design Principles

Future enhancements shall:

- Preserve request history
- Preserve approval timelines
- Reuse the workflow engine
- Maintain backward compatibility
- Respect company isolation

---

### Final Acceptance Criteria

Document 09 is accepted when:

- Request lifecycle is fully documented.
- Independent item workflows operate correctly.
- Approval, implementation and completion stages are defined.
- Notification and security requirements are complete.
- Audit and reporting requirements are satisfied.

## End of Document 09.