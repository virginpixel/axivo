# Axivo Software Design Specification

# Document 00 -- SDS Clarifications & Authoritative Decisions (Version 1.0)

## Purpose

This document resolves ambiguities and conflicting statements that may
exist in the Software Design Specification (SDS).

If any SDS document conflicts with this document, **Document 00 shall
take precedence**.

------------------------------------------------------------------------

# 1. Product Scope

Axivo Version 1 is an internal IT Service Management platform.

Features explicitly marked as future are **not** included unless this
document states otherwise.

------------------------------------------------------------------------

# 2. Authentication

Version 1 supports:

-   Local Authentication

Version 1 does **not** include:

-   Microsoft Entra ID
-   Azure AD
-   Google Login
-   Apple Login
-   LDAP
-   Active Directory Login
-   SAML
-   OAuth Login
-   Multi-Factor Authentication (MFA)

------------------------------------------------------------------------

# 3. APIs

Version 1 does **not** expose a public REST API.

All communication is internal between the frontend and backend.

Document 18 describes the internal service architecture only.

No external API gateway, SDK, GraphQL or third-party developer API shall
be implemented.

------------------------------------------------------------------------

# 4. Workflow Architecture

Each published Form is linked to exactly one Workflow.

Each submitted request creates a new Workflow Instance.

If multiple applications are requested in one submission:

-   Every application receives its own Workflow Instance.
-   Every instance is created from the Form's assigned Workflow.
-   Approval progress is tracked independently.

Workflow Definitions may be reused by multiple forms.

Workflow Instances are never shared.

------------------------------------------------------------------------

# 5. Approvers

The following users **do not require portal accounts**:

-   Department Heads
-   Assistant Department Heads
-   HR
-   General Manager

These users approve requests through secure email approval links.

Only the following users require Axivo portal accounts:

-   System Administrator
-   IT Administrator
-   IT Support
-   Read Only

------------------------------------------------------------------------

# 6. People

A requester may submit a public request even if neither the Requester
nor Requested For exists in the People directory.

Matching should be attempted where possible.

If no match exists:

-   The request proceeds normally.
-   People records may be created later during IT implementation if
    required.

------------------------------------------------------------------------

# 7. Permissions

Version 1 uses Role-Based Access Control (RBAC).

Permissions are assigned to Roles.

Users receive permissions only through assigned Roles.

Per-user permission overrides are **not** supported in Version 1.

------------------------------------------------------------------------

# 8. Forms

Every published Form:

-   Has one Workflow.
-   Supports unlimited fields.
-   Supports versioning.
-   Supports conditional visibility.
-   Generates immutable submissions.

Published versions cannot be modified.

------------------------------------------------------------------------

# 9. Contracts

Contracts are standalone business records.

Contracts may optionally link to:

-   Vendors
-   Applications
-   Licenses
-   Assets

Contracts are not part of Request Workflows.

------------------------------------------------------------------------

# 10. Testing

Document 20 describes the software development and QA process.

It is **not** an Axivo application module.

------------------------------------------------------------------------

# 11. Future Features

The following are **out of scope for Version 1**:

-   Microsoft Entra ID
-   LDAP
-   Active Directory Authentication
-   SAML
-   OAuth
-   MFA
-   External REST APIs
-   GraphQL
-   Public SDKs
-   Kubernetes
-   Multi-region deployment
-   High Availability clustering
-   Blue/Green deployments
-   AI-assisted features
-   Machine Learning
-   Predictive analytics
-   Self-healing infrastructure
-   Windows Server deployment
-   Scheduled reports
-   Custom report builder
-   Infrastructure-as-Code

------------------------------------------------------------------------

# 12. Deployment

Version 1 target deployment:

-   Ubuntu Server
-   Docker Compose
-   PostgreSQL
-   Self-hosted
-   Cloudflare Tunnel
-   Single production instance

High Availability is not required.

------------------------------------------------------------------------

# 13. Additional SDS Documents

The official SDS includes:

-   Document 22 -- Forms & Form Builder
-   Document 23 -- Contracts & Agreements

------------------------------------------------------------------------

# 14. Authority

This document supersedes conflicting statements elsewhere in the SDS.

Priority order:

1.  Document 00 -- SDS Clarifications & Authoritative Decisions
2.  Business Requirements
3.  Software Design Specification
4.  Industry Best Practice

## End of Document 00.
