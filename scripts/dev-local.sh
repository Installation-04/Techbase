#!/usr/bin/env bash
# Runs TechIBase locally with no Docker and no Netlify: your own PostgreSQL, the
# Express API (the same non-Netlify code path Docker uses) and the Vite dev
# server. Nothing here talks to Netlify, so it costs no build or function credits.
#
#   scripts/dev-local.sh          # API on :3001, app on http://localhost:5173
#
# Needs PostgreSQL running and a role that can create databases. Defaults match
# a throwaway local setup; override any DB_* variable to use something else.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

export DB_HOST="${DB_HOST:-127.0.0.1}"
export DB_PORT="${DB_PORT:-5432}"
export DB_NAME="${DB_NAME:-techbase}"
export DB_USER="${DB_USER:-techbase}"
export DB_PASSWORD="${DB_PASSWORD:-techbase}"
export JWT_SECRET="${JWT_SECRET:-local-dev-only-secret-change-me-0123456789}"
export PORT="${PORT:-3001}"
export UPLOADS_DIR="${UPLOADS_DIR:-$PWD/.local/uploads}"
export VITE_PROXY_TARGET="${VITE_PROXY_TARGET:-http://localhost:$PORT}"
unset NETLIFY NODE_ENV  # dev mode: readable errors, documents stored on local disk

if ! command -v psql >/dev/null 2>&1; then
  echo "psql introuvable : installez PostgreSQL (ex. apt install postgresql)." >&2
  exit 1
fi

# Create the database on first run (the API applies the schema itself on start).
export PGPASSWORD="$DB_PASSWORD"
if ! psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres -tAc "SELECT 1" >/dev/null 2>&1; then
  echo "Impossible de se connecter à PostgreSQL sur $DB_HOST:$DB_PORT en tant que $DB_USER." >&2
  exit 1
fi
if ! psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname = '$DB_NAME'" | grep -q 1; then
  psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres -c "CREATE DATABASE \"$DB_NAME\"" >/dev/null
  echo "Base de données « $DB_NAME » créée."
fi

[ -d node_modules ] || npm ci
[ -d frontend/node_modules ] || (cd frontend && npm ci)

mkdir -p "$UPLOADS_DIR"
node backend/src/index.js &
API_PID=$!
trap 'kill "$API_PID" 2>/dev/null || true' EXIT INT TERM

echo "API : http://localhost:$PORT/api/health   |   Application : http://localhost:5173"
cd frontend && npm run dev -- --host 127.0.0.1
