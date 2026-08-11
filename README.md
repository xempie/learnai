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
  (truncated to 2000 chars). `writeAgentRun` generates the row's `id` application-side (before the
  INSERT) and returns it; on the success path, `LlmClient.complete()` surfaces that same id as
  `LlmResponse.agentRunId` (a small T08-compatible addition made during T10) so a caller like the
  draft agent can persist `content_items.agent_run_id` without a second lookup.

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

## Triage agent

`packages/agents` (`@learn-ai/agents`, T09) implements the §5.2 triage agent and the §5.4
Tier-3-exclusion building block for `SelectTopN`. This package also holds T10's draft agent (see
[Draft agent](#draft-agent) below).

**`TRIAGE_SYSTEM_PROMPT`** (`src/prompts/triage-prompt.ts`) is the §5.2 system prompt copied
verbatim from `LEARN_AI_V1_BUILD_SPEC.md` — NON-NEGOTIABLE per AGENTS.md/§5, changes require
founder approval to the spec file first. `src/__tests__/triage-prompt.spec.test.ts` independently
re-extracts the fenced block from the spec file at test time and asserts byte-for-byte equality
with the constant, so the two can never silently drift apart.

**`triageCandidates(candidates, client, pool, options?)`** batches `candidates` (batch size ~20,
`DEFAULT_BATCH_SIZE`) into one `LlmRequest` per batch (`responseFormat: 'json'`), validates the
response array against a zod schema (`id` must belong to the batch, `score` in `[0,1]`, `vertical`
one of the §3.1 enum values), then persists `triage_score`/`triage_reason` plus the assigned
vertical for every matched candidate. §3.4's `source_candidates` table has **no `vertical`
column**, so the vertical is written into `raw.triage_vertical` via `jsonb_set` (merged, not
overwritten — every other key ingestion wrote to `raw` survives). Score is rounded to 3 decimals;
a `reason` longer than 15 words is truncated rather than rejected (the prompt asks for both, but
models don't always comply exactly). A malformed response entry (bad type, out-of-range score,
unknown vertical, an id not in the batch) is dropped and logged — the rest of the batch is still
scored. A candidate the response never mentions is left unscored (`triage_score` stays `NULL`)
and reported back in `missingIds`, never thrown — one bad batch must not fail a whole triage run.
The caller is expected to construct `client` via `@learn-ai/llm`'s `createLlmClient({ agentName:
'triage', pool, executionArn? })`, so every triage call's cost/tokens land in `agent_runs` (§3.7)
for free.

**`selectCandidates(pool, topN)`** is the §5.4 hard rule as a standalone, kind-agnostic query: the
highest-`triage_score` `status='new'` candidates, joined to `content_sources` to exclude
`tier = 3` — "Tier 3 candidates are NEVER in the draft selection set." Chosen rows are marked
`status='selected'` so a re-run doesn't reselect them. Deliberately does not implement the full
1-news + 1-technique + 1-video selection or the §5.4 vertical rotation — those are T10/T11's job,
built on top of this.

**Tests**: `triage-candidates.test.ts` batches 20 fixture candidates through a `FakeLlmClient`
(an in-process `LlmClient` stand-in scripted with canned JSON — the T09 controller decision's
"FakeTransport" seam applied at the `LlmClient` level, since that is what `triageCandidates`
actually depends on) and an in-memory `FakePool`, covering batch-splitting, malformed-entry
drop-and-continue, unmatched/missing ids, word truncation, and score rounding — all without a
database. `triage-candidates.integration.test.ts` and `select-candidates.integration.test.ts` are
real Postgres round-trips (20-candidate batch persisted correctly; a high-scoring Tier 3 candidate
is never selected) — skipped, not failed, when `DATABASE_URL` is unset, same pattern as every
other DB-backed suite in this repo.

**Live Bedrock smoke check** (report-only, not part of the test suite):
`pnpm --filter @learn-ai/agents run smoke:triage` runs one real triage batch of 3 tiny fixture
candidates through Bedrock and prints the scores/reasons/verticals it returned.

## Draft agent

`packages/agents` (`@learn-ai/agents`, T10) implements the §5.3 draft agent, §5.4's vertical
rotation rule, and §5.1's `PersistDrafts` stage.

**`DRAFT_SYSTEM_PROMPT`** (`src/prompts/draft-prompt.ts`) is the §5.3 system prompt copied
verbatim from `LEARN_AI_V1_BUILD_SPEC.md` — same NON-NEGOTIABLE / independent-re-extraction guard
test pattern as T09's `TRIAGE_SYSTEM_PROMPT` (`src/__tests__/draft-prompt.spec.test.ts`).

**`draftItem({ candidate, kind, reviewerNotes? }, client)`** drafts ONE `content_items`-shaped item
(`kind` is `'news' | 'technique' | 'video'`) from one selected candidate — `candidate` is the same
shape T09's `SelectedCandidate` already carries (title/url/excerpt/raw + source tier/vertical), so
T11's orchestration can hand one straight through. The system prompt's response is one of two
shapes, validated with zod:

- **Success** — `{"title","summary"(<=200 chars),"body_md","vertical","source_url"}`. A `summary`
  that parses but is over 200 chars, or a response that doesn't match this shape at all, gets
  exactly ONE regenerate attempt (an explicit corrective follow-up message, echoing the model's own
  reply back — the same "one corrective retry" spirit as T08's JSON-mode handling, applied here to a
  business-rule violation rather than invalid JSON syntax); still invalid after that throws
  `DraftValidationError` — "fails cleanly", never an open-ended loop.
- **Refusal** — `{"error":"insufficient_source","detail":"..."}`. Returned as a **typed** `DraftResult`
  (`{ ok: false, error, detail }`), never thrown — a thin source is an expected, routine outcome.

`vertical` is deliberately validated as "any non-empty string", not the closed §3.1 enum: unlike
§5.2's triage prompt, the verbatim §5.3 prompt never states the vertical vocabulary to the model
(its `"vertical":"..."` is just a placeholder), and a live Bedrock smoke run confirmed the model
will invent a value outside the enum (observed: `"tools"`) for content that doesn't fit neatly —
treating that as a fatal shape violation would burn the one regenerate attempt and throw on an
otherwise-good draft. `draftItem` normalises it instead: the model's value if it happens to be a
real vertical, else the candidate's own `sourceVertical` (§5.4's source-level classification), else
`'general'`.

On success, `draftItem` slugifies the title (`@learn-ai/db`'s `slugify`), sets
`status: 'in_review'`, `author_kind: 'agent'`, `is_premium: false`, `video_url: null` (the script
lives in `body_md` for every kind, including `video` — no recording exists yet at draft time), and
carries `source_id`/`source_tier` through from the candidate. `agent_run_id` comes from
`LlmResponse.agentRunId` — a small T08-compatible addition (`writeAgentRun` already generates the
`agent_runs.id` before its INSERT; `BaseLlmClient.complete()` now returns it on the success path)
so a drafted item can point straight at the `agent_runs` row that produced it. **Slug uniqueness is
deliberately NOT resolved here** — `draftItem` runs once per candidate (§5.1's `DraftAgent` is a
`Map over selected`, so one call never sees its sibling items); only `persistDrafts`, which holds
the DB pool and inserts the whole batch, has the visibility to dedupe against both existing rows
and same-batch siblings.

**`persistDrafts(items, editionDate, pool)`** finds-or-creates the `editions` row for
`editionDate` (new rows start `'in_review'`; an existing `'planning'` row is moved to `'in_review'`;
anything already past `'planning'` is left alone) and inserts every item with `status='in_review'`
**hardcoded in the SQL text**, never a bound parameter — the pipeline rule (§5.1) is that drafts
enter `in_review` only, and this makes it impossible for a caller to slip `'published'` through this
path even though the `published_needs_approval` CHECK would technically allow it with approvals
set. Each item's slug is deduped against real `content_items` rows (and its own siblings, inserted
earlier in the same call) with a numeric `-2`, `-3`, ... suffix on collision.
`collectDraftedItems(results)` is the small connective helper: filters a batch of `DraftResult`s
down to the successful ones, so a refusal is dropped before `persistDrafts` ever sees it —
"typed refusal, nothing inserted."

**`pickRotationVertical(recentEditions)`** is §5.4's vertical rotation as a pure, deterministic
function of publishing history (no RNG): `recentEditions` is the vertical picked for each previous
publishing day, oldest first, and the function returns the next day's target vertical. Two rules,
checked in order:

1. **Health** ("at most 1 in 10"): a fixed once-per-10-day slot (day index `9, 19, 29, ...`) rather
   than an ordinary member of the 5-day rotation below — folding it into the same deficit-based
   quota would make it win far more often than 1-in-10, since its target rate (0.1/day) is dwarfed
   by general's (0.4/day). Skipped if health already appeared in the trailing 9 days.
2. **Otherwise**: the four §5.4 buckets (`general` / `teaching`-or-`learning` combined / `marketing`
   / `management`) each have a target count over the trailing 5 days (this day + the last 4);
   whichever bucket is furthest behind its target wins, ties breaking `general` first. Applied
   repeatedly from an empty history this reproduces an exact period-5 cycle, which has the property
   that **any** 5 consecutive picks (not just picks aligned to day 0) contain exactly the target
   multiset — verified directly in `rotation.test.ts`. `teaching` vs `learning` within the combined
   bucket goes to whichever appeared less often in the trailing window (tie → `teaching`).

**Tests**: `draft-item.test.ts` covers all three `kind`s producing a valid item, the refusal path on
a canned `insufficient_source` response (typed result, one LLM call, no regenerate), the
summary-too-long regenerate-then-succeed and regenerate-then-`DraftValidationError` paths, and the
same for a malformed-shape response. `rotation.test.ts` simulates 10/20/30-day publishing histories
and checks the exact deterministic sequence, the "any 5-day rolling window" quota property, and the
"at most 1 in 10" health property — the §12/T10 acceptance's "rotation honoured over a simulated
10-day window." `persist-drafts.test.ts` (in-memory `FakeDraftPool`) and
`persist-drafts.integration.test.ts` (real Postgres, skip-locally/run-in-CI) cover edition
find-or-create, the `planning`→`in_review` transition, slug dedupe, and that nothing is ever
inserted as `'published'`.

**Live Bedrock smoke check** (report-only, not part of the test suite):
`pnpm --filter @learn-ai/agents run smoke:draft` drafts one real `kind=technique` item through
Bedrock from a small fixture candidate and prints the title/summary it produced.

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
packages/agents     Triage + draft agents, SelectTopN/PersistDrafts building blocks (@learn-ai/agents)
```

## Build spec

This repo is built against [`LEARN_AI_V1_BUILD_SPEC.md`](./LEARN_AI_V1_BUILD_SPEC.md), the
authoritative specification for V1. See `AGENTS.md` for the working rules used to execute it.
