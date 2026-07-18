# Axivo Software Design Specification

# Document 05 - Authentication & Security

## Chapter 1 - Security Philosophy

### Purpose

This document defines the authentication, authorization and security architecture for Axivo.

---

### Security Objectives

- Secure by default
- Least privilege
- Defense in depth
- Complete auditability
- OWASP-aligned implementation
- Zero trust between client and server

---

### Core Principles

- Backend authorization only
- Mandatory server-side validation
- No public REST API
- Secure server actions
- Temporary login throttling
- Generic authentication errors
- Secure email tokens
- Immutable audit logs

---

### Trust Boundaries

The browser is never trusted.

Every request must be:
- Authenticated where required
- Authorized
- Validated
- Audited

---

### Protected Assets

- User accounts
- Credentials
- Documents
- Contracts
- Assets
- Workflow approvals
- System configuration

End of Chapter 1.


---

## Chapter 2 - Authentication Architecture

### Authentication Method

Version 1 uses local authentication only.

Supported:
- Username
- Password

Not supported:
- Microsoft SSO
- Google
- LDAP
- SAML

---

### Login Flow

1. Validate request.
2. Apply rate limiting.
3. Verify credentials.
4. Regenerate session.
5. Record audit event.
6. Redirect to dashboard.

---

### Password Requirements

- Minimum 12 characters
- Argon2id hashing
- Unique salt
- Reject common passwords

---

### Login Protection

- Temporary throttling only
- Generic error messages
- Counters reset after cooldown or successful login
- No permanent account lockout

---

### Session Management

- Secure cookies
- HttpOnly
- SameSite
- Secure flag
- Idle timeout
- Absolute session timeout
- Logout invalidates session

End of Chapter 2.

---

## Chapter 3 - Authorization Architecture

### Authorization Model

Axivo uses Role-Based Access Control (RBAC) combined with Company and Record-level authorization.

Every request is evaluated using:
- Authentication status
- System Role
- Company scope
- Approval Role (when applicable)
- Record ownership where applicable

---

### System Roles

Portal access is controlled through System Roles.

Default roles:
- System Administrator
- IT Administrator
- IT Support
- Read Only

System Roles define portal capabilities only.

---

### Approval Roles

Approval Roles are independent of System Roles.

Examples:
- Department Head
- HR
- GM
- IT Approval
- IT Implementation

Approval routing is determined by workflow configuration and company assignments.

---

### Authorization Flow

For every protected request:

1. Verify active session.
2. Verify System Role permission.
3. Verify Company scope.
4. Verify record access.
5. Execute business rule validation.
6. Record audit event.

Access is denied immediately if any step fails.

---

### Permission Principles

- Deny by default.
- Grant only required permissions.
- Never trust client-side authorization.
- Authorization is evaluated on every request.

End of Chapter 3.

---

## Chapter 4 - Password & Credential Security

### Password Storage

System User passwords shall never be stored in plain text.

Requirements:
- Argon2id hashing
- Unique random salt
- Configurable work factor
- Constant-time verification

---

### Password Policy

Minimum requirements:
- 12 characters
- Uppercase letter
- Lowercase letter
- Number
- Special character

Administrators may increase complexity but not reduce the minimum standard.

---

### Credential Delivery

Application credentials are delivered through secure acknowledgement links.

Stored permanently:
- Username
- Custom application fields

Never stored permanently:
- Passwords
- Temporary secrets

Passwords expire automatically after the configured viewing period.

---

### Secret Handling

Temporary secrets:
- Encrypted at rest
- Single-use viewing
- Automatically deleted after expiry
- Never written to logs
- Never included in reports

---

### Reset & Resend

IT may resend credentials.

If the previous secret has expired:
- New password must be entered.

If still valid:
- IT may resend the existing temporary secret or replace it with a new one.

Every resend generates an audit event.

End of Chapter 4.

---

## Chapter 5 - Session Management

### Session Architecture

Axivo uses secure server-managed sessions.

The browser stores only a secure session cookie.

No business or authorization data is trusted from the client.

---

### Session Cookie Requirements

Cookies shall be:

- HttpOnly
- Secure
- SameSite=Lax
- Signed
- Encrypted where applicable

Cookies shall never be accessible through JavaScript.

---

### Session Lifecycle

1. Login creates a new session.
2. Session ID is regenerated after authentication.
3. Activity refreshes the idle timeout.
4. Logout immediately destroys the session.
5. Expired sessions require re-authentication.

---

### Timeouts

Support:

- Idle timeout
- Absolute session timeout

Administrators may configure timeout values in Settings.

---

### Concurrent Sessions

Version 1 permits multiple concurrent sessions for the same user.

Future versions may optionally restrict concurrent logins.

---

### Session Security

The application shall:

- Validate the session on every request.
- Reject invalid or expired sessions.
- Audit login and logout events.
- Never expose session identifiers.

End of Chapter 5.

---

## Chapter 6 - Input Validation & Request Security

### Validation Principles

Every request is validated twice:

