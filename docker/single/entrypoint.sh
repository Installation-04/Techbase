#!/bin/bash
# Supervisor of the all-in-one TechIBase container (run under tini as PID 1).
#
#   PostgreSQL  -> API (node)  -> scheduler (node)  -> nginx
#
# * Everything persistent lives under $DATA_DIR (default /data): postgres/ and uploads/.
# * Bundled PostgreSQL is skipped when DATABASE_URL or DB_HOST points at an external one.
# * If any process exits, the others are stopped and the container exits non-zero, so
#   Docker's restart policy brings the whole thing back (never a half-working container).
# * On SIGTERM/SIGINT: nginx, then the app, then PostgreSQL last, so no request is cut
#   off from its database while it drains.
set -uo pipefail

DATA_DIR="${DATA_DIR:-/data}"
PGDATA="$DATA_DIR/postgres"
UPLOADS_DIR="${UPLOADS_DIR:-$DATA_DIR/uploads}"
PGBIN="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | tail -n 1)"
[ -n "${PGBIN:-}" ] && PATH="$PGBIN:$PATH"
RUN_AS_APP=(gosu app)
RUN_AS_PG=(gosu postgres)
[ -n "${TECHIBASE_NO_PRIVILEGE_DROP:-}" ] && { RUN_AS_APP=(); RUN_AS_PG=(); } # tests only

log() { echo "[techibase] $*"; }
die() { echo "[techibase] ERROR: $*" >&2; exit 1; }

[ -n "${JWT_SECRET:-}" ] || die "JWT_SECRET is not set. It signs sessions and encrypts the password vault: set it in .env (./install.sh does this) and never change it afterwards."

# ---------- database: bundled or external ----------
BUNDLED=1
if [ -n "${DATABASE_URL:-}" ] || [ -n "${DB_HOST:-}" ]; then
  BUNDLED=0
  log "using an external database (bundled PostgreSQL is off)"
fi

