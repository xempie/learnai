# Learn AI

A daily AI-literacy product for Australian professionals. One production run per publishing
day produces a brief — one news item, one practical technique, one five-minute video — which
fans out to the website, a PWA, email, social, and a video library that later becomes course
material. Members are grouped automatically into organisation cohorts by email domain, and
every piece of content passes through a human review gate before it reaches an audience.

## Local setup

```
git clone https://github.com/xempie/learnai.git
cd learnai
corepack enable
pnpm install
cp .env.example .env.local
pnpm db:up
pnpm db:migrate
pnpm db:seed
pnpm dev
```

`pnpm dev` serves `apps/web` at http://localhost:3000.

Requires Node 22+ (via `corepack`, which reads the `packageManager` field) and Docker Desktop
for the local Postgres container. `pnpm db:up` starts `postgres:16-alpine` on `localhost:5434`
(container `learnai-postgres` — port 5434, not 5433, so it doesn't clash with the old project's
Postgres container). `pnpm db:migrate` runs the `@learn-ai/db` migrations; `pnpm db:seed` loads
content sources, free-mail/disposable domain lists, known institutions, and the warm-up
schedule. Schema source of truth is `LEARN_AI_V1_BUILD_SPEC.md` §3; the migration lives at
`packages/db/migrations`.

## Database

| Script                 | Purpose                                             |
| ---------------------- | --------------------------------------------------- |
| `pnpm db:up`           | Start the local Postgres container (docker compose) |
| `pnpm db:migrate`      | Run pending migrations (`packages/db`)              |
| `pnpm db:migrate:down` | Roll back the last migration                        |
| `pnpm db:seed`         | Idempotently seed reference/lookup data             |

The `content_sources` seed is **provisional** — LEARN_AI_V1_BUILD_SPEC.md §12 T02 calls for the
business plan's Appendix B source list, which is not available in this repo. `packages/db/src/seeds/content-sources.ts`
seeds ≥25 real, working AI-news RSS sources across tiers 1–3 as a stand-in and is marked
`PROVISIONAL` in code; founder review is required before it is treated as final.

## Auth

Auth.js (NextAuth) v5, Credentials provider (email + password), JWT sessions. Implemented
behind the `AuthProvider` interface (`LEARN_AI_V1_BUILD_SPEC.md` §2.2) in
`apps/web/src/lib/auth/provider.ts` — every route depends on that interface, not on
`next-auth` directly, so swapping providers only touches `lib/auth/`. `users` (packages/db) is
the system of record for identity; `accounts` / `sessions` / `verification_tokens` /
`auth_credentials` (packages/db migration `1755100000000_auth-adapter-tables`) hold
credentials/session material only and always FK to `users(id)`.

Signup does **not** yet run real cohort assignment (T05) — every new user is
`cohort_track = 'individual'` until then. Verification emails are logged to the server console
in dev (`apps/web/src/lib/auth/mailer.ts`); T19 swaps in SES.

| Endpoint                       | Purpose                                                     |
| ------------------------------ | ----------------------------------------------------------- |
| `POST /api/v1/auth/signup`     | Create a `users` row + password credential                  |
| `POST/GET /api/v1/auth/verify` | Verify email via a one-time token                           |
| `GET /api/v1/me`               | Profile skeleton; proves `requireUser`/`requireRole` guards |

## Scripts

Run from the repo root; each fans out across all workspaces (`apps/*`, `packages/*`).

| Script               | Purpose                                 |
| -------------------- | --------------------------------------- |
| `pnpm dev`           | Start the `web` app in development mode |
| `pnpm lint`          | Lint all workspaces                     |
| `pnpm typecheck`     | Type-check all workspaces               |
| `pnpm test`          | Run the Vitest suite                    |
| `pnpm test:coverage` | Run the Vitest suite with coverage      |
| `pnpm format`        | Format the repo with Prettier           |
| `pnpm format:check`  | Check formatting without writing        |
| `pnpm build`         | Build all workspaces                    |

## Monorepo layout

```
apps/web        Next.js App Router frontend (TypeScript, Tailwind)
packages/db      Schema, migrations, seeds, pg pool client (@learn-ai/db)
```

## Build spec

This repo is built against [`LEARN_AI_V1_BUILD_SPEC.md`](./LEARN_AI_V1_BUILD_SPEC.md), the
authoritative specification for V1. See `AGENTS.md` for the working rules used to execute it.
