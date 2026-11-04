#!/usr/bin/env bash
# End-to-end test of the one-click updater with REAL Docker: an installation pinned to 0.0.1
# is updated through the admin API to 0.0.2, rolled back to 0.0.1, then offered a deliberately
# broken 0.0.3 that must be rolled back automatically. Data must survive all of it.
#
# Everything is local: images are derived from one build of this repository, pushed to a throwaway
# registry on localhost:5555, and release existence is answered by a tiny fake of the GitHub API.
#
#   scripts/updater-e2e.sh
#
# Optional (used where Docker cannot reach the internet during `docker build`):
#   E2E_APP_BASE=<image>       reuse an already built all-in-one image instead of building one
#   E2E_UPDATER_BASE=<image>   build the updater from this base plus the docker CLI, not the real Dockerfile
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

REG="localhost:5555"
PROJECT="tbe2e"
WORK="$(mktemp -d)"
INSTALL="$WORK/install"
PASSWORD="e2e-password-123"
CHECKS=0

step() { printf '  %-72s' "$1"; }
pass() { echo "ok"; CHECKS=$((CHECKS + 1)); }
fail() { echo "FAIL"; echo "    -> $1" >&2; show_logs; exit 1; }
show_logs() { (cd "$INSTALL" 2>/dev/null && echo '--- updater state:' && docker compose exec -T updater cat /data/state.json) 2>&1 | tail -5 || true; (cd "$INSTALL" 2>/dev/null && docker compose ps -a && docker compose logs --tail 60 updater techibase) 2>&1 | tail -90 || true; }
cleanup() {
  (cd "$INSTALL" 2>/dev/null && docker compose down -v >/dev/null 2>&1) || true
  docker rm -f tb-e2e-registry tb-e2e-releases >/dev/null 2>&1 || true
  rm -rf "$WORK"
}
trap cleanup EXIT

echo "Updater end-to-end test"

# ---- images -----------------------------------------------------------------
if [ -n "${E2E_APP_BASE:-}" ]; then BASE="$E2E_APP_BASE"; else BASE="tb-e2e-base"; docker build -q -t "$BASE" . >/dev/null; fi

docker rm -f tb-e2e-registry >/dev/null 2>&1 || true
docker run -d --name tb-e2e-registry -p 5555:5000 registry:2 >/dev/null
for i in $(seq 1 30); do curl -fsS "http://$REG/v2/" >/dev/null 2>&1 && break; sleep 1; done

# A release is the same image with another version in package.json; "broken" never starts.
make_release() { # make_release <version> [broken]
  local v="$1" dir; dir="$(mktemp -d)"
  { echo "FROM $BASE"; echo "RUN sed -i 's/\"version\": *\"[^\"]*\"/\"version\": \"$v\"/' /app/package.json"
    [ "${2:-}" = broken ] && echo "RUN sed -i '1a exit 1' /usr/local/bin/techibase-entrypoint"
    true; } > "$dir/Dockerfile"
  docker build -q -t "$REG/techbase:$v" "$dir" >/dev/null
  docker push -q "$REG/techbase:$v" >/dev/null
  rm -rf "$dir"
}
step "build and push app releases 0.0.1, 0.0.2 and a broken 0.0.3"
make_release 0.0.1; make_release 0.0.2; make_release 0.0.3 broken; pass

step "build the updater image and push it as 0.0.1"
if [ -n "${E2E_UPDATER_BASE:-}" ]; then
  d="$(mktemp -d)"; mkdir -p "$d/app"; cp docker/updater/lib.js docker/updater/server.js "$d/app/"
  cat > "$d/Dockerfile" <<DOCKERFILE
FROM docker:cli AS cli
FROM $E2E_UPDATER_BASE
COPY --from=cli /usr/local/bin/docker /usr/local/bin/docker
COPY --from=cli /usr/local/libexec/docker/cli-plugins/docker-compose /usr/local/libexec/docker/cli-plugins/docker-compose
COPY app /app
WORKDIR /app
ENV UPDATER_DATA_DIR=/data NODE_ENV=production
HEALTHCHECK NONE
ENTRYPOINT ["node", "server.js"]
CMD []
DOCKERFILE
  docker build -q -t "$REG/techbase-updater:0.0.1" "$d" >/dev/null; rm -rf "$d"
else
  docker build -q -f docker/updater/Dockerfile -t "$REG/techbase-updater:0.0.1" . >/dev/null
fi
docker push -q "$REG/techbase-updater:0.0.1" >/dev/null; pass

# ---- the fake GitHub releases API ---------------------------------------------
docker run -d --name tb-e2e-releases --entrypoint node "$BASE" -e '
require("http").createServer((req, res) => {
  const ok = /^\/v0\.0\.[123]$/.test(req.url);
  res.writeHead(ok ? 200 : 404, { "Content-Type": "application/json" }); res.end("{}");
}).listen(8080);' >/dev/null

