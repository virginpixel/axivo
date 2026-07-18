# Axivo Software Design Specification

# Document 02 - System Architecture

## Chapter 1 - Architecture Overview

### Purpose
This document defines the technical architecture of Axivo, including application layers, infrastructure, deployment model, internal communication and technology standards.

### Architecture Style
Version 1 shall use a Modular Monolith architecture.

Characteristics:
- Single deployable application
- Independent business modules
- Shared authentication
- Shared database
- Internal service boundaries
- Background worker service

### High-Level Components
- Web Application
- Business Service Layer
- Background Worker
- PostgreSQL
- Redis
- File Storage
- Reverse Proxy

### Design Principles
- Backend-for-Frontend architecture
- No public REST API
- Internal service communication only
- Server-side rendering where appropriate
- Server-side validation
- Company-aware authorization

### Module Boundaries
Modules communicate through internal services only and never access another module's database logic directly.

### Deployment Target
Primary deployment target:
- Docker Compose on Ubuntu Server LTS

Future deployment targets:
- Kubernetes
- High Availability clusters

End of Chapter 1.


---

## Chapter 2 - Technology Stack

### Backend
- Next.js (App Router)
- TypeScript
- Node.js LTS

### Frontend
- React
- TypeScript
- Tailwind CSS
- shadcn/ui

### Database
- PostgreSQL

### ORM
- Prisma ORM

### Background Processing
- Redis
- BullMQ

### File Storage
- Local storage (Version 1)
- Pluggable storage interface for future S3-compatible providers

### Reverse Proxy
- Nginx

### Authentication
- Local authentication
- Secure cookie sessions

### Email
- SMTP (configurable)

### PDF Generation
- Server-side PDF generation

### Architecture Rules
- No public REST API
- Backend-for-Frontend pattern
- Internal services only
- Docker-first deployment
- Environment-based configuration

### Versioning
All framework versions shall use current stable LTS releases supported by the project.

End of Chapter 2.

---

## Chapter 3 - Solution Architecture

### Logical Layers

Axivo is divided into the following layers:

1. Presentation Layer
2. Application Layer
3. Domain Layer
4. Infrastructure Layer
5. Persistence Layer

Business rules must never exist in the Presentation Layer.

---

### Presentation Layer

Responsibilities:
- Render UI
- Client-side inline validation
- Collect user input
- Display server responses

The UI never performs authorization or business decisions.

---

### Application Layer

Responsibilities:
- Execute use cases
- Coordinate modules
- Validate permissions
- Start workflows
- Dispatch background jobs

---

### Domain Layer

Contains:
- Business rules
- Workflow logic
- Approval routing
- Asset lifecycle
- Credential delivery rules
- Contract rules

Modules communicate through domain services only.

---

### Infrastructure Layer

Provides:
- Email
- PDF generation
- File storage
- Background queues
- Encryption
- Logging

All infrastructure components are replaceable without changing business logic.

---

### Persistence Layer

Components:
- PostgreSQL
- Prisma ORM
- Redis

Only repository classes interact directly with the database.

---

### Communication Rules

Browser
→ Next.js Server
→ Internal Services
→ Database / Worker

No direct browser access to the database or internal services.

End of Chapter 3.

---

## Chapter 4 - Module Architecture

### Module Principles

Each business module is independently organized with its own:
- Services
- Repositories
- Validation
- Permissions
- UI components
- Background jobs
- Tests

Modules must not access another module's repositories directly.

---

### Core Modules

- Dashboard
- People
- Applications
- Licenses
- Assets
- Contracts
- Forms
- Workflow
- Requests
- Documents
- Reports
- Organization
- Settings
- Notifications
- Audit

---

### Cross-Module Communication

Communication shall occur through internal service interfaces only.

Example:
Requests → Workflow Service
Workflow → Notification Service
Assets → Documents Service

---

### Shared Services

Shared services include:
- Authentication
- Authorization
- Audit
- Notifications
- File Storage
- PDF Generation
- Encryption
- Search

---

### Module Independence

Each module owns:
- Business rules
- Validation rules
- Database repositories
- Domain models

Shared functionality belongs only in shared services.

---

### Dependency Rules

Presentation
→ Application Services
→ Domain Services
→ Repositories
→ Database

Reverse dependencies are prohibited.

End of Chapter 4.

---

## Chapter 5 - Repository Structure

### Repository Layout

The source code shall be organized by feature rather than technical type.

```
src/
├── app/
├── modules/
│   ├── people/
│   ├── applications/
│   ├── assets/
│   ├── contracts/
│   ├── requests/
│   ├── workflow/
│   ├── reports/
│   └── ...
├── shared/
├── infrastructure/
├── workers/
├── prisma/
└── tests/
```

### Module Structure

Each module contains:

- UI Components
- Server Actions
- Services
- Validators
- Repositories
- Types
- Permissions
- Tests

### Shared Folder

Contains reusable functionality only:

