# Axivo — Configuration Reference

Configuration follows SDS Doc 02 Ch10: environment variables for
infrastructure and secrets; everything customer-facing is configured at
runtime in **Settings** and stored (versioned + audited) in `system_settings`.

## Environment variables (`.env`)

| Variable | Required | Description |
|---|---|---|
| `NODE_ENV` | yes | `production` in production. |
| `APP_URL` | yes | Public HTTPS base URL. All secure email action links are generated from it. |
| `PORT` | no | Web app port (default 3000; internal only). |
| `POSTGRES_PASSWORD` | compose | Password for the compose-provisioned PostgreSQL; `DATABASE_URL` is derived from it. |
| `DATABASE_URL` | non-compose | PostgreSQL connection string (Prisma format). |
| `REDIS_URL` | yes | Redis connection string (queues). |
| `SESSION_SECRET` | yes | ≥32 chars. Session infrastructure secret. Rotating it does not invalidate sessions (sessions are server-side rows) but keep it stable. |
| `ENCRYPTION_KEY` | yes | ≥32 chars (64-hex recommended). AES-256-GCM key for secrets at rest: SMTP password, temporary credential secrets. **Rotating it makes previously encrypted values unreadable** — re-enter the SMTP password and resend outstanding credential deliveries after rotation. |
| `TOKEN_SIGNING_KEY` | yes | ≥32 chars. HMAC key signing secure email tokens. Rotating it invalidates all outstanding email links (approvals, corrections, credentials, handovers) — resend from the portal. |
| `STORAGE_PATH` | yes | Directory for uploaded/generated files, outside the web root. In Docker: `/var/lib/axivo/storage` (persistent volume). |
| `SEED_ADMIN_USERNAME/EMAIL/PASSWORD` | first run | Bootstrap System Administrator, created only when no system user exists. Change the password after first login. |

Secrets are never committed to source control and never written to logs.

## Runtime settings (Settings pages)

All stored in `system_settings` with full change history
(`system_setting_history`) and audit events.

### Security (Settings → Security) — SDS Doc 05
- Session idle timeout (default 30 min) and absolute timeout (default 12 h)
- Failed logins before cooldown (default 5) and cooldown minutes (default 5) —
  temporary throttling only, never a permanent lockout
- Secure email link expiry (default 72 h)
- Temporary credential expiry (default 72 h) — after this the encrypted secret
  is destroyed by the worker
- Public form submissions per IP per hour (default 20)
- Minimum password length (≥12; the SDS baseline of upper/lower/number/special
  cannot be weakened)

### Email (Settings → Email) — SDS Doc 17 Ch5
SMTP server, port, encryption (none/STARTTLS/SSL), authentication, sender
identity, reply-to. The password is stored AES-256-GCM-encrypted and never
displayed. **Send Test Email** verifies connection, authentication and
delivery before relying on the configuration.

### General & Branding (Settings → General) — SDS Doc 17 Ch6
System name, primary/secondary brand colors (propagate across the app),
maintenance mode (blocks non-administrators, configurable message, audited),
upload limits (max size, allowed extensions — executables always rejected).

### Notifications (Settings → Notifications) — SDS Doc 14
Reminder delays for pending approvals / implementations / acknowledgements
(0 disables), requester rejection/completion emails, contract & license
reminder day schedules (e.g. `60, 30, 14, 7`).

### Notification templates (Notifications page)
Versioned templates with `{{variable}}` substitution. Editing creates a new
version; sent notifications are immutable history.

## Organization-level configuration

Companies, departments, locations, positions, approval roles and their
per-company assignments, department heads, applications (+roles, +credential
fields), asset categories (handover/clearance flags), workflows (versioned
step chains) and forms (versioned, one workflow each) are all managed in the
portal — no code changes required for customer-specific behaviour
(SDS Doc 01 Ch2).
