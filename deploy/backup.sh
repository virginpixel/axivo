#!/bin/sh
# =============================================================================
# Axivo backup script (SDS Doc 04 Ch12, Doc 17 Ch7)
# Backs up: PostgreSQL database, uploaded/generated files, configuration (.env
# excluded by default - see note), and prints a verification summary.
# Excluded by design: Redis cache, temporary credential secrets (encrypted
# secrets expire automatically and are never part of backups).
#
# Usage:  ./deploy/backup.sh /path/to/backup/dir
# Restore procedure: see docs/deployment.md ("Restore").
# =============================================================================
set -eu

BACKUP_ROOT="${1:?Usage: backup.sh <backup-directory>}"
STAMP="$(date -u +%Y%m%d-%H%M%S)"
TARGET="$BACKUP_ROOT/axivo-$STAMP"
mkdir -p "$TARGET"

echo "[backup] Dumping PostgreSQL database..."
docker compose exec -T postgres pg_dump -U axivo -d axivo --format=custom \
  > "$TARGET/axivo-db.dump"

echo "[backup] Archiving file storage volume..."
docker run --rm \
  -v axivo_storage:/storage:ro \
  -v "$TARGET":/backup \
  alpine tar czf /backup/axivo-storage.tar.gz -C /storage .

echo "[backup] Copying deployment configuration (compose + nginx)..."
cp docker-compose.yml "$TARGET/"
cp -r deploy "$TARGET/deploy"
# NOTE: .env contains secrets. Back it up separately to an encrypted location;
# it is intentionally NOT copied into the standard backup set.

echo "[backup] Verifying database dump integrity..."
docker run --rm -v "$TARGET":/backup postgres:17-alpine \
  pg_restore --list /backup/axivo-db.dump > /dev/null

du -sh "$TARGET"/* | sed 's/^/[backup] /'
echo "[backup] Completed: $TARGET"
