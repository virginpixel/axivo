# Axivo Software Design Specification

# Document 01 - Project Foundation

## Chapter 1 - Executive Summary & Vision

### Purpose
This document defines the overall vision, philosophy, principles and scope of Axivo. Every remaining SDS document must comply with the rules defined here.

### Product Overview
Axivo is a self-hosted IT Operations platform focused on Access Management, Asset Management, License Management, Workflow Automation, Approval Management, Credential Delivery, Document Management, Audit & Compliance, Contract Management and Reporting.

### Vision
Provide a single platform for IT departments to manage the complete lifecycle of users, applications, assets and approvals while maintaining full auditability.

### Product Goals
- Eliminate paper forms
- Standardize IT workflows
- Improve audit readiness
- Reduce manual administration
- Multi-company support
- Docker-first
- Secure by default
- Highly configurable

### Target Organizations
- Hotels
- Resorts
- Hospitality Groups
- Corporate Offices
- Schools
- Healthcare
- Government
- SMEs

### Product Philosophy
- Configuration over customization
- Security by default
- Audit everything
- Simplicity first
- Commercial-grade quality

### Core Modules
Dashboard, People, Applications, Licenses, Assets, Contracts, Forms, Workflow, Requests, Documents, Reports, Organization, Settings, Notifications and Audit.

### Out of Scope
Payroll, HRMS, Helpdesk, MDM, Procurement, Finance, Automatic Provisioning and SSO.

### Design Principles
- Single Source of Truth
- Modular Architecture
- Company-aware
- Workflow-driven
- Least Privilege
- Immutable Audit Logs

End of Chapter 1.


---

## Chapter 2 - Product Scope & Principles

### Functional Scope
Axivo manages the operational IT lifecycle including:
- People
- Applications
- Licenses
- Assets
- Contracts
- Requests
- Approval Workflows
- Credential Delivery
- Documents
- Reports

### Product Boundaries
Axivo complements HR, Finance and Procurement systems. It does not replace them.

### Multi-Company Design
Every business object belongs to a company unless explicitly global. Forms are company-specific. Applications are company-specific. Departments and locations are company-specific.

### Configuration Philosophy
Administrators configure the platform instead of modifying source code.

Configurable items include:
- Companies
- Departments
- Locations
- Forms
- Workflows
- Approval Roles
- Asset Templates
- Applications
- Contracts
- Branding
- SMTP
- Notifications

### Security Philosophy
- Server-side validation for every request
- Backend authorization only
- Temporary login throttling
- Secure email tokens
- Rate limiting
- OWASP-aligned design
- Audit every security event

### Data Ownership
People are the central record referenced by applications, assets, licenses, requests and documents.

### Commercial Product Principles
- No hardcoded companies
- No hardcoded workflows
- No hardcoded departments
- No hardcoded approval chains
- No customer-specific logic

### Success Criteria
The platform must remain scalable, configurable, secure and maintainable without custom development.

End of Chapter 2.

---

## Chapter 3 - User Types & Organizational Model

### User Categories

Axivo defines four primary user categories:

- Requesters
- Approvers
- IT Portal Users
- Auditors

### Requesters

Requesters submit public forms without signing into Axivo.

A requester may:
- Submit requests for themselves.
- Submit requests on behalf of another employee.
- Receive rejection notifications.
- Receive correction requests.
- Receive final approval notifications (optional).
- Track requests only through secure email links.

### Requested For

The Requested For employee is the recipient of:
- Application access
- Assets
- Credentials
- Handover acknowledgements

The Requested For email is mandatory on every request form.

### Approvers

Approvers do not have portal accounts.

Approvals are completed through secure email links.

Examples:
- Department Head
- HR
- General Manager
- Finance
- Security
- IT Approval

### IT Portal Users

Only IT Portal Users can sign into Axivo.

System Roles:
- System Administrator
- IT Administrator
- IT Support
- Read Only

Approval Roles are separate from System Roles.

### Organizational Structure

Companies contain:
- Departments
- Locations
- Forms
- Applications
- Assets
- Contracts

Departments contain one or more Department Heads.

Approval Roles are assigned once per company and reused across all workflows.

### Workflow Routing

Workflow steps reference Approval Roles, never individual users.

At runtime Axivo resolves the correct approvers based on:
- Company
- Department (when applicable)
- Approval Role Assignment

### Guiding Principles

- One People record per employee.
- One workflow per form.
- Forms belong to one company.
- Workflows belong to one form.
- No hardcoded approvers.

End of Chapter 3.

---

## Chapter 4 - Core Business Principles

### People-Centric Model
Every operational record in Axivo ultimately relates to a single People record. Applications, licenses, assets, requests, contracts, documents and audit events must reference People instead of duplicating employee information.

### Company Isolation
Each company owns its own:
- Departments
- Locations
- Forms
- Applications
- Workflows
- Assets
- Contracts
- Approval role assignments

Global objects are limited to reusable platform configuration only.

### Workflow Principles
- Each form has exactly one workflow.
- Each application request item follows its configured workflow.
- Different applications within one request may use different workflows.
- IT Approval and IT Implementation are separate workflow steps.
- Requested corrections restart only the affected application's workflow when enabled.

