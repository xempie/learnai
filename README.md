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

Signup runs real cohort assignment (T05, §4.1) synchronously before the `users` row is inserted
— see [Cohort assignment](#cohort-assignment) below. A disposable-domain email is rejected with
`422 DISPOSABLE_EMAIL` before any row is written; every other outcome sets `cohort_track` and
`organisation_id` on the new row. Verification emails are logged to the server console in dev
(`apps/web/src/lib/auth/mailer.ts`); T19 swaps in SES.

| Endpoint                       | Purpose                                                     |
| ------------------------------ | ----------------------------------------------------------- |
| `POST /api/v1/auth/signup`     | Create a `users` row + password credential                  |
| `POST/GET /api/v1/auth/verify` | Verify email via a one-time token                           |
| `GET /api/v1/me`               | Profile skeleton; proves `requireUser`/`requireRole` guards |

## Cohort assignment

Domain parsing and organisation matching (`LEARN_AI_V1_BUILD_SPEC.md` §4.1) lives in
`packages/cohort` (`@learn-ai/cohort`) as a pure, DB-free layer: `classifyEmail(email, {
freeMailDomains, disposableDomains })` normalises and validates an address, reduces its host to
a registrable domain via a real Public Suffix List (the `tldts` package — `mail.student.mq.edu.au`
→ `mq.edu.au`), and returns a discriminated union (`invalid` | `free_mail` | `disposable` |
`organisation`). `deriveName`/`inferKind` implement the spec's fallback naming/kind rules for
domains with no `known_institutions` match.

The DB-aware controller layer — find-or-create against `organisations`/`organisation_domains`,
wiring into signup, auto-creating orgs — is `packages/db/src/cohort-assignment.ts`
(`assignCohort`, T05). It never throws: any unexpected error (DB unavailable, an unexpected
constraint violation) is caught, logged, and resolved as the `individual` track, per §4's
NON-NEGOTIABLE "cohort assignment must never fail a signup". The one non-error outcome,
`rejected: 'disposable'`, is the caller's (signup route's) job to turn into a 422.

**Known-institutions longest-suffix match (T05 deviation, documented in code):** the real Public
Suffix List's `gov.au` entry is a plain suffix (no state-level wildcard), so
`health.nsw.gov.au` and `education.nsw.gov.au` both reduce to the _same_ registrable domain,
`nsw.gov.au` — per the spec's own reduction rule (suffix + one label), not a bug in
`packages/cohort`. `assignCohort` resolves this by checking `known_institutions` for the longest
matching suffix of the _full, unreduced_ host before running §4.1 step 3's PSL reduction; a match
supplies the organisation's domain/name/kind directly (not flagged `auto_created`, since the name
is already authoritative) and a non-match falls through to the unmodified §4.1 steps 3–6.

Organisation find-or-create is concurrency-safe: two simultaneous signups from the same brand-new
domain create exactly one organisation (`INSERT ... ON CONFLICT (primary_domain) DO NOTHING` +
re-select, plus slug dedupe retried on a genuine `organisations_slug_key` collision).
`organisations.member_count` is maintained by the recount-on-write trigger added in T02
(`trg_users_member_count` — fires on `users` insert, `UPDATE OF organisation_id`, and delete);
T05 verified it rather than re-implementing it.

Coverage for this package is enforced separately: `vitest.config.ts` sets `coverage.enabled:
true` with a threshold scoped to `packages/cohort/src/**` (branches ≥ 95%, per §11), so `pnpm
test` fails the build if it regresses — not just `pnpm test:coverage`.

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
apps/web         Next.js App Router frontend (TypeScript, Tailwind)
packages/db      Schema, migrations, seeds, pg pool client (@learn-ai/db)
packages/cohort  Domain parsing / cohort classification, pure (@learn-ai/cohort)
```

## Build spec

This repo is built against [`LEARN_AI_V1_BUILD_SPEC.md`](./LEARN_AI_V1_BUILD_SPEC.md), the
authoritative specification for V1. See `AGENTS.md` for the working rules used to execute it.