- Client-side for user experience
- Server-side for security

Server-side validation is mandatory.

---

### Input Validation

Validate:

- Required fields
- Email format
- Numeric ranges
- String length
- Enum values
- UUID format
- Date ranges
- Business rules

Reject unexpected fields.

---

### Request Security

Every protected request shall:

1. Verify session.
2. Verify authorization.
3. Validate payload.
4. Execute business rules.
5. Write audit event.

---

### File Upload Security

Uploaded files shall be validated for:

- Allowed file type
- File size
- Filename sanitization
- Malware scan integration (future)

Executable files are rejected.

---

### Error Responses

Return:
- Generic authentication errors
- Clear validation messages
- Generic system errors

Never expose:
- Stack traces
- SQL errors
- Internal paths
- Framework details

---

### Acceptance Criteria

- Invalid input rejected.
- Malicious payloads blocked.
- Unauthorized requests denied.
- Sensitive implementation details never exposed.

End of Chapter 6.

---

## Chapter 7 - Rate Limiting & Abuse Protection

### Objectives

Protect Axivo against brute-force attacks, automated abuse and excessive requests without permanently locking user accounts.

---

### Login Rate Limiting

Authentication attempts shall be limited per:

- IP address
- Username
- Combined IP + Username

Default policy:

- 5 failed login attempts
- 5 minute cooldown
- Counter resets after successful login or cooldown expiry

Accounts are never permanently locked.

---

### Request Rate Limiting

Apply rate limiting to:

- Login
- Password verification
- Public request forms
- File uploads
- Credential acknowledgement links
- Email action links

Limits shall be configurable.

---

### Bot Protection

Public forms shall support:

- CSRF protection
- Honeypot field
- Future CAPTCHA integration (optional)

---

### Abuse Detection

Generate security events for:

- Repeated failed logins
- Excessive requests
- Invalid token usage
- Suspicious request patterns

Repeated abuse may be temporarily blocked by IP.

---

### Acceptance Criteria

- Brute-force attacks are throttled.
- Legitimate users regain access automatically after cooldown.
- No permanent lockout occurs.
- Security events are recorded.

End of Chapter 7.

---

## Chapter 8 - Email Token Security

### Purpose

Secure email tokens authorize actions without requiring portal login.

---

### Supported Actions

- Approvals
- Rejections
- Request Corrections
- Credential Acknowledgement
- Asset Handover
- Clearance Confirmation

---

### Token Requirements

Each token shall be:

- Cryptographically secure
- Single purpose
- Single use where applicable
- Time limited
- Signed
- Randomly generated

---

### Token Validation

Before executing an action:

1. Verify token signature.
2. Verify expiry.
3. Verify intended action.
4. Verify record state.
5. Mark token as consumed where required.

Invalid or expired tokens are rejected.

---

### Expiry

Default expiry is configurable.

Expired links display a friendly page allowing IT to resend when appropriate.

---

### Audit

Record:
- Token issued
- Token viewed
- Action completed
- Expiry
- Invalid attempts

No token values are stored in logs.

End of Chapter 8.

---

## Chapter 9 - Audit Logging & Security Monitoring

### Security Audit Principles

Every security-sensitive operation shall generate an immutable audit event.

---

### Audited Events

Record at minimum:

- Successful login
- Failed login
- Logout
- Password change
- Session timeout
- Permission denied
- Role assignment changes
- Security settings changes
- Credential delivery
- Token validation
- Token failures

---

### Audit Fields

Each event stores:

- Timestamp (UTC)
- Actor
- Company
- Source IP
- User Agent
- Event Type
- Target Record
- Result
- Correlation ID

---

### Monitoring

System Administrators shall be able to review:

- Failed login trends
- Active sessions
- Permission failures
- Suspicious activity
- Token abuse
- Rate limit events

---

### Log Protection

Audit records are:

- Append-only
- Non-editable
- Non-deletable
- Excluded from normal maintenance jobs

---

### Acceptance Criteria

- All security events are recorded.
- Audit history cannot be modified.
- Monitoring data is available for investigations.

End of Chapter 9.

---

## Chapter 10 - Data Protection & Encryption

### Encryption Standards

Axivo shall encrypt all sensitive data at rest and protect all data in transit.

---

### Encryption at Rest

Encrypted data includes:
- SMTP credentials
- API secrets
- Temporary credential secrets
- Session secrets
- Encryption keys (where applicable)

Passwords are never encrypted—they are hashed.

---

### Encryption in Transit

All external communication shall use HTTPS.

Internal Docker communication may remain private within the Docker network.

Future deployments may enforce TLS between internal services.

---

### Key Management

Encryption keys:
- Stored outside the database
- Loaded from environment variables
- Never committed to source control
- Rotatable without code changes

---

### Data Classification

Data categories:

- Public
- Internal
- Confidential
- Secret

Only Confidential and Secret data require encryption at rest.

---

### Acceptance Criteria

- Sensitive data encrypted.
- Secrets protected.
- TLS enforced for client communication.
- Keys managed securely.

