# TechIBase updater: the only container that holds the Docker socket (opt-in, see
# docker-compose.updater.yml). Build from the repository root:
#   docker build -f docker/updater/Dockerfile -t techbase-updater .
FROM node:20-alpine
RUN apk add --no-cache docker-cli docker-cli-compose tar
WORKDIR /app
COPY docker/updater/lib.js docker/updater/server.js ./
ENV NODE_ENV=production UPDATER_DATA_DIR=/data
VOLUME /data
EXPOSE 8090
# No HTTP probe (every route needs the secret): the port just has to accept connections.
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=5 \
  CMD node -e "require('net').connect(8090,'127.0.0.1').on('connect',()=>process.exit(0)).on('error',()=>process.exit(1))"
CMD ["node", "server.js"]
