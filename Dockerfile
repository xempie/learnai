# Acadu production image.
#
# Deliberately NOT a Next.js "standalone" build. Standalone traces only what the
# request path imports, which would drop tsx, the Drizzle migrator and the SQL
# migration files - all of which the boot sequence in scripts/start.ts needs.
#
# Two things keep the image honest about size:
#   - the runner installs production dependencies only, so eslint, typescript,
#     drizzle-kit and the type packages never ship;
#   - ownership is set with COPY --chown rather than a `chown -R` layer, which
#     would rewrite every file and silently double the image.

FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /app
# pnpm 10 turns "a dependency wanted to run a build script and I skipped it"
# into a hard error under --frozen-lockfile. The platform binaries these five
# packages need ship prebuilt in optional dependencies; the tsx check in the
# deps stage proves it for esbuild, the only one the runtime touches.
ENV PNPM_CONFIG_STRICT_DEP_BUILDS=false

# --- full dependency tree, for the build only -------------------------------
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
RUN node node_modules/tsx/dist/cli.mjs --version

# --- runtime dependency tree ------------------------------------------------
FROM base AS prod-deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
# tsx is a real runtime dependency of this image - it is the entrypoint, running
# scripts/start.ts and src/db/seed.ts - so it lives in `dependencies` and comes
# in with this one install. It used to be added afterwards with `pnpm add`,
# which quietly reinstalled the dev tree and tripled the image to 1.26 GB.
RUN pnpm install --frozen-lockfile --prod

# --- build ------------------------------------------------------------------
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# next build must not reach for a database. Any page that would query at build
# time is rendered dynamically instead; this placeholder only satisfies the
# module-level check in src/db/index.ts.
ENV DATABASE_URL="postgres://build:build@127.0.0.1:5432/build"
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm build

# --- runtime ----------------------------------------------------------------
FROM base AS runner
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000

RUN addgroup -S acadu && adduser -S acadu -G acadu

COPY --from=prod-deps --chown=acadu:acadu /app/node_modules ./node_modules
COPY --from=builder   --chown=acadu:acadu /app/.next        ./.next
COPY --from=builder   --chown=acadu:acadu /app/public       ./public
COPY --from=builder   --chown=acadu:acadu /app/package.json ./package.json
COPY --from=builder   --chown=acadu:acadu /app/next.config.ts ./next.config.ts
COPY --from=builder   --chown=acadu:acadu /app/tsconfig.json  ./tsconfig.json
# src carries the migrations, the seed and the schema the entrypoint imports.
COPY --from=builder   --chown=acadu:acadu /app/src           ./src
COPY --from=builder   --chown=acadu:acadu /app/scripts       ./scripts

USER acadu
EXPOSE 3000
CMD ["node", "node_modules/tsx/dist/cli.mjs", "scripts/start.ts"]