- Authentication
- Authorization
- Audit
- Encryption
- Email
- Search
- Utilities

### Infrastructure

Contains implementations for:

- SMTP
- Redis
- PostgreSQL
- File Storage
- PDF Generation
- Logging

### Principles

- No circular dependencies
- Shared code must remain generic
- Business logic stays inside modules
- Infrastructure is replaceable through interfaces

End of Chapter 5.

---

## Chapter 6 - Internal Communication Architecture

### Communication Model

All communication inside Axivo is server-side.

```
Browser
    ↓
Next.js Server
    ↓
Application Services
    ↓
Domain Services
    ↓
Repositories
    ↓
PostgreSQL
```

### Browser Communication

The browser communicates only with the Axivo application.

The browser never communicates directly with:
- PostgreSQL
- Redis
- Background Workers
- Internal Services

### Server Actions

Server Actions are the primary mechanism for:
- Form submissions
- CRUD operations
- Workflow actions
- File uploads
- Authentication
- Settings changes

All Server Actions must:
- Validate input
- Verify permissions
- Create audit events
- Return sanitized responses

### Background Worker

Long-running operations are delegated to workers:

- Email delivery
- PDF generation
- Contract reminders
- Scheduled notifications
- Cleanup jobs

Workers never communicate directly with browsers.

### Error Handling

Errors are classified as:
- Validation
- Business Rule
- Authorization
- System

Internal exceptions are never exposed to users.

### Architecture Rules

- No public REST API.
- No direct module-to-module database access.
- Internal services communicate through interfaces.
- All business operations originate from authenticated server actions.

End of Chapter 6.

---

## Chapter 7 - Background Processing Architecture

### Purpose

Background workers execute tasks that should not block user interactions.

---

### Worker Responsibilities

Workers process:

- Email delivery
- Credential notifications
- Contract reminders
- Scheduled reports
- PDF generation
- Cleanup tasks
- Expired credential removal
- Expired token cleanup

---

### Queue Principles

Jobs are queued through Redis.

Each job contains:
- Job ID
- Type
- Payload
- Company
- Priority
- Retry count

---

### Retry Policy

Recoverable failures shall retry automatically using exponential backoff.

Permanent failures are logged and marked failed.

---

### Scheduled Jobs

Recurring jobs include:

- Contract reminder checks
- Pending approval reminders
- Expired token cleanup
- Temporary credential deletion
- System maintenance

---

### Failure Handling

Failed jobs:
- Generate audit events where applicable
- Record detailed logs
- Never expose internal errors to users

---

### Scalability

Workers shall be independently scalable from the web application.

Future deployments may run multiple worker instances without code changes.

End of Chapter 7.

---

## Chapter 8 - Storage Architecture

### Database

Primary relational database:
- PostgreSQL

Database responsibilities:
- Business data
- Configuration
- Audit records
- Workflow state
- Reporting data

---

### Cache & Queue

Redis is used for:
- Background job queues
- Temporary cache
- Session-related transient data where applicable

Redis is not the system of record.

---

### File Storage

Version 1 stores uploaded files on local storage.

Stored content includes:
- Logos
- Contracts
- Discard forms
- Handover PDFs
- Clearance PDFs
- Templates
- Attachments

Files are referenced from the database but stored outside the web root.

---

### Encryption

Sensitive values are encrypted before storage.

Temporary credential secrets use encrypted storage and automatic expiry.

Encryption keys are never stored in the database.

---

### Storage Principles

- Immutable document history
- Single stored file with multiple record links
- Soft delete where appropriate
- Regular backups
- Storage abstraction for future cloud providers

End of Chapter 8.

---

## Chapter 9 - Security Architecture

### Security Layers

Axivo implements layered security:

- Network
- Reverse Proxy
- Application
- Authorization
- Database
- Storage

---

### Network

Only the reverse proxy is publicly accessible.

Internal services remain on private Docker networks.

---

### Application Security

- Backend-for-Frontend architecture
- Server-side authorization
- Server-side validation
- Rate limiting
- CSRF protection
- Security headers

---

### Authentication

- Local accounts
- Secure cookie sessions
- Temporary login throttling
- Password hashing
- Session regeneration after login

---

### Authorization

Access decisions consider:

- System Role
- Company scope
- Approval Role
- Record ownership where applicable

---

### Sensitive Data

Encrypted at rest:
- SMTP credentials
- API secrets
- Temporary credential secrets

Never logged:
- Passwords
- Tokens
- Secret values

---

### Security Events

Generate audit events for:
- Login attempts
- Permission failures
- Token validation failures
- Security setting changes
- Credential delivery actions

End of Chapter 9.

---

## Chapter 10 - Deployment Architecture

### Deployment Model

Axivo Version 1 is deployed as a Docker Compose application.

Core containers:
- Web Application
- Background Worker
- PostgreSQL
- Redis
- Nginx Reverse Proxy

---

### Container Responsibilities

#### Web Application
- User interface
- Authentication
- Server actions
- Business logic
- Workflow processing

