# Learn AI UI demo image — apps/web (Next.js 16, standalone output).
#
# Built in the cloud via CodeBuild (see buildspec.yml) — local Docker is
# unavailable in this environment. Multi-stage: install workspace deps once,
# build only the `web` app (its workspace deps like @learn-ai/db ship raw TS
# source, no build step of their own), then run from the traced standalone
# output so the runtime image doesn't need node_modules or the pnpm store.
#
# DATABASE_URL/AUTH_SECRET are placeholdered at build time only so T03's
# lazily-created pg Pool and NextAuth() config never need a real DB/secret
# during `next build` (getPool() connects lazily, on first query — see
# packages/db/src/client.ts). Runtime values are supplied by App Runner env
# vars instead.

FROM node:22-alpine AS base
RUN corepack enable

# ---- deps: install the full workspace (frozen lockfile) ----
FROM base AS deps
WORKDIR /repo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/package.json
COPY packages/agents/package.json packages/agents/package.json
COPY packages/cohort/package.json packages/cohort/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/infra/package.json packages/infra/package.json
COPY packages/ingestion/package.json packages/ingestion/package.json
COPY packages/llm/package.json packages/llm/package.json
RUN pnpm install --frozen-lockfile

# ---- build: compile the web app only ----
FROM base AS build
WORKDIR /repo
COPY --from=deps /repo /repo
COPY . .
# Build-time-only placeholders — never read at runtime, and never real
# credentials (see header note above / repo README deploy notes).
ENV DATABASE_URL="postgres://build:build@127.0.0.1:5432/build"
ENV AUTH_SECRET="build-placeholder"
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter web build

# ---- runtime: standalone server only ----
FROM base AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 nextjs

# Monorepo standalone output mirrors the repo root; the app's server.js
# lands at apps/web/server.js inside it.
COPY --from=build --chown=nextjs:nodejs /repo/apps/web/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=nextjs:nodejs /repo/apps/web/public ./apps/web/public

USER nextjs
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
