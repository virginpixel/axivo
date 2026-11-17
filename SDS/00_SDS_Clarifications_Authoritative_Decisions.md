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
-   Document 24 -- Infrastructure & Credential Vault

------------------------------------------------------------------------

# 14. Infrastructure Register and Credential Vault

Added to scope on 17 November 2026 at the owner's request. This
overrides the "Finance" and "Procurement" exclusions in Document 01
only as far as described here and in Document 24.

The Infrastructure module records the IT estate itself, separate from
the assets issued to people:

-   Network devices (switches, firewalls, routers, wireless
    controllers) and servers & hosts (physical servers, virtual
    machines, NAS, appliances), classified by configurable device
    types.
-   Each device belongs to one company and may sit at a nested
    location. A virtual machine may name the host it runs on.
    Servers may list the Applications that run on them.
-   A credential vault. One credential set (username + password) may
    be shared by many devices. Passwords are encrypted at rest,
    never shown in lists or exports, and only revealed on demand to
    holders of `infrastructure.credentials.reveal`. Every reveal is
    audited. That permission is granted to System Administrators by
    default.
-   Spreadsheet import with a preview step. Logins found in an
    imported sheet are encrypted on the server and grouped into
    credential sets; they are never sent back to the browser.
-   Connections and a topology map (added 17 November 2026): each
    cable is recorded as a port on one device to a port on another,
    typed by hand or imported from a neighbour table (CDP/LLDP, such
    as the discovery workbook's Neighbours sheet). The map shows which
    switch connects to which and from which port, and flags a device
    whose ports lead back to itself (a loop). Importing a neighbour
    table only reads a file.
-   Configuration backups (added 18 November 2026): every night, at
    an hour set in Settings, the worker logs in over SSH to each
    active network device that has an SSH login linked, runs only
    read-only `show` commands, and keeps an encrypted copy of the
    running configuration whenever it changes. Model, serial number
    and firmware in the register are updated from what the device
    reports. Saved configurations hold keys and password hashes, so
    opening or downloading one needs `infrastructure.configs.view`
    (System Administrators and IT Administrators by default) and is
    audited. This is the only place Axivo logs in to a device; it
    never changes a device's configuration.
-   Devices and assets (added 18 November 2026): a device may be
    linked to one asset, one to one. The asset keeps tag, purchase,
    warranty and disposal; the device keeps how it is wired and
    configured. A device can create its asset, link an existing one
    by tag, serial number or name, or have none. Devices already in
    the register can be linked in bulk (same serial number first,
    then same name, else a new asset).

-   IP & VLAN plan (added 18 November 2026): each company's VLANs
    (ID 1-4094, name, purpose, status Active / Reserved / Not in use)
    and IPv4 subnets (network and prefix, gateway, DHCP relay, VLAN,
    location). Sizes and usable ranges are calculated, never typed.
    IP addresses are recorded per company as Used or Reserved, with
    DNS name, MAC address and vendor, the switch and port they were
    seen on, and the device they belong to. A subnet's page shows a
    map of its addresses, its usage, any subnet it overlaps and the
    next free address; any IP can be looked up to find its subnet and
    VLAN. The discovery workbooks ("VLAN plan" and "Live devices"
    sheets) import as they are. IPv6 is out of scope for now.

Planned later phases, each in its own release: OPEX and CAPEX budgets
in USD with company splits. Their scope will be recorded here before
they are built.

Built-in network discovery remains a future module (Document 01).

------------------------------------------------------------------------

# 15. Authority

This document supersedes conflicting statements elsewhere in the SDS.

Priority order:

1.  Document 00 -- SDS Clarifications & Authoritative Decisions
2.  Business Requirements
3.  Software Design Specification
4.  Industry Best Practice

## End of Document 00.
