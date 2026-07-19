# Axivo — Deployment Guide

Target platform (SDS Doc 00 §12): Ubuntu Server LTS, Docker Compose,
PostgreSQL, self-hosted, single production instance, optionally behind a
Cloudflare Tunnel. Windows Server is not a supported production platform.

## Architecture

```
Internet ──> Nginx (only public container)
                │
                ├──> web    (Next.js, stateless, port 3000 internal)
                │              │
worker (BullMQ) ┼──────────────┼──> PostgreSQL 17  (internal network only)
                │              └──> Redis 7        (internal network only)
                └── shared file-storage volume (/var/lib/axivo/storage)
```

- `web` and `worker` are stateless; all state lives in PostgreSQL and the
  `storage` volume (uploads + generated PDFs, outside the web root).
- The `backend` Docker network is `internal: true`: PostgreSQL and Redis are
  unreachable from outside the host.
- The one-shot `migrate` service applies Prisma migrations and the idempotent
  seed before `web`/`worker` start on every deploy.

## Installation

1. Install Docker Engine + Compose plugin on Ubuntu LTS.
2. Clone the repository to e.g. `/opt/axivo`.
3. Configure the environment:
   ```bash
   cp .env.example .env
   # Generate the three secrets:
   openssl rand -hex 32   # SESSION_SECRET
   openssl rand -hex 32   # ENCRYPTION_KEY
   openssl rand -hex 32   # TOKEN_SIGNING_KEY
   ```
   Set `APP_URL` to the public HTTPS URL — secure email links are built from
   it. Set `POSTGRES_PASSWORD` and the `SEED_ADMIN_*` bootstrap credentials.
   `chmod 600 .env`.
4. TLS: either
   - terminate TLS in Nginx (mount certificates, enable the 443 block in
     `deploy/nginx.conf`), or
   - run a Cloudflare Tunnel pointing at `http://localhost:80` (recommended
     per Doc 00) — keep the port-80 server block as-is.
5. Start: `docker compose up -d --build`
6. Sign in at `APP_URL` with the seed administrator and immediately:
   - change the administrator password (Account page),
   - configure SMTP (Settings → Email) and send a test email,
   - rename the Default Company and build your organization structure.

## Updates

```bash
cd /opt/axivo
./deploy/backup.sh /var/backups/axivo    # backup before update (Doc 01 Ch9)
git pull
docker compose up -d --build             # migrate runs automatically
```

Rollback: `git checkout <previous-tag>` and `docker compose up -d --build`;
restore the database from the pre-update backup if a migration must be
reverted (document the rollback in the audit log via a system note).

## Backup

`./deploy/backup.sh <dir>` produces per-run folders containing:

- `axivo-db.dump` — `pg_dump --format=custom` (verified with `pg_restore --list`)
- `axivo-storage.tar.gz` — uploaded and generated documents
- `docker-compose.yml` + `deploy/` — deployment configuration

Excluded by design (SDS Doc 04 Ch12): Redis cache, temporary credential
secrets, runtime logs. `.env` must be backed up separately to an encrypted
location. Schedule via cron, e.g. `0 2 * * * /opt/axivo/deploy/backup.sh /var/backups/axivo`.

## Restore

Restores are performed only by System Administrators (SDS Doc 02 Ch13).

```bash
docker compose down
docker volume rm axivo_pgdata axivo_storage
docker compose up -d postgres
docker compose exec -T postgres pg_restore -U axivo -d axivo --clean --if-exists \
  < backup/axivo-db.dump
docker run --rm -v axivo_storage:/storage -v "$PWD/backup":/backup alpine \
  tar xzf /backup/axivo-storage.tar.gz -C /storage
docker compose up -d
```

Verify after restore: sign in, open Audit Logs (history intact), download a
stored document, submit a test request.

## Monitoring & operations

- **Settings → System Health**: database/Redis status, email queue depth,
  failed deliveries, worker heartbeat (last maintenance job), storage usage,
  active sessions.
- **Settings → Active Sessions**: force logout (Doc 05 Ch13).
- Worker logs: `docker compose logs -f worker` (recurring jobs: credential
  secret expiry every 15 min, reminders hourly/daily, token & session cleanup
  nightly, stuck-notification sweep every 10 min).
- Failed email deliveries retry with exponential backoff (5 attempts) and are
  visible under Notifications with resend controls.

## Failure behaviour

- If the worker is down, requests continue; queued jobs resume when it
  returns (Doc 02 Ch13).
- If SMTP fails, workflow state is unaffected; deliveries retry and surface
  as FAILED for manual resend.
- The application fails safe: business transactions are atomic; no partial
  approvals, credential deliveries or document generations occur.
