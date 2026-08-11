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

## Cohort page, claims, admin rename queue

`/org/[slug]` (`LEARN_AI_V1_BUILD_SPEC.md` §4.2, T06) is a Next.js server component that consumes
**only** the REST API, through `apps/web/src/lib/api-client.ts` (`apiFetch`) — the single module
§2.1 requires every server-rendered page to go through. `apiFetch` forwards the current request's
session cookie to `GET /api/v1/org/:slug`; the route handler runs the real `requireUser` guard,
so the page has no `authProvider`/`@learn-ai/db` import of its own and reacts only to the
resulting `ApiClientError` status (401 → inline "sign in" message — no `/signin` page exists yet;
403 → the route's own error message). There is no redirect to a sign-in page because none exists
in this repo yet.

**Privacy (NON-NEGOTIABLE, enforced in the route handler, not the page):**

- No email address is ever selected into the response — the colleague-activity query reads only
  `display_name` and `streaks.current_streak`.
- Members with `show_in_cohort = false` are excluded outright. That column does not appear in
  §3.2's `users` table even though §4.2 requires it — the spec references it without defining it
  (§0 rule 5). Migration `1755200000000_add-show-in-cohort.js` adds
  `show_in_cohort BOOLEAN NOT NULL DEFAULT TRUE` (opt-out, reversible) as the only sane reading.
- When `organisations.member_count < 3`, the response returns `suppressed: true` with
  `colleagueCount`, `colleagues`, and `aggregates` all nulled/emptied — showing named
  colleagues' streaks in a 1–2 person org would trivially deanonymise them.
- "Most-read vertical" has no read-tracking source at T06, so it is always `null`; "briefs
  completed this week" is a real (currently always-zero) query against `completions`, empty until
  T15/T20.

`POST /api/v1/org/:slug/claim` inserts a `pending` `organisation_claims` row for a member of an
unclaimed org (`claimed_by IS NULL`); 409s if the org is already claimed by anyone, or if the same
user already has a pending claim on it.

`/admin/organisations` (role `admin`, via `GET /api/v1/admin/organisations?auto_created=true`)
lists organisations auto-created from a derived domain name (§4.1's last line — "surfaced in an
admin queue for Vala to rename") with an inline rename form per row
(`PATCH /api/v1/admin/organisations/:id`). Renaming re-derives the slug via the shared
`slugify` (`packages/db/src/slug.ts`, also used by T05's `cohort-assignment.ts`) and retries with
a numeric suffix on a genuine slug collision with a different org.

## RSS ingestion

`packages/ingestion` (`@learn-ai/ingestion`, T07) implements the §5.1 `PollSources` /
`FetchFeed` / `NormaliseAndDedupe` stages as plain functions — T11 wraps them in Lambdas later,
so nothing here imports the AWS SDK. `runIngestion(pool)` is the entry point: `pollDueSources`
selects active, `ingest_method = 'rss'` sources whose `poll_interval_min` has elapsed since
`last_polled_at`; `ingestSource` then fetches each one (`fetchFeed`, 20s timeout, `rss-parser` —
handles RSS 2.0 and Atom through the same code path), canonicalises every item's URL
(`normaliseUrl`), sha256-hashes it (`candidateHash`), and inserts into `source_candidates` via
`ON CONFLICT (url_hash) DO NOTHING` — re-running ingestion for a source it has already seen
inserts zero duplicate rows.

**URL normalisation rules** (`packages/ingestion/src/url.ts`, applied in this order): drop the
fragment; lowercase the hostname only (paths/query stay case-sensitive — some CMSes serve
case-sensitive slugs); strip tracking params (`utm_*` case-insensitively, plus `fbclid`,
`gclid`, `mc_cid`, `mc_eid`, `igshid`, `ref`, `ref_src`); sort whatever query params remain by
key; remove a single trailing slash from the path (unless the path is just `/`).

**Failure isolation:** `ingestSource` never throws — a bad feed (network error, non-2xx, XML
parse failure, an item with neither `link` nor `guid`) is caught and turned into a failure
result, so `runIngestion` always finishes the whole batch. Each source tracks
`consecutive_failures`, reset to 0 on any successful poll; the 5th consecutive failure sets
`active = false` and logs an operational line (`MAX_CONSECUTIVE_FAILURES` in
`packages/ingestion/src/types.ts`).

Run manually: `pnpm --filter @learn-ai/ingestion run ingest` (needs `DATABASE_URL`). Add
`-- --dry-run` to fetch, parse, and normalise a small sample of the real seeded feeds
**without touching the database** — proves the seeded feed URLs still parse:

```
pnpm --filter @learn-ai/ingestion run ingest -- --dry-run
```

Integration tests (`packages/ingestion/src/__tests__/ingest.test.ts`) serve fixture RSS/Atom
XML from a local `node:http` server on an ephemeral port — deliberately never real internet in
CI — and cover: candidate insertion with title/excerpt/`published_at` mapped from both RSS and
Atom, zero duplicates on re-run, a malformed feed failing without aborting the batch, and
auto-deactivation on the 5th consecutive failure. Same skip-locally/run-in-CI pattern as
`packages/db`'s migration tests (`DATABASE_URL` unset → skipped, not failed).

**Known-dead seeded feed URLs (pre-existing T02 data issue, not fixed here):** a handful of the
provisional `content_sources` seed rows 404 or 403 as of this writing (Anthropic News, CSIRO
News, The Verge — AI, Ben's Bites, Microsoft AI Blog). `ingestSource`'s failure isolation means
these simply accumulate `consecutive_failures` and auto-deactivate rather than blocking
ingestion of the working sources; still worth flagging for the founder review the seed list
already requires (see [Database](#database) above).

## LLM client abstraction

`packages/llm` (`@learn-ai/llm`, T08) implements the §2.3 `LlmClient` contract — `complete(req):
Promise<LlmResponse>` — with two interchangeable implementations, `BedrockLlmClient` and
`AnthropicLlmClient`. Every caller (T09 triage, T10 draft, ...) codes against `LlmClient` and
`createLlmClient({ agentName, executionArn?, pool })`, which picks the concrete class from
`LLM_PROVIDER` (`bedrock` | `anthropic`, default `bedrock`) — swapping providers is an env
change, not a code change.

**Shared orchestration** (`BaseLlmClient`, both clients extend it): each provider only
implements `invoke()` (its own request/response mapping) and `isRetryable()` (its own
429/throttling/5xx classification); everything else is common —

- **Retry with backoff** (`retry.ts`): 2 retries (3 attempts total) with exponential delay,
  only for errors the subclass classifies as retryable (Bedrock: `ThrottlingException`,
  `ServiceUnavailableException`, `ModelTimeoutException`, `ModelNotReadyException`,
  `InternalServerException`, or `$metadata.httpStatusCode` 429/5xx; Anthropic: `error.status`
  429 or ≥500). A non-retryable error (e.g. a 400) fails on the first attempt.
- **JSON mode** (`json.ts`, wired in `base-client.ts`): `responseFormat: 'json'` strips a
  single wrapping markdown fence, then `JSON.parse`s the result. Malformed JSON retries
  **once** with the model's own (invalid) reply echoed back plus one corrective user message
  asking for valid JSON only; still-malformed on that retry throws `LlmJsonError` — per §12/T08,
  "malformed JSON responses retry once then fail cleanly." Token counts from both attempts are
  summed into the final `LlmResponse` when the retry succeeds.
- **`agent_runs` logging** (`agent-runs.ts`, §3.7): every `complete()` call — success or
  failure — writes exactly one row: `agent_name`, `execution_arn`, `model_id`, token counts,
  `latency_ms`, `cost_usd` (from `pricing.ts`'s per-model $/1M-token table, founder-updatable;
  `null` for an unpriced model rather than throwing), `status` (`ok`/`error`), and `error`
  (truncated to 2000 chars).

**Bedrock** (`bedrock-client.ts`) calls the Converse API (`@aws-sdk/client-bedrock-runtime`).
Region defaults to `BEDROCK_REGION`/`ap-southeast-2`; model defaults to
`BEDROCK_MODEL_ID`/`anthropic.claude-3-5-haiku-20241022-v1:0` — a cheap default, founder-tunable
via the env var without a deploy. **Anthropic** (`anthropic-client.ts`) calls
`@anthropic-ai/sdk` directly. Region/model default to `ANTHROPIC_MODEL_ID`/`claude-sonnet-5` and
require `ANTHROPIC_API_KEY` (only when `LLM_PROVIDER=anthropic`).

**Transport seam:** both clients take an injectable `transport` — the actual
`BedrockRuntimeClient.send(new ConverseCommand(...))` / `client.messages.create(...)` call —
constructed automatically when omitted. This is what lets one shared contract suite
(`src/__tests__/contract.ts`) run against both implementations with faked transports (per
§12/T08: "both implementations pass the same contract test suite"): happy path, token
accounting, retry-on-throttle, retry-exhaustion, non-retryable-error, fence-stripping,
malformed-JSON-retry-then-succeed, malformed-JSON-retry-then-fail, and one-row-per-call — all
assert against an in-memory `FakePool` rather than a live database, so they run locally with no
`DATABASE_URL`. The one true database write — a real `agent_runs` row landing in the migrated
§3.7 schema, with correct column types (`NUMERIC` `cost_usd`, `INTEGER` token counts) — is
covered once in `agent-runs.integration.test.ts`, skipped when `DATABASE_URL` is unset (same
pattern as `packages/db`/`packages/ingestion`'s DB-backed tests).

**Live Bedrock smoke check** (report-only, not part of the test suite):
`pnpm --filter @learn-ai/llm run smoke:bedrock` attempts one real 20-token Converse call against
the configured default model and prints the result (or the exact AWS error — e.g.
`AccessDeniedException` when Bedrock model access hasn't been granted in the console yet — as a
founder checkpoint, without failing anything).

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
apps/web           Next.js App Router frontend (TypeScript, Tailwind)
packages/db        Schema, migrations, seeds, pg pool client (@learn-ai/db)
packages/cohort    Domain parsing / cohort classification, pure (@learn-ai/cohort)
packages/ingestion RSS/Atom polling, URL dedupe, source_candidates writer (@learn-ai/ingestion)
packages/llm        LlmClient abstraction — Bedrock + Anthropic, agent_runs logging (@learn-ai/llm)
```

## Build spec

This repo is built against [`LEARN_AI_V1_BUILD_SPEC.md`](./LEARN_AI_V1_BUILD_SPEC.md), the
authoritative specification for V1. See `AGENTS.md` for the working rules used to execute it.
