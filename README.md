# Axivo

Axivo is a self-hosted IT Operations platform: access management, asset
management, license management, workflow automation, approval management,
secure credential delivery, document management, audit & compliance, contract
management and reporting — built for multi-company organizations.

Implemented against the Axivo Software Design Specification (see `SDS/`).
Document 00 (Clarifications & Authoritative Decisions) governs scope:
Version 1 is local-authentication, internal-services-only (no public REST API),
deployed as a single Docker Compose stack.

## How it works

- **Requesters** submit public single-page forms (`/r/<form-slug>`) without any
  account. Each selected item (application, asset, …) gets its own workflow
  instance and is approved and implemented independently.
- **Approvers** (Department Heads, HR, GM, …) never sign in — they act through
  secure, signed, single-use email links.
- **IT portal users** (System Administrator, IT Administrator, IT Support,
  Read Only) sign into the portal to manage the catalogue, implement approved
  requests, deliver credentials via one-time secure reveals, hand over assets,
  run clearance, and review the immutable audit trail.

## Technology

Next.js (App Router) · TypeScript · PostgreSQL (Prisma) · Redis + BullMQ
worker · Tailwind CSS · Argon2id · AES-256-GCM · Nginx · Docker Compose.

## Repository layout

```
SDS/                 Software Design Specification (authoritative)
prisma/              Schema, migrations, idempotent seed
src/app/             Presentation layer (portal, public forms, action pages)
src/modules/<name>/  Business modules: validators + service + server actions
src/shared/          Auth, RBAC, audit, crypto, tokens, storage, email, queue
src/workers/         Background worker (email delivery, reminders, cleanup)
tests/               Unit + integration tests (vitest)
deploy/              Nginx configuration, backup script
docs/                Deployment, configuration, database, internal services
```

## Quick start (development)

```bash
docker run -d --name axivo-dev-pg -e POSTGRES_USER=axivo -e POSTGRES_PASSWORD=axivo \
  -e POSTGRES_DB=axivo -p 5432:5432 postgres:17-alpine
docker run -d --name axivo-dev-redis -p 6379:6379 redis:7-alpine

cp .env.example .env       # fill in dev values (see docs/configuration.md)
npm install
npx prisma migrate deploy
npx tsx prisma/seed.ts     # creates roles, templates and the initial admin
npm run dev                # web app on http://localhost:3000
npm run worker             # background worker (separate terminal)
```

Sign in with the `SEED_ADMIN_*` credentials from `.env` and change the
password immediately.

## Production

See `docs/deployment.md`. Summary: `cp .env.example .env`, set real secrets,
`docker compose up -d`. Only Nginx is exposed; PostgreSQL and Redis stay on an
internal network. Migrations and the idempotent seed run automatically via the
one-shot `migrate` service on every deploy.

## Tests

```bash
npm test        # unit + integration (integration needs the dev containers above)
npm run typecheck
```

The integration suite provisions its own `axivo_integration` database and
exercises the critical path end-to-end: submission → approver resolution →
approval → implementation → credential delivery → acknowledgement →
completion, plus license over-allocation prevention, asset lifecycle rules,
secure token lifecycle and login throttling.

## Documentation

- `docs/deployment.md` — production install, backup/restore, updates
- `docs/configuration.md` — every environment variable and runtime setting
- `docs/database.md` — schema overview, integrity rules, migrations
- `docs/internal-services.md` — internal service architecture (Doc 18 scope)
