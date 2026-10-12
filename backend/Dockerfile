# TechIBase API (and, with a different command, the daily scheduler).
FROM node:20-alpine

ENV NODE_ENV=production
WORKDIR /app

# Production dependencies only, installed from the lockfile.
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY src ./src

# su-exec lets the entrypoint drop root after fixing volume ownership.
RUN apk add --no-cache su-exec \
    && mkdir -p /app/uploads \
    && chown -R node:node /app/uploads
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

EXPOSE 3001
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=5 \
  CMD wget -qO- http://127.0.0.1:3001/api/health >/dev/null || exit 1

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "src/index.js"]
