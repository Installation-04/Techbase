#!/usr/bin/env bash
# End-to-end smoke test of the Docker stack. Run it after the stack is up:
#
#   docker compose up -d --build --wait
#   scripts/docker-smoke.sh [--restart]
#
# --restart additionally stops and restarts every container (keeping volumes)
# to prove accounts and uploaded documents survive. Used by CI and handy after
# any change to the Dockerfiles, nginx.conf or docker-compose.yml.
# Needs bash, curl and node on the host (Linux `date -d`).
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

# The port the web app is published on: $HTTP_PORT, else the one in .env, else the default.
if [ -z "${HTTP_PORT:-}" ] && [ -f .env ]; then
  HTTP_PORT="$(grep -E '^HTTP_PORT=' .env | tail -n 1 | cut -d= -f2 || true)"
fi
BASE="${BASE:-http://localhost:${HTTP_PORT:-26591}}"
COMPOSE="${COMPOSE:-docker compose}"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
EMAIL="smoke-$RANDOM$RANDOM@example.com"
PASSWORD="smoke-test-pw-123"
CHECKS=0
TAG="$RANDOM$RANDOM" # unique per run, so the script can be re-run against a stack that already holds data
BOILER="Smoke Boiler $TAG"

step() { printf '  %-66s' "$1"; }
pass() { echo "ok"; CHECKS=$((CHECKS + 1)); }
fail() { echo "FAIL"; echo "    -> $1" >&2; exit 1; }
json() { node -e "let s='';process.stdin.on('data',c=>s+=c).on('end',()=>{const j=JSON.parse(s);console.log($1)})"; }
api() { curl -fsS -H "Authorization: Bearer $TOKEN" "$@"; }

# One all-in-one container (docker-compose.single.yml) or the four-container stack?
if $COMPOSE config --services 2>/dev/null | grep -qx techibase; then SINGLE=1; else SINGLE=0; fi
if [ "$SINGLE" = 1 ]; then echo "Smoke test against $BASE (all-in-one container)"; else echo "Smoke test against $BASE"; fi

step "API answers through nginx (/api/health)"
[ "$(curl -fsS "$BASE/api/health" | json j.status)" = "ok" ] && pass || fail "health check did not return ok"

step "backend port 3001 is not published on the host"
if curl -sS -m 3 http://localhost:3001/api/health >/dev/null 2>&1; then fail "port 3001 answers from the host"; else pass; fi

step "backend and scheduler processes run as an unprivileged user"
# `docker exec` shells start as root, so inspect the app process itself.
if [ "$SINGLE" = 1 ]; then
  for script in index.js scheduler.js; do
    OWNER="$($COMPOSE exec -T techibase sh -c "ps -eo user=,args= | awk '\$2==\"node\" && \$3==\"src/$script\" {print \$1; exit}'")"
    [ -n "$OWNER" ] && [ "$OWNER" != "root" ] || fail "node src/$script runs as '${OWNER:-unknown}'"
  done
else
  for svc in backend scheduler; do
    OWNER="$($COMPOSE exec -T "$svc" sh -c "ps -o user= -o args= | awk '\$2==\"node\" {print \$1; exit}'")"
    [ -n "$OWNER" ] && [ "$OWNER" != "root" ] || fail "$svc app process runs as '${OWNER:-unknown}'"
  done
fi
pass

step "app shell: security headers and no-cache on index.html"
HEADERS="$(curl -fsSI "$BASE/")"
echo "$HEADERS" | grep -qi '^x-content-type-options: nosniff' || fail "missing X-Content-Type-Options"
echo "$HEADERS" | grep -qi '^x-frame-options: DENY' || fail "missing X-Frame-Options"
echo "$HEADERS" | grep -qi '^cache-control: no-cache' || fail "index.html is cacheable"
pass

step "hashed assets: gzip + immutable long cache"
ASSET="$(curl -fsS "$BASE/" | grep -o '/assets/[^"]*\.js' | head -1)"
AH="$(curl -fsSI -H 'Accept-Encoding: gzip' "$BASE$ASSET")"
echo "$AH" | grep -qi '^content-encoding: gzip' || fail "$ASSET is not gzipped"
echo "$AH" | grep -qi '^cache-control: .*immutable' || fail "$ASSET is not immutable-cached"
pass

step "unknown asset is a 404, not the app shell"
[ "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/assets/does-not-exist.js")" = "404" ] && pass || fail "expected 404"

step "register an account"
REG="$(curl -fsS -X POST "$BASE/api/users/register" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\",\"name\":\"Smoke Test\"}")"
TOKEN="$(echo "$REG" | json j.token)"
[ -n "$TOKEN" ] && pass || fail "no token returned"

step "create a client"
CLIENT_ID="$(api -X POST "$BASE/api/clients" -H 'Content-Type: application/json' -d '{"name":"Smoke Client"}' | json j.id)"
[ -n "$CLIENT_ID" ] && pass || fail "client not created"

step "upload a 3 MB document (past nginx's 1 MB default; written by non-root)"
head -c 3145728 /dev/urandom > "$TMP/big.bin"
DOC_ID="$(api -X POST "$BASE/api/clients/$CLIENT_ID/documents" -F "file=@$TMP/big.bin;type=application/octet-stream" | json j.id)"
[ -n "$DOC_ID" ] && pass || fail "upload failed"