### Credential Delivery Principles
Credentials are never emailed directly.
Temporary secrets are delivered through secure acknowledgement links.
Usernames and non-secret fields remain stored.
Secret values expire automatically after the configured period.

### Document Principles
Generated documents remain immutable.
Uploaded documents are stored once and linked where required.
Examples include discard forms linked to multiple assets.

### Reporting Principles
Reports use live operational data.
Historical records are never overwritten.
Exports never include secret values.

### Security Principles
- Server-side validation
- Inline client validation
- Generic authentication errors
- Temporary login throttling
- Secure token-based actions
- Principle of least privilege
- Complete audit logging

End of Chapter 4.

---

## Chapter 5 - Product Standards & Development Principles

### Development Standards

Axivo shall be developed as a production-grade commercial application.

Core standards:
- Clean Architecture
- Modular Monolith (Version 1)
- Docker-first deployment
- PostgreSQL
- Redis for caching/background jobs
- Background worker service
- Internal services only (no public API surface)

### Configuration Standards

All customer-specific behaviour must be configurable.

Examples:
- Branding
- SMTP
- Companies
- Departments
- Locations
- Approval Roles
- Workflow assignments
- Notification settings
- Contract reminders

### Coding Principles

- No hardcoded IDs
- No hardcoded company names
- No business logic in the UI
- Validation duplicated on server regardless of client validation
- Business logic centralized in service layer

### Audit Standards

Every significant operation must create an immutable audit event.

Examples:
- Create
- Update
- Delete
- Approval
- Rejection
- Credential delivery
- Asset assignment
- Login
- Security events

### User Experience Principles

- Single-page public request forms
- Inline validation
- Clear error messages
- Consistent navigation
- Accessible controls
- Responsive desktop and mobile layouts

### Performance Goals

- Fast page loads
- Optimized database queries
- Lazy loading where appropriate
- Background processing for long-running tasks

End of Chapter 5.

---

## Chapter 6 - Security & Compliance Principles

### Security Objectives
Security shall be built into every module from the beginning.

Objectives:
- Protect data
- Protect credentials
- Protect documents
- Prevent unauthorized access
- Detect abuse
- Maintain audit evidence

### Authentication Principles
- Local authentication only
- Temporary login throttling (no permanent lockout)
- Generic authentication errors
- Secure password hashing
- Secure session management

### Authorization Principles
- Role-based access control
- Company-aware permissions
- Record-level authorization
- Approval-role routing
- Backend authorization only

### Validation Principles
All input shall be validated:
- Client-side (inline)
- Server-side (mandatory)

Validation includes:
- Required fields
- Length
- Format
- Allowed values
- Company relationships
- Business rules

### Secure Actions
Sensitive operations use secure email tokens:
- Approvals
- Corrections
- Credential delivery
- Asset handover

### Compliance
Axivo is designed around:
- OWASP Top 10 principles
- Secure coding practices
- Complete audit history
- Least privilege
- Immutable records

### Logging
Never log:
- Passwords
- Secret tokens
- SMTP passwords
- Cloudflare tokens
- Temporary credentials

End of Chapter 6.

---

## Chapter 7 - Data Governance & Audit Principles

### Data Ownership
Every record has a defined owner, creator, company and audit history.

### Record Lifecycle
Records are created, updated, archived or closed. Historical business records are never physically deleted unless explicitly permitted by system policy.

### Immutable Audit Trail
The audit log records:
- Timestamp
- User
- Action
- Module
- Record
- Previous value
- New value
- Source IP
- Company

Audit records cannot be edited or deleted.

### Version History
The following maintain versions:
- Request corrections
- Workflows
- Forms
- Document templates
- Email templates

Previous versions remain available for audit.

### Data Relationships
People is the central entity referenced by:
- Applications
- Licenses
- Assets
- Requests
- Credential Deliveries
- Documents
- Contracts (where applicable)

### Data Retention
Operational records remain available until archived according to organizational policy. Generated documents and audit evidence remain linked to their originating records.

### Reporting Integrity
Reports use current operational data while preserving historical values for completed transactions.

End of Chapter 7.

---

## Chapter 8 - Notification & Communication Principles

### Notification Objectives
Notifications keep requesters, approvers and IT informed without creating unnecessary email traffic.

### Notification Channels
- Email
- In-application notifications
- Dashboard alerts

### Notification Principles
- Only actionable emails contain secure links.
- Informational emails contain no sensitive information.
- Credentials are never included in email.
- Notifications are configurable per company where applicable.

### Request Notifications
Configurable options:
- Send rejection email to requester
- Send final approval email to requester
- Send credential delivery email to Requested For
- Send handover acknowledgement email to Requested For
- Send reminder emails for pending approvals

### Contract Notifications
Support configurable reminders for contract expiry and renewal dates with multiple recipients.

### Security
All action links use secure, expiring, single-purpose tokens.
Expired links display a safe renewal page where applicable.

### Audit
Every notification records:
- Type
- Recipient
- Date and time
- Delivery status
- Triggering record

Notification content is not altered after sending.

End of Chapter 8.

---

