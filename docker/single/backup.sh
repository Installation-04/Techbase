#!/bin/bash
# Writes a complete TechIBase backup (database dump + uploaded documents) to stdout
# as a .tar.gz. Run from the host:
#
#   docker compose exec -T techibase techibase-backup > techibase-$(date +%F).tar.gz
#
# Keep the file (and a copy of your .env: without the same JWT_SECRET the restored
# vault passwords are unreadable) somewhere other than this server.
set -euo pipefail

# The entrypoint records the effective database settings (generated password, bundled host);
# `docker compose exec` does not inherit them, and .env may still say DB_PASSWORD=changeme.
if [ -f /run/techibase.env ]; then set -a; . /run/techibase.env; set +a; fi

DATA_DIR="${DATA_DIR:-/data}"
UPLOADS_DIR="${UPLOADS_DIR:-$DATA_DIR/uploads}"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

export PGHOST="${DB_HOST:-127.0.0.1}" PGPORT="${DB_PORT:-5432}" PGUSER="${DB_USER:-techbase}" \
       PGPASSWORD="${DB_PASSWORD:-}" PGDATABASE="${DB_NAME:-techbase}"
if [ -z "$PGPASSWORD" ] && [ -s "$DATA_DIR/db-password" ]; then PGPASSWORD="$(cat "$DATA_DIR/db-password")"; fi

if [ -n "${DATABASE_URL:-}" ]; then
  pg_dump --clean --if-exists --no-owner --dbname "$DATABASE_URL" > "$WORK/db.sql"
else
  pg_dump --clean --if-exists --no-owner > "$WORK/db.sql"
fi
mkdir -p "$WORK/uploads"
[ -d "$UPLOADS_DIR" ] && cp -a "$UPLOADS_DIR/." "$WORK/uploads/"
echo "techibase-backup v1 $(date -u +%FT%TZ)" > "$WORK/MANIFEST"
tar -czf - -C "$WORK" MANIFEST db.sql uploads