# ---- an installation like the one install.sh --with-updater makes ----------------
mkdir -p "$INSTALL"
cp docker-compose.single.yml docker-compose.single.release.yml docker-compose.updater.yml "$INSTALL/"
TOKEN="$(head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')"
cat > "$INSTALL/.env" <<ENV
COMPOSE_PROJECT_NAME=$PROJECT
JWT_SECRET=$(head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')
HTTP_PORT=26591
TECHIBASE_REGISTRY=$REG
TECHIBASE_VERSION=0.0.1
COMPOSE_FILE=docker-compose.single.yml:docker-compose.single.release.yml:docker-compose.updater.yml
UPDATER_TOKEN=$TOKEN
INSTALL_DIR=$INSTALL
UPDATER_RELEASES_API=http://releases:8080/
ENV
cd "$INSTALL"
step "start the installation (app 0.0.1 + updater) from the local registry"
docker compose up -d --wait --wait-timeout 240 >/dev/null 2>&1 || fail "stack did not start"
docker network connect --alias releases "${PROJECT}_default" tb-e2e-releases
pass

app() { docker compose exec -T techibase "$@"; }
api() { app curl -fsS "$@"; }
json() { node -e "let s='';process.stdin.on('data',c=>s+=c).on('end',()=>{const j=JSON.parse(s);console.log($1)})"; }
version() { api http://127.0.0.1/api/health | json j.version; }

step "the app reports 0.0.1 and the admin panel offers the updater"
[ "$(version)" = "0.0.1" ] || fail "expected 0.0.1, got $(version)"
APP_TOKEN="$(api -X POST http://127.0.0.1/api/users/register -H 'Content-Type: application/json' -d "{\"email\":\"admin@example.com\",\"password\":\"$PASSWORD\",\"name\":\"Admin\"}" | json j.token)"
[ "$(api -H "Authorization: Bearer $APP_TOKEN" http://127.0.0.1/api/admin/system | json j.updaterAvailable)" = "true" ] || fail "updaterAvailable is not true"
pass

authed() { api -H "Authorization: Bearer $APP_TOKEN" -H 'Content-Type: application/json' "$@"; }
step "create a client that must survive every update"
authed -X POST http://127.0.0.1/api/clients -d '{"name":"Avant les mises à jour"}' >/dev/null && pass

wait_state() { # wait_state <wanted-state>
  local want="$1" st=""
  for i in $(seq 1 150); do
    st="$(authed http://127.0.0.1/api/admin/update/status 2>/dev/null | json j.state 2>/dev/null || true)"
    [ "$st" = "$want" ] && return 0
    case "$st" in success|rolled_back|failed) [ "$st" != "$want" ] && { echo "(state: $st)"; return 1; } ;; esac
    sleep 2
  done
  echo "(timed out, last state: ${st:-unreachable})"; return 1
}
survived() { authed http://127.0.0.1/api/clients | json "j.filter(c => c.name === 'Avant les mises à jour').length" ; }

step "a wrong password never reaches the updater"
code="$(app curl -s -o /dev/null -w '%{http_code}' -X POST http://127.0.0.1/api/admin/update -H "Authorization: Bearer $APP_TOKEN" -H 'Content-Type: application/json' -d '{"version":"0.0.2","password":"nope"}')"
[ "$code" = "403" ] || fail "expected 403, got $code"; pass

step "update 0.0.1 -> 0.0.2 through the admin API"
authed -X POST http://127.0.0.1/api/admin/update -d "{\"version\":\"0.0.2\",\"password\":\"$PASSWORD\"}" >/dev/null || fail "request refused"
wait_state success || fail "the update did not succeed"
[ "$(version)" = "0.0.2" ] || fail "expected 0.0.2 after the update, got $(version)"
grep -q '^TECHIBASE_VERSION=0.0.2$' "$INSTALL/.env" || fail ".env was not updated"
pass

step "a backup was written first, and the data survived"
ls "$INSTALL"/backups/pre-update-0.0.1-to-0.0.2-*.tar.gz >/dev/null 2>&1 || fail "no backup file"
[ "$(stat -c %s "$INSTALL"/backups/pre-update-0.0.1-to-0.0.2-*.tar.gz)" -gt 1000 ] || fail "backup is empty"
tar -tzf "$INSTALL"/backups/pre-update-0.0.1-to-0.0.2-*.tar.gz | grep -qx db.sql || fail "backup has no db.sql"
[ "$(survived)" = "1" ] || fail "the client is gone"; pass

step "roll back to 0.0.1 through the admin API"
authed -X POST http://127.0.0.1/api/admin/update/rollback -d "{\"password\":\"$PASSWORD\"}" >/dev/null || fail "rollback refused"
wait_state success || fail "the rollback did not succeed"
[ "$(version)" = "0.0.1" ] || fail "expected 0.0.1 after the rollback, got $(version)"
[ "$(survived)" = "1" ] || fail "the client is gone after the rollback"; pass

step "a release that does not exist is refused, and nothing changes"
code="$(app curl -s -o /dev/null -w '%{http_code}' -X POST http://127.0.0.1/api/admin/update -H "Authorization: Bearer $APP_TOKEN" -H 'Content-Type: application/json' -d "{\"version\":\"0.0.9\",\"password\":\"$PASSWORD\"}")"
[ "$code" = "404" ] || fail "expected 404, got $code"
[ "$(version)" = "0.0.1" ] || fail "version changed"; pass

step "a broken 0.0.3 is rolled back automatically to 0.0.1"
authed -X POST http://127.0.0.1/api/admin/update -d "{\"version\":\"0.0.3\",\"password\":\"$PASSWORD\"}" >/dev/null || fail "request refused"
wait_state rolled_back || fail "expected an automatic rollback"
[ "$(version)" = "0.0.1" ] || fail "expected 0.0.1 after the failed update, got $(version)"
grep -q '^TECHIBASE_VERSION=0.0.1$' "$INSTALL/.env" || fail ".env was not restored"
[ "$(survived)" = "1" ] || fail "the client is gone after the failed update"; pass

step "the updater itself was never recreated"
[ "$(docker inspect -f '{{.RestartCount}}' "${PROJECT}-updater-1")" = "0" ] || fail "updater restarted"
pass

echo "All $CHECKS checks passed."
