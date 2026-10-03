# syntax=docker/dockerfile:1
FROM node:24-bookworm-slim AS dependencies
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
RUN npm ci

FROM dependencies AS builder
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:24-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3210
COPY --from=builder --chown=node:node /app/.next/standalone ./
# Include production dependencies for the migration CLI and PDF parser's worker.
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/public ./public
COPY --from=builder --chown=node:node /app/drizzle ./drizzle
COPY --chown=node:node scripts/docker-migrate.mjs scripts/docker-entrypoint.sh ./scripts/
RUN mkdir -p data/uploads && chown -R node:node data
USER node
EXPOSE 3210
ENTRYPOINT ["sh", "scripts/docker-entrypoint.sh"]
