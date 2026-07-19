# Axivo — Internal Service Architecture

Per SDS Doc 00 §3, Version 1 exposes **no public REST API**: no external
gateway, SDK or third-party developer surface. All communication is internal
between the browser and the Next.js server. This document describes that
internal architecture (the Doc 18 scope as clarified by Doc 00).

## Communication model (Doc 02 Ch6)

```
Browser
  └─ Server Actions ("use server") ──> module actions (auth + RBAC + validation)
        └─ module services (business rules, transactions, audit)
              └─ Prisma repositories ──> PostgreSQL
  └─ Internal app routes (session-gated):
        GET /api/documents/:id/download        document delivery (audited)
        GET /api/audit/export?format=csv|xlsx  audit export (audit.export)
        GET /api/reports/:key/export           report export (reports.export)
  └─ Public token routes (no session; signed single-use tokens):
        /r/:slug                public request form
        /action/approval        approve / reject / request correction
        /action/correction      correction resubmission
        /action/credentials     credential acknowledgement + one-time reveal
        /action/handover        asset handover acknowledgement
```

The browser never reaches PostgreSQL, Redis or the worker. Workers never talk
to browsers.

## Server action contract

Every server action follows the same pipeline (Doc 05 Ch11):

1. `requirePermission(...)` — session validation + RBAC (deny by default;
   denials audited) or `publicAuditContext` + token validation for public
   flows.
2. `parseInput(schema, raw)` — zod `.strict()` validation; unexpected fields
   rejected; field-level errors returned for inline display.
3. Service call — business rules inside a database transaction where multiple
   records change (Doc 04 Ch11); audit events written atomically with the
   change.
4. Result envelope — `{ ok: true, data }` or
   `{ ok: false, error, kind, fieldErrors? }`. Internal exceptions are logged
   server-side and replaced with a generic message.

## Module service boundaries (Doc 02 Ch4)

`src/modules/<module>/{validators,service,actions}.ts`. Modules never touch
another module's tables directly — they call the other module's service
(e.g. Requests → `workflow/engine`, `applications/service`,
`licenses/service`, `assets/service`, `credentials/service`;
Assets → `documents/service` for generated PDFs). Shared concerns live in
`src/shared`: auth/session/RBAC, audit, encryption, secure tokens, settings,
storage, email transport, queue, PDF rendering.

## Secure email tokens (Doc 05 Ch8)

Format `random.HMAC(random)` — cryptographically random, HMAC-signed,
single-purpose, time-limited, single-use where applicable. Only the SHA-256
hash of the random part is stored. Validation order: signature → existence →
purpose → revocation → expiry → consumption; business state is then checked
by the owning service. Expired/consumed links render a friendly page with
resend guidance.

## Background jobs (Doc 02 Ch7)

BullMQ queues on Redis, processed by `src/workers/index.ts`:

| Job | Schedule | Purpose |
|---|---|---|
| email `send` | on demand (retry ×5, exp. backoff) | notification delivery |
| expire-credential-secrets | */15 min | destroy overdue temporary secrets |
| pending-approval-reminders | hourly | re-send approval emails past the reminder window |
| contract-reminders | daily 07:00 | expiry/renewal reminders + status transitions |
| license-reminders | daily 07:10 | subscription expiry reminders + expiry marking |
| cleanup-expired-tokens | daily 02:30 | purge tokens 30 days past expiry |
| cleanup-sessions | daily 02:45 | purge long-expired sessions |
| sweep-stuck-notifications | */10 min | re-enqueue QUEUED emails that missed enqueue |

Failed jobs log details, never expose internals to users, and never corrupt
business records (notifications are decoupled from business transactions).

## Future extensibility (Doc 18 forward-compatibility)

The action/service split means a future authenticated REST/GraphQL layer can
be added as a new presentation adapter over the existing services without
changing business logic, preserving the Doc 18 roadmap (webhooks, API keys,
rate-limited public APIs) for later versions.