#### Background Worker
- Email delivery
- Scheduled jobs
- PDF generation
- Cleanup tasks

#### PostgreSQL
- Persistent business data
- Audit records
- Configuration

#### Redis
- Job queues
- Temporary cache

#### Nginx
- HTTPS termination
- Reverse proxy
- Security headers
- Request routing

---

### Environment Configuration

Configuration is supplied through environment variables.

Examples:
- Database connection
- Redis connection
- SMTP
- Encryption keys
- Session secrets
- File storage path

Secrets shall never be committed to source control.

---

### Deployment Principles

- Stateless application containers
- Persistent database volumes
- Persistent file storage
- Internal Docker networking
- HTTPS only
- Version-controlled deployment configuration

---

### Recovery

Deployment must support:
- Full backup restore
- Container recreation
- Database migration
- Rollback to previous application version

End of Chapter 10.

---

## Chapter 11 - Scalability & Performance Architecture

### Scalability Goals

Axivo shall scale vertically in Version 1 and support future horizontal scaling with minimal architectural changes.

### Application Scalability

The web application shall remain stateless wherever practical.

User state is maintained through secure sessions and persistent storage rather than application memory.

### Worker Scalability

Background workers may run as multiple instances.

Jobs must be processed safely without duplication.

### Database Performance

Performance principles:
- Indexed foreign keys
- Indexed search columns
- Paginated queries
- Soft-delete aware indexes
- Optimized reporting queries

### Caching

Redis may cache:
- Configuration
- Frequently used lookups
- Dashboard summaries

Business-critical writes must always use PostgreSQL.

### File Storage Growth

Storage implementation shall support future migration to S3-compatible providers without changing business logic.

### Performance Targets

- Responsive UI
- Fast search
- Efficient workflow processing
- Minimal blocking operations
- Background execution for heavy tasks

End of Chapter 11.

---

## Chapter 12 - Monitoring, Logging & Observability

### Objectives

Axivo shall provide operational visibility for administrators while protecting sensitive information.

---

### Application Logging

Application logs shall include:

- Startup events
- Shutdown events
- Background worker events
- Unexpected exceptions
- Performance warnings
- Dependency failures

Sensitive values shall never be written to logs.

---

### Audit vs System Logs

Audit Logs record business events.

System Logs record application and infrastructure events.

These are separate data sources.

---

### Health Monitoring

Health checks shall verify:

- Web application
- PostgreSQL connectivity
- Redis connectivity
- Background worker
- File storage availability

---

### Operational Dashboard

System Administrators shall be able to view:

- Queue status
- Failed jobs
- Storage usage
- Backup status
- Active sessions
- Security events
- Contract reminder status

---

### Alerting

Critical failures shall generate:

- In-application alerts
- Email notifications (configurable)

Examples:
- Worker offline
- Backup failure
- SMTP failure
- Database unavailable

---

### Retention

System logs shall support configurable retention periods.

Audit logs remain preserved according to organizational policy.

End of Chapter 12.

---

## Chapter 13 - Disaster Recovery & Business Continuity

### Objectives

Axivo shall support rapid recovery from hardware, software and operational failures.

---

### Backup Strategy

The system shall support backups of:
- PostgreSQL database
- Uploaded files
- Configuration
- Branding assets
- Templates

Temporary cache and expired credential secrets are excluded.

---

### Restore Strategy

Restore operations shall:
- Validate backup integrity
- Restore database
- Restore uploaded files
- Restore configuration
- Record an audit event

Only System Administrators may perform restores.

---

### Recovery Objectives

Target objectives:
- Minimize downtime
- Preserve audit history
- Preserve document integrity
- Restore configuration consistently

---

### Business Continuity

If a background worker is unavailable:
- User requests continue where possible.
- Pending jobs remain queued.
- Jobs resume automatically when the worker returns.

---

### Failure Principles

The application shall fail safely.

No partial workflow completion, credential delivery or document generation shall leave inconsistent business records.

End of Chapter 13.

---

## Chapter 14 - Architecture Acceptance Criteria

### Architecture Requirements

The architecture is accepted only when all of the following are satisfied.

### Functional Criteria

- Modular Monolith architecture implemented
- Docker deployment operational
- Internal service boundaries enforced
- Background workers operational
- Company-aware authorization implemented
- Secure server actions implemented
- No public REST API exposed

### Security Criteria

- Server-side validation on every operation
- Temporary login throttling implemented
- Secure session management
- Encrypted secret storage
- Secure email token workflow
- Audit logging enabled

### Operational Criteria

- Successful backup and restore
- Background job recovery verified
- Health checks operational
- Configuration managed through environment variables

### Performance Criteria

- Responsive UI
- Efficient database access
- Background processing for long-running tasks
- No blocking operations for email or PDF generation

### Documentation Criteria

Subsequent SDS documents shall conform to this architecture without introducing conflicting patterns.

## End of Document 02.