## Chapter 9 - Deployment & Operational Principles

### Deployment Philosophy

Axivo is designed as a self-hosted, Docker-first application.

Supported deployment methods:
- Docker Compose (Version 1)
- Virtual Machine
- Physical Server

Future:
- Kubernetes

---

### Operating System

Recommended:
- Ubuntu Server LTS

Supported:
- Debian-based Linux distributions

Windows Server is not a supported production platform.

---

### Infrastructure Principles

- Single application instance
- PostgreSQL database
- Redis cache and queue
- Background worker
- Reverse proxy
- Internal Docker network

No database service shall be directly exposed to the Internet.

---

### Backup Principles

Backups include:
- Database
- Uploaded files
- Configuration
- Branding
- Templates

Backups do not include:
- Temporary credential secrets
- Cache

Restore shall be initiated only by System Administrators.

---

### Update Principles

Updates are installed through the built-in Update Agent.

Requirements:
- Version verification
- Backup reminder
- Rollback support
- Audit logging

---

### Monitoring

The system shall monitor:
- Failed logins
- Queue health
- Background jobs
- Disk usage
- Backup status
- Contract reminders
- Certificate expiry (future)

---

### Availability Goals

- Fast startup
- Graceful shutdown
- Automatic restart
- Recoverable backups

End of Chapter 9.

---

## Chapter 10 - Quality, Testing & Acceptance Principles

### Product Quality Objectives

Axivo shall be designed for long-term maintainability, reliability and consistency.

Primary objectives:
- Stable releases
- Predictable behaviour
- Consistent user experience
- Secure defaults
- Complete auditability

---

### Testing Philosophy

Every module shall be tested independently before integration.

Testing categories:

- Unit Testing
- Integration Testing
- Workflow Testing
- Security Testing
- UI Testing
- Regression Testing
- User Acceptance Testing (UAT)

---

### Acceptance Principles

A feature is complete only when:

- Functional requirements are satisfied.
- Validation rules pass.
- Security requirements pass.
- Audit events are generated.
- Notifications work correctly.
- Error handling is verified.
- Permissions are enforced.
- Documentation is complete.

---

### Performance Expectations

The application shall remain responsive under normal operational loads.

Performance goals include:

- Fast page navigation
- Efficient database queries
- Background processing for long-running tasks
- Minimal blocking operations

---

### Documentation Standards

Every implemented feature must include:

- Functional description
- Business rules
- Configuration requirements
- Validation rules
- Permissions
- Notifications
- Audit behaviour
- Acceptance criteria

---

### Versioning

The SDS shall evolve together with the product.

Major architectural changes require updates to:
- Foundation
- Architecture
- Database
- Security
- Affected module specifications

End of Chapter 10.

---

## Chapter 11 - Future Expansion & Product Roadmap

### Product Evolution

Axivo shall be designed to grow without requiring architectural redesign.

Future functionality must integrate with existing modules while preserving backward compatibility where practical.

---

### Planned Future Modules

Potential future modules include:

- Helpdesk
- Knowledge Base
- Visitor Management
- Purchase Requests
- Procurement
- Preventive Maintenance
- Mobile Application
- Asset Discovery
- Active Directory Integration
- Microsoft Entra ID Integration
- API Integrations
- Webhooks

These modules are outside the scope of Version 1.

---

### Scalability Principles

Future versions shall support:

- Multiple organizations
- Multiple properties
- Large user bases
- Additional workflow types
- Additional notification channels
- Additional authentication methods

without changing the core architecture.

---

### Upgrade Philosophy

Existing customer configurations must be preserved during upgrades whenever possible.

Configuration should always take precedence over code changes.

---

### Product Commitment

Axivo will remain:

- Self-hosted
- Security-first
- Audit-focused
- Workflow-driven
- Highly configurable
- Commercial-ready

---

### Foundation Completion

This document establishes the architectural and business principles that govern every remaining Software Design Specification document.

No subsequent SDS document may conflict with this foundation without an approved architectural revision.

End of Chapter 11.

---

## Chapter 12 - Final Decisions & Governance

### Final Architectural Decisions

The following decisions are locked for Version 1:

- Forms are company-specific.
- Each form contains exactly one workflow.
- Applications are company-specific.
- Departments and locations are company-specific.
- Approval Roles are assigned once per company.
- Workflow steps reference Approval Roles, never individual users.
- IT Approval and IT Implementation are separate workflow steps.
- Public request forms are single-page with inline validation.
- All server-side validation is mandatory regardless of client validation.
- Public forms require no login.
- Approvers use secure email links.
- Only IT Portal Users can sign into Axivo.

---

### Governance

Any architectural change affecting multiple modules must be reflected throughout the SDS before implementation.

Changes shall be documented with:
- Decision
- Reason
- Impacted modules
- Revision date

---

### Document Hierarchy

This Foundation document takes precedence over all other SDS documents.

If a later document conflicts with this one, the conflict must be resolved before development.

---

### Completion Criteria

Document 01 is complete when:
- Product vision is finalized.
- Core principles are defined.
- Security philosophy is established.
- Organizational model is finalized.
- Governance rules are documented.

End of Document 01.