step "download returns exactly the bytes that were uploaded"
api -o "$TMP/big.out" "$BASE/api/clients/$CLIENT_ID/documents/$DOC_ID/download"
cmp -s "$TMP/big.bin" "$TMP/big.out" && pass || fail "downloaded file differs"

step "an uploaded HTML file is served as an attachment, never inline"
printf '<script>alert(1)</script>' > "$TMP/evil.html"
HTML_ID="$(api -X POST "$BASE/api/clients/$CLIENT_ID/documents" -F "file=@$TMP/evil.html;type=text/html" | json j.id)"
DH="$(curl -fsSI -H "Authorization: Bearer $TOKEN" "$BASE/api/clients/$CLIENT_ID/documents/$HTML_ID/download")"
echo "$DH" | grep -qi '^content-disposition: attachment' || fail "not an attachment"
echo "$DH" | grep -qi '^x-content-type-options: nosniff' || fail "missing nosniff"
pass

if [ -n "${GOOGLE_CLIENT_ID:-}" ]; then
  step "settings in .env reach the backend (Google SSO enabled)"
  [ "$(curl -fsS "$BASE/api/auth/providers" | json j.google)" = "true" ] && pass || fail "GOOGLE_CLIENT_ID not passed through"
fi

if [ "$SINGLE" = 1 ]; then
  step "techibase-backup produces a valid archive with the database and uploads"
  $COMPOSE exec -T techibase techibase-backup > "$TMP/backup.tar.gz" || fail "techibase-backup failed"
  tar -tzf "$TMP/backup.tar.gz" > "$TMP/backup.list" || fail "backup is not a valid .tar.gz"
  grep -qx 'db.sql' "$TMP/backup.list" && grep -q '^uploads/' "$TMP/backup.list" || fail "backup lacks db.sql or uploads/"
  pass

  step "techibase-restore puts the database back as it was at the backup"
  LATE_ID="$(api -X POST "$BASE/api/clients" -H 'Content-Type: application/json' -d "{\"name\":\"Added after the backup $TAG\"}" | json j.id)"
  [ -n "$LATE_ID" ] || fail "could not create the late client"
  $COMPOSE exec -T techibase techibase-restore < "$TMP/backup.tar.gz" >"$TMP/restore.log" 2>&1 || { cat "$TMP/restore.log"; fail "techibase-restore failed"; }
  LATE="$(api "$BASE/api/clients" | json "j.filter(c => c.name === 'Added after the backup $TAG').length")"
  KEPT="$(api "$BASE/api/clients" | json "j.filter(c => c.name === 'Smoke Client').length")"
  [ "$LATE" = "0" ] && [ "$KEPT" -ge 1 ] || fail "after the restore: late client present=$LATE, original clients=$KEPT"
  api -o "$TMP/big.restored" "$BASE/api/clients/$CLIENT_ID/documents/$DOC_ID/download"
  cmp -s "$TMP/big.bin" "$TMP/big.restored" && pass || fail "the document is not intact after the restore"
fi

step "scheduler job creates one preventive work order"
DUE="$(date -d '+3 days' +%F)"
api -X POST "$BASE/api/clients/$CLIENT_ID/equipment" -H 'Content-Type: application/json' \
  -d "{\"name\":\"$BOILER\",\"next_maintenance\":\"$DUE\"}" >/dev/null
run_scheduler_once() { if [ "$SINGLE" = 1 ]; then $COMPOSE exec -T techibase techibase-run node src/scheduler.js --once; else $COMPOSE exec -T scheduler node src/scheduler.js --once; fi; }
run_scheduler_once >"$TMP/sched.log" 2>&1 || { cat "$TMP/sched.log"; fail "scheduler --once failed"; }
COUNT="$(api "$BASE/api/work-orders" | json "j.filter(w => w.title === 'Maintenance préventive — $BOILER').length")"
[ "$COUNT" = "1" ] && pass || fail "expected 1 work order, found $COUNT"

step "running the scheduler again does not duplicate it"
run_scheduler_once >/dev/null 2>&1
COUNT="$(api "$BASE/api/work-orders" | json "j.filter(w => w.title === 'Maintenance préventive — $BOILER').length")"
[ "$COUNT" = "1" ] && pass || fail "expected 1 work order after rerun, found $COUNT"

if [ "${1:-}" = "--restart" ]; then
  echo "  (restarting every container, keeping volumes...)"
  $COMPOSE down >/dev/null 2>&1
  $COMPOSE up -d --wait >/dev/null 2>&1 || fail "stack did not come back healthy"

  step "after restart: same account can log in"
  TOKEN="$(curl -fsS -X POST "$BASE/api/users/login" -H 'Content-Type: application/json' \
    -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}" | json j.token)"
  [ -n "$TOKEN" ] && pass || fail "login failed after restart"

  step "after restart: the uploaded document is still intact"
  api -o "$TMP/big.out2" "$BASE/api/clients/$CLIENT_ID/documents/$DOC_ID/download"
  cmp -s "$TMP/big.bin" "$TMP/big.out2" && pass || fail "document changed or missing after restart"
fi

echo "All $CHECKS checks passed."
