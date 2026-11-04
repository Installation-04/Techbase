#!/bin/bash
# Runs a command as the application user with the container's runtime settings
# (database host and password included), for example:
#   docker compose exec -T techibase techibase-run node src/scheduler.js --once
set -euo pipefail
set -a
[ -f /run/techibase.env ] && . /run/techibase.env
set +a
cd /app
exec gosu app "$@"