DB_NAME="${DB_NAME:-techbase}"
DB_USER="${DB_USER:-techbase}"
if [ "$BUNDLED" = 1 ]; then
  for v in "$DB_NAME" "$DB_USER"; do
    [[ "$v" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] || die "DB_NAME and DB_USER may only contain letters, digits and underscores (got '$v')"
  done
fi

PIDS=()
NAMES=()
STOPPING=0

start() { # start <name> <command...>   (runs in the background, tracked)
  local name="$1"; shift
  "$@" &
  PIDS+=("$!"); NAMES+=("$name")
  log "started $name (pid $!)"
}

stop_one() { # stop_one <name> <signal>
  local i
  for i in "${!NAMES[@]}"; do
    if [ "${NAMES[$i]}" = "$1" ] && kill -0 "${PIDS[$i]}" 2>/dev/null; then kill "-$2" "${PIDS[$i]}" 2>/dev/null || true; fi
  done
}

wait_for() { # wait_for <name> <seconds> <command...>
  local name="$1" secs="$2"; shift 2
  local i
  for ((i = 0; i < secs * 2; i++)); do
    "$@" >/dev/null 2>&1 && return 0
    sleep 0.5
  done
  die "$name did not become ready within ${secs}s"
}

shutdown() {
  [ "$STOPPING" = 1 ] && return
  STOPPING=1
  log "stopping..."
  stop_one nginx QUIT
  stop_one scheduler TERM
  stop_one api TERM
  sleep 1
  stop_one postgres INT # "fast" shutdown: disconnect clients, then stop cleanly
  local pid
  for pid in "${PIDS[@]}"; do wait "$pid" 2>/dev/null; done
}
trap 'shutdown; exit 0' TERM INT

# ---------- PostgreSQL ----------
if [ "$BUNDLED" = 1 ]; then
  mkdir -p "$PGDATA" "$UPLOADS_DIR" /var/run/postgresql
  PWFILE="$DATA_DIR/db-password"
  if [ -n "${DB_PASSWORD:-}" ] && [ "$DB_PASSWORD" != "changeme" ]; then
    :
  elif [ -s "$PWFILE" ]; then
    DB_PASSWORD="$(cat "$PWFILE")"
  else
    DB_PASSWORD="$(head -c 24 /dev/urandom | od -An -tx1 | tr -d ' \n')"
    (umask 077; printf '%s' "$DB_PASSWORD" > "$PWFILE")
    log "generated a database password (stored in $PWFILE)"
  fi
  chown postgres:postgres "$PGDATA" /var/run/postgresql 2>/dev/null || true
  chmod 700 "$PGDATA"

  if [ -s "$PGDATA/PG_VERSION" ]; then
    have="$(cat "$PGDATA/PG_VERSION")"; want="$(basename "$(dirname "$PGBIN")")"
    [ "$have" = "$want" ] || die "the database in $PGDATA is PostgreSQL $have but this image runs PostgreSQL $want. Restore from a backup instead of reusing the folder."
  else
    log "initialising a new database in $PGDATA"
    "${RUN_AS_PG[@]}" initdb -D "$PGDATA" -U postgres --encoding=UTF8 --auth-local=peer --auth-host=scram-sha-256 >/dev/null || die "initdb failed"
  fi

  start postgres "${RUN_AS_PG[@]}" postgres -D "$PGDATA" -c listen_addresses=127.0.0.1 -c unix_socket_directories=/var/run/postgresql -c "timezone=${TZ:-UTC}"
  wait_for postgresql 60 pg_isready -h 127.0.0.1 -p 5432

  # Idempotent on every start: the role and database exist, and the password follows .env.
  psql_admin() { "${RUN_AS_PG[@]}" psql -h /var/run/postgresql -U postgres -v ON_ERROR_STOP=1 -q "$@"; }
  psql_admin -v pw="$DB_PASSWORD" -v dbuser="$DB_USER" -d postgres <<'SQL' || die "could not set up the database role"
SELECT format('CREATE ROLE %I LOGIN', :'dbuser') WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'dbuser') \gexec
SELECT format('ALTER ROLE %I PASSWORD %L', :'dbuser', :'pw') \gexec
SQL
  psql_admin -v dbname="$DB_NAME" -v dbuser="$DB_USER" -d postgres <<'SQL' || die "could not create the database"
SELECT format('CREATE DATABASE %I OWNER %I ENCODING ''UTF8''', :'dbname', :'dbuser') WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = :'dbname') \gexec
SQL
  export DB_HOST=127.0.0.1 DB_PORT=5432 DB_NAME DB_USER DB_PASSWORD
else
  mkdir -p "$UPLOADS_DIR"
fi
chown -R app:app "$UPLOADS_DIR" 2>/dev/null || true

# ---------- application ----------
export UPLOADS_DIR PORT=3001
# `docker compose exec` does not inherit what this script exported (the generated
# database password, the bundled host); techibase-run reads it back from here.
{ for v in DB_HOST DB_PORT DB_NAME DB_USER DB_PASSWORD UPLOADS_DIR; do printf 'export %s=%q\n' "$v" "${!v-}"; done; } > /run/techibase.env 2>/dev/null && chmod 600 /run/techibase.env
cd /app || die "/app is missing"
start api "${RUN_AS_APP[@]}" node src/index.js
wait_for "the API" 90 curl -fsS http://127.0.0.1:3001/api/health
start scheduler "${RUN_AS_APP[@]}" node src/scheduler.js
start nginx nginx -g 'daemon off;'
log "TechIBase ${TECHIBASE_VERSION:-} is up"

# ---------- supervise ----------
wait -n
status=$?
if [ "$STOPPING" = 0 ]; then
  for i in "${!PIDS[@]}"; do
    kill -0 "${PIDS[$i]}" 2>/dev/null || log "${NAMES[$i]} exited (status $status)"
  done
  shutdown
  exit 1
fi
exit 0
