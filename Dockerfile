# TechIBase, all in one container: web app (nginx), API, daily scheduler and
# PostgreSQL 15 under one small supervisor. One image, one volume (/data).
#
#   docker compose -f docker-compose.single.yml up -d --build
#
# The base is the official Debian-based postgres:15 image on purpose: existing
# TechIBase databases were created by it, so the same glibc collation applies
# and a data directory moves over unchanged.
FROM node:20-bookworm-slim AS web-build
WORKDIR /app
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM node:20-bookworm-slim AS api-deps
WORKDIR /app
COPY backend/package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

FROM postgres:15-bookworm
ARG TECHIBASE_VERSION=dev
LABEL org.opencontainers.image.title="TechIBase" \
      org.opencontainers.image.description="All-in-one TechIBase (web, API, scheduler, PostgreSQL)" \
      org.opencontainers.image.source="https://github.com/Installation-04/Techbase"

RUN apt-get update \
    && apt-get install -y --no-install-recommends nginx tini curl ca-certificates procps \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --system --home /app --shell /usr/sbin/nologin app \
    && rm -f /etc/nginx/sites-enabled/default /etc/nginx/conf.d/default.conf \
    && sed -i '/^[[:space:]]*gzip on;/d' /etc/nginx/nginx.conf # our conf.d file turns gzip on itself

# Node comes from the official image rather than a distribution package.
COPY --from=web-build /usr/local/bin/node /usr/local/bin/node

WORKDIR /app
COPY --from=api-deps /app/node_modules ./node_modules
COPY backend/package*.json ./
COPY backend/src ./src
COPY --from=web-build /app/dist /usr/share/nginx/html
COPY docker/single/nginx.conf /etc/nginx/conf.d/techibase.conf
COPY frontend/nginx-security-headers.conf /etc/nginx/snippets/security-headers.conf
COPY docker/single/entrypoint.sh /usr/local/bin/techibase-entrypoint
COPY docker/single/backup.sh /usr/local/bin/techibase-backup
COPY docker/single/restore.sh /usr/local/bin/techibase-restore
COPY docker/single/run.sh /usr/local/bin/techibase-run
RUN chmod +x /usr/local/bin/techibase-entrypoint /usr/local/bin/techibase-backup /usr/local/bin/techibase-restore /usr/local/bin/techibase-run

ENV NODE_ENV=production \
    DATA_DIR=/data \
    TECHIBASE_VERSION=${TECHIBASE_VERSION}
VOLUME /data
EXPOSE 80

# The API answers through nginx, so this covers both.
HEALTHCHECK --interval=15s --timeout=5s --start-period=60s --retries=5 \
  CMD curl -fsS http://127.0.0.1/api/health >/dev/null || exit 1

ENTRYPOINT ["tini", "--", "techibase-entrypoint"]
