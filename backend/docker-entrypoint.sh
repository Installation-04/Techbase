#!/bin/sh
# Runs the app as the unprivileged "node" user. Started as root only so it can
# hand ownership of the uploads volume to that user first: a volume created by
# an older (root) image keeps its root ownership, and without this step an
# upgrade would silently lose the ability to save documents.
set -e

if [ "$(id -u)" = "0" ]; then
  chown -R node:node "${UPLOADS_DIR:-/app/uploads}" 2>/dev/null || true
  exec su-exec node "$@"
fi

exec "$@"
