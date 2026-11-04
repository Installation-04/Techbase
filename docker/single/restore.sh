#!/bin/bash
# Restores a backup made by techibase-backup (read from stdin). The current
# database content and uploaded documents are REPLACED.
#
#   docker compose exec -T techibase techibase-restore < techibase-2026-01-01.tar.gz
#   docker compose restart
#
# Restart afterwards so the application reconnects to the restored data.
set -euo pipefail

DATA_DIR="${DATA_DIR:-/data}"
UPLOADS_DIR="${UPLOADS_DIR:-$DATA_DIR/uploads}"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

tar -xzf - -C "$WORK" || { echo "techibase-restore: not a valid backup archive" >&2; exit 1; }
[ -f "$WORK/MANIFEST" ] && [ -f "$WORK/db.sql" ] || { echo "techibase-restore: the archive has no MANIFEST/db.sql (was it made by techibase-backup?)" >&2; exit 1; }

export PGHOST="${DB_HOST:-127.0.0.1}" PGPORT="${DB_PORT:-5432}" PGUSER="${DB_USER:-techbase}" \
       PGPASSWORD="${DB_PASSWORD:-}" PGDATABASE="${DB_NAME:-techbase}"
if [ -z "$PGPASSWORD" ] && [ -s "$DATA_DIR/db-password" ]; then PGPASSWORD="$(cat "$DATA_DIR/db-password")"; fi

if [ -n "${DATABASE_URL:-}" ]; then
  psql -q -v ON_ERROR_STOP=1 --dbname "$DATABASE_URL" -f "$WORK/db.sql" >/dev/null
else
  psql -q -v ON_ERROR_STOP=1 -f "$WORK/db.sql" >/dev/null
fi

mkdir -p "$UPLOADS_DIR"
find "$UPLOADS_DIR" -mindepth 1 -delete
cp -a "$WORK/uploads/." "$UPLOADS_DIR/"
chown -R app:app "$UPLOADS_DIR" 2>/dev/null || true
echo "techibase-restore: done. Restart the container: docker compose restart"