End of Chapter 10.

---

## Chapter 11 - Secure Development Standards

### Secure Coding Principles

Every feature shall follow secure-by-default development practices.

---

### Server Actions

All Server Actions shall:

- Authenticate the user where required
- Authorize the action
- Validate all input
- Execute business logic
- Write audit events
- Return sanitized responses

Business logic shall never exist in client components.

---

### Secrets

Secrets shall never be:

- Hardcoded
- Logged
- Returned to the client
- Embedded in JavaScript
- Stored in source control

---

### Error Handling

Unexpected exceptions shall:

- Be logged internally
- Return generic user messages
- Never reveal implementation details

---

### Dependency Security

Dependencies shall:

- Use maintained versions
- Be reviewed before upgrades
- Receive security updates promptly
- Avoid unnecessary packages

---

### Code Review Checklist

Every pull request shall verify:

- Authentication
- Authorization
- Validation
- Audit logging
- Error handling
- Security implications

---

### Acceptance Criteria

- Secure coding standards followed.
- Secrets protected.
- Server Actions validated.
- Security review completed before release.

End of Chapter 11.

---

## Chapter 12 - Infrastructure Security

### Network Security

Production deployment shall expose only HTTPS through the reverse proxy.

Database, Redis and background workers remain on private Docker networks.

---

### Reverse Proxy

Responsibilities:

- HTTPS termination
- Security headers
- Request routing
- Compression
- Rate limiting support

---

### Security Headers

Responses shall include:

- Content-Security-Policy
- X-Frame-Options
- X-Content-Type-Options
- Referrer-Policy
- Permissions-Policy

---

### Environment Security

Environment files:

- Accessible only to administrators
- Excluded from backups when appropriate
- Never committed to version control

---

### Container Security

Containers shall:

- Run with least privilege
- Use read-only filesystems where practical
- Avoid unnecessary packages
- Use current security updates

---

### Acceptance Criteria

- Internal services not publicly exposed.
- HTTPS enforced.
- Security headers enabled.
- Environment secrets protected.

End of Chapter 12.

---

## Chapter 13 - Incident Response & Security Operations

### Security Objectives

Axivo shall assist administrators in detecting, investigating and responding to security incidents.

---

### Security Events

The following events are considered security incidents:

- Excessive failed logins
- Permission escalation attempts
- Invalid email token usage
- Session hijacking indicators
- Suspicious rate-limit violations
- Repeated authorization failures
- Unexpected configuration changes

---

### Administrative Response

System Administrators shall be able to:

- Review audit history
- Review active sessions
- Force user logout
- Disable user accounts
- Revoke pending credential deliveries
- Revoke active email tokens

---

### Investigation

Each incident shall include:

- Timestamp
- Actor
- Source IP
- User Agent
- Related audit events
- Affected records

---

### Recovery

After remediation:

- New sessions require authentication.
- Revoked tokens become permanently invalid.
- Previous audit records remain unchanged.

---

### Acceptance Criteria

- Security incidents are traceable.
- Administrators can revoke active sessions and tokens.
- Investigation data remains immutable.
- Recovery actions generate audit events.

End of Chapter 13.

---

## Chapter 14 - Compliance & Security Validation

### Compliance Objectives

Security controls shall be periodically verified to ensure continued compliance with organizational requirements.

---

### Security Validation

Regularly verify:

- Authentication flow
- Authorization rules
- Session handling
- Rate limiting
- Email token security
- Audit logging
- Encryption
- File upload validation

---

### Penetration Testing

Recommended before major releases:

- Authentication testing
- Authorization testing
- Input validation testing
- OWASP Top 10 testing
- Session management testing

---

### Configuration Review

Review periodically:

- System Roles
- Approval Role assignments
- SMTP settings
- Security headers
- Session timeout values
- Rate limit settings

---

### Acceptance Criteria

- Security controls validated.
- Compliance reviews completed.
- Critical findings resolved before production deployment.

End of Chapter 14.

---

## Chapter 15 - Security Acceptance Criteria & Governance

### Governance

This document defines the mandatory security baseline for every module within Axivo.

No feature may bypass or weaken these requirements without an approved architectural revision.

---

### Security Review Checklist

Before any feature is released, verify:

- Authentication implemented
- Authorization enforced
- Server-side validation completed
- Audit events generated
- Sensitive data protected
- Error messages sanitized
- Rate limiting applied where required
- Secure email tokens validated
- Session handling verified

---

### Release Requirements

A production release shall not proceed if:

- Critical security vulnerabilities exist.
- Authentication can be bypassed.
- Authorization checks are missing.
- Sensitive information is exposed.
- Audit logging is incomplete.

---

### Continuous Improvement

Security controls shall be reviewed after:

- Major releases
- Security incidents
- Infrastructure changes
- Framework upgrades

---

### Completion Criteria

Document 05 is complete when:

- Authentication architecture is finalized.
- Authorization model is documented.
- Session management is defined.
- Security controls are established.
- Compliance and governance requirements are documented.

## End of Document 05.