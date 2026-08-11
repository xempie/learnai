<!-- Learn AI — V1 Implementation Specification for Claude Code -->

# Learn AI — V1 Build Specification

**Version** 1.0 · 11 August 2026
**Owners** Dr Vala Rohani (editorial, compliance) · Dr Ashkan Hayati (engineering)
**Target** Production-ready V1 in one build week (7 days), deployed to AWS
**Companion document** `Learn_AI_Business_Plan_2026.docx` — read §3 (Product), §4 (Content), §6 (Email Asset) for the *why* behind these requirements

---

## 0. How to use this file

This is the authoritative build specification. It is written to be executed by Claude Code, one task at a time.

**Working rules:**

1. Execute tasks in the order given in §12. Each task depends on the ones before it.
2. Start each session by reading this file, then state which task number you are executing.
3. Do not begin a task until the previous task's acceptance criteria all pass.
4. Every task ends with: tests written, tests passing, `README` updated, commit made with the task number in the message (`feat(T07): RSS ingestion service`).
5. If a requirement here is ambiguous or appears wrong, **stop and ask** rather than guessing. Guessing on §3 (schema) or §5 (review gate) is expensive to unwind.
6. Anything marked **NON-NEGOTIABLE** must not be altered, deferred, or "temporarily" stubbed without explicit written approval from a founder.

**Three decisions are deliberately deferred to Ashkan** (§2). Everything that touches them is specified as an interface contract with a recommended default. Implement against the interface so the decision can change later without a rewrite.

---

## 1. What we are building

A daily AI-literacy product for Australian professionals. One production run per publishing day produces a **brief** — one news item, one practical technique, one five-minute video — which fans out to the website, a PWA, email, social, and a video library that later becomes course material.

Two things make this different from a newsletter CMS, and both are structural:

- **The organisation cohort layer.** Members are grouped automatically by email domain. This is the product's moat and it ships in V1. (§4)
- **The human review gate.** Agents draft; nothing reaches an audience without founder approval. This is a brand-safety and enterprise-credibility requirement. (§5)

### Success criteria for V1

| # | Criterion |
|---|---|
| 1 | A founder can review and approve a full brief in under 5 minutes |
| 2 | An approved brief publishes to web, PWA, and email queue with no further manual action |
| 3 | A new user signing up with `someone@mq.edu.au` lands in the Macquarie cohort automatically |
| 4 | No content path can publish without an approval record in the database |
| 5 | Send volume is gated by the warm-up schedule and cannot be manually overridden |
| 6 | The system handles 150,000 subscription records and 100,000 sends/day |

---

## 2. Deferred decisions and their interfaces

Three choices belong to Ashkan. Implement each behind the stated interface. A recommended default is given; use it unless told otherwise, and keep the adapter boundary clean so it can be swapped.

### 2.1 Frontend framework and hosting

**Recommended default:** Next.js (App Router) on AWS Amplify Hosting.

**Contract:** the frontend consumes only the REST API in §8. No direct database access from frontend code, no server-side ORM calls embedded in page components that would prevent extraction. Server-rendered data fetching must go through a single `lib/api-client.ts` module.

**Rationale for the default:** App Router gives SSR for SEO on archive pages (which §5.5 of the business plan relies on for ad revenue), the PWA service worker integrates cleanly, and Amplify removes deployment work from the build week.

### 2.2 Authentication

**Recommended default:** Auth.js (NextAuth) with a Postgres adapter, email magic-link plus password.

**Contract — implement `AuthProvider` in `lib/auth/provider.ts`:**

```ts
interface AuthenticatedUser {
  id: string;              // uuid, FK to users.id
  email: string;
  emailVerified: boolean;
  role: 'member' | 'reviewer' | 'admin';
}

interface AuthProvider {
  getSession(req): Promise<AuthenticatedUser | null>;
  requireUser(req): Promise<AuthenticatedUser>;          // throws 401
  requireRole(req, role): Promise<AuthenticatedUser>;    // throws 403
  signUp(email, password?): Promise<{ userId: string }>;
  sendVerification(userId): Promise<void>;
}
```

**NON-NEGOTIABLE:** whatever provider is used, the `users` row (§3.2) is the system of record for identity. External auth systems hold credentials only. `users.id` is the FK target everywhere. Cohort assignment (§4) runs on our side, on our `users` row, never in the auth provider.

### 2.3 Agent model access

**Recommended default:** Amazon Bedrock, same account and region as the rest of the stack, to keep credentials in IAM.

**Contract — implement `LlmClient` in `lib/llm/client.ts`:**

```ts
interface LlmRequest {
  system: string;
  messages: { role: 'user' | 'assistant'; content: string }[];
  maxTokens: number;
  temperature?: number;
  responseFormat?: 'text' | 'json';
}

interface LlmResponse {
  text: string;
  inputTokens: number;
  outputTokens: number;
  modelId: string;
  latencyMs: number;
}

interface LlmClient {
  complete(req: LlmRequest): Promise<LlmResponse>;
}
```

Two implementations: `BedrockLlmClient` and `AnthropicLlmClient`. Select by `LLM_PROVIDER` env var. Every call logs `agent_runs` (§3.7) with token counts — cost visibility is a requirement, not a nice-to-have.

---

## 3. Data model

PostgreSQL 15+. Use UUID v7 primary keys (time-sortable) via `uuid_generate_v7()` or an application-side generator. All timestamps `timestamptz`, stored UTC. All migrations versioned and reversible.

**Before the first migration:** `CREATE EXTENSION IF NOT EXISTS citext;` and whichever UUID extension you use.

**Circular foreign keys.** The tables below are presented grouped by concern, not in creatable order. Three references point forward:

| Column | References | Handling |
|---|---|---|
| `organisations.claimed_by` | `users(id)` | Add via `ALTER TABLE` after `users` exists |
| `content_items.source_id` | `content_sources(id)` | Add via `ALTER TABLE` after `content_sources` exists |
| `content_items.agent_run_id` | `agent_runs(id)` | Add via `ALTER TABLE` after `agent_runs` exists |

Create all tables without these three constraints, then add them in a final `ALTER TABLE` step within the same migration. The down migration drops them first.

### 3.1 Enumerated types

```sql
CREATE TYPE user_role         AS ENUM ('member','reviewer','admin');
CREATE TYPE user_tier         AS ENUM ('free','premium');
CREATE TYPE cohort_track      AS ENUM ('organisation','individual');
CREATE TYPE send_cadence      AS ENUM ('daily','weekly','none');
CREATE TYPE content_kind      AS ENUM ('news','technique','video','prompt');
CREATE TYPE content_status    AS ENUM ('draft','in_review','changes_requested','approved','scheduled','published','rejected','archived');
CREATE TYPE vertical          AS ENUM ('general','teaching','learning','marketing','management','health');
CREATE TYPE author_kind       AS ENUM ('agent','human');
CREATE TYPE review_action     AS ENUM ('approve','reject','request_changes');
CREATE TYPE ingest_method     AS ENUM ('rss','api','manual');
CREATE TYPE candidate_status  AS ENUM ('new','selected','rejected','used','expired');
CREATE TYPE subscription_status AS ENUM ('active','pending_repermission','suppressed','unsubscribed','bounced','complained');
CREATE TYPE validation_status AS ENUM ('unvalidated','valid','invalid','risky','role_account','spam_trap');
CREATE TYPE campaign_kind     AS ENUM ('daily','weekly','repermission','transactional');
CREATE TYPE edition_status    AS ENUM ('planning','in_review','approved','published');
```

### 3.2 Identity and cohorts

```sql
CREATE TABLE organisations (
  id                UUID PRIMARY KEY,
  name              TEXT        NOT NULL,
  slug              TEXT        NOT NULL UNIQUE,
  primary_domain    TEXT        NOT NULL UNIQUE,
  kind              TEXT,                       -- 'university','government','corporate','sme'
  auto_created      BOOLEAN     NOT NULL DEFAULT TRUE,
  claimed_by        UUID        REFERENCES users(id),
  claimed_at        TIMESTAMPTZ,
  member_count      INTEGER     NOT NULL DEFAULT 0,   -- denormalised, maintained by trigger
  is_anchor_pilot   BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE organisation_domains (
  id                UUID PRIMARY KEY,
  organisation_id   UUID        NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  domain            TEXT        NOT NULL UNIQUE,       -- registrable domain, lowercase
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_org_domains_domain ON organisation_domains(domain);

CREATE TABLE users (
  id                UUID PRIMARY KEY,
  email             CITEXT      NOT NULL UNIQUE,
  email_domain      TEXT        NOT NULL,              -- registrable domain, derived
  email_verified_at TIMESTAMPTZ,
  display_name      TEXT,
  role              user_role   NOT NULL DEFAULT 'member',
  tier              user_tier   NOT NULL DEFAULT 'free',
  organisation_id   UUID        REFERENCES organisations(id),
  cohort_track      cohort_track NOT NULL,
  job_role          TEXT,
  timezone          TEXT        NOT NULL DEFAULT 'Australia/Sydney',
  date_of_birth     DATE,                              -- see §10.4, under-16 exclusion
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_active_at    TIMESTAMPTZ,
  deleted_at        TIMESTAMPTZ
);
CREATE INDEX idx_users_org      ON users(organisation_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_users_domain   ON users(email_domain);

CREATE TABLE user_preferences (
  user_id           UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  cadence           send_cadence NOT NULL DEFAULT 'daily',
  send_hour_local   SMALLINT     NOT NULL DEFAULT 7 CHECK (send_hour_local BETWEEN 0 AND 23),
  verticals         vertical[]   NOT NULL DEFAULT '{}',    -- empty = all
  push_enabled      BOOLEAN      NOT NULL DEFAULT FALSE,
  push_subscription JSONB,                                  -- Web Push endpoint + keys
  updated_at        TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE TABLE organisation_claims (
  id                UUID PRIMARY KEY,
  organisation_id   UUID        NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  user_id           UUID        NOT NULL REFERENCES users(id),
  status            TEXT        NOT NULL DEFAULT 'pending',  -- pending|approved|rejected
  requested_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at       TIMESTAMPTZ,
  resolved_by       UUID        REFERENCES users(id)
);
```

### 3.3 Content

**NON-NEGOTIABLE:** one unified `content_items` table serves posts and videos. Do not split into separate tables.

```sql
CREATE TABLE editions (
  id                UUID PRIMARY KEY,
  edition_date      DATE        NOT NULL UNIQUE,
  headline          TEXT,
  status            edition_status NOT NULL DEFAULT 'planning',
  published_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE content_items (
  id                UUID PRIMARY KEY,
  edition_id        UUID        REFERENCES editions(id) ON DELETE SET NULL,
  kind              content_kind NOT NULL,
  title             TEXT        NOT NULL,
  slug              TEXT        NOT NULL UNIQUE,
  body_md           TEXT,                              -- markdown
  summary           TEXT,                              -- <= 200 chars, for cards and meta
  vertical          vertical    NOT NULL DEFAULT 'general',
  video_url         TEXT,
  video_duration_s  INTEGER,
  video_captions_url TEXT,
  source_url        TEXT,                              -- primary source, REQUIRED for kind='news'
  source_id         UUID        REFERENCES content_sources(id),
  source_tier       SMALLINT    CHECK (source_tier BETWEEN 1 AND 3),
  status            content_status NOT NULL DEFAULT 'draft',
  is_premium        BOOLEAN     NOT NULL DEFAULT FALSE,
  author_kind       author_kind NOT NULL,
  agent_run_id      UUID        REFERENCES agent_runs(id),
  approved_by       UUID        REFERENCES users(id),
  approved_at       TIMESTAMPTZ,
  second_approved_by UUID       REFERENCES users(id),   -- health/finance dual review
  second_approved_at TIMESTAMPTZ,
  published_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT news_needs_source
    CHECK (kind <> 'news' OR source_url IS NOT NULL),
  CONSTRAINT published_needs_approval
    CHECK (status <> 'published' OR (approved_by IS NOT NULL AND approved_at IS NOT NULL))
);
CREATE INDEX idx_ci_status    ON content_items(status);
CREATE INDEX idx_ci_edition   ON content_items(edition_id);
CREATE INDEX idx_ci_published ON content_items(published_at DESC) WHERE status = 'published';
CREATE INDEX idx_ci_vertical  ON content_items(vertical) WHERE status = 'published';
CREATE INDEX idx_ci_fts       ON content_items
  USING GIN (to_tsvector('english', coalesce(title,'') || ' ' || coalesce(body_md,'')));
```

The `published_needs_approval` CHECK constraint is the database-level enforcement of the review gate. **Do not drop it to make a test pass.**

```sql
CREATE TABLE prompts (
  id                UUID PRIMARY KEY,
  title             TEXT        NOT NULL,
  body              TEXT        NOT NULL,
  vertical          vertical    NOT NULL DEFAULT 'general',
  job_role          TEXT,
  is_premium        BOOLEAN     NOT NULL DEFAULT TRUE,   -- 10 free, rest premium
  content_item_id   UUID        REFERENCES content_items(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 3.4 Sources and ingestion

```sql
CREATE TABLE content_sources (
  id                UUID PRIMARY KEY,
  name              TEXT        NOT NULL,
  homepage_url      TEXT        NOT NULL,
  feed_url          TEXT,
  tier              SMALLINT    NOT NULL CHECK (tier BETWEEN 1 AND 3),
  vertical          vertical    NOT NULL DEFAULT 'general',
  ingest_method     ingest_method NOT NULL DEFAULT 'rss',
  poll_interval_min INTEGER     NOT NULL DEFAULT 240,
  active            BOOLEAN     NOT NULL DEFAULT TRUE,
  last_polled_at    TIMESTAMPTZ,
  last_item_at      TIMESTAMPTZ,
  consecutive_failures INTEGER  NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE source_candidates (
  id                UUID PRIMARY KEY,
  source_id         UUID        NOT NULL REFERENCES content_sources(id) ON DELETE CASCADE,
  external_id       TEXT,
  url               TEXT        NOT NULL,
  url_hash          TEXT        NOT NULL UNIQUE,        -- sha256 of normalised URL
  title             TEXT        NOT NULL,
  excerpt           TEXT,
  raw               JSONB,
  published_at      TIMESTAMPTZ,
  fetched_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  triage_score      NUMERIC(4,3),                       -- 0.000 .. 1.000
  triage_reason     TEXT,
  status            candidate_status NOT NULL DEFAULT 'new',
  expires_at        TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '14 days')
);
CREATE INDEX idx_cand_status ON source_candidates(status, triage_score DESC);
```

### 3.5 Review gate and audit

```sql
CREATE TABLE reviews (
  id                UUID PRIMARY KEY,
  content_item_id   UUID        NOT NULL REFERENCES content_items(id) ON DELETE CASCADE,
  reviewer_id       UUID        NOT NULL REFERENCES users(id),
  action            review_action NOT NULL,
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_reviews_item ON reviews(content_item_id, created_at DESC);

CREATE TABLE audit_log (
  id                BIGSERIAL PRIMARY KEY,
  actor_kind        author_kind NOT NULL,
  actor_id          UUID,
  action            TEXT        NOT NULL,
  entity_type       TEXT        NOT NULL,
  entity_id         UUID,
  payload           JSONB,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_entity ON audit_log(entity_type, entity_id, created_at DESC);
```

`audit_log` is append-only. Grant no UPDATE or DELETE to the application role.

### 3.6 Email

```sql
CREATE TABLE subscriptions (
  id                    UUID PRIMARY KEY,
  user_id               UUID REFERENCES users(id) ON DELETE SET NULL,
  email                 CITEXT NOT NULL UNIQUE,
  email_domain          TEXT NOT NULL,
  consent_source        TEXT,                    -- program name / form
  consent_recorded_at   TIMESTAMPTZ,
  consent_evidence      JSONB,                   -- audit trail, §10.2
  cohort_bucket         SMALLINT,                -- 1=<12mo, 2=1-2y, 3=2-3y, 4=3-4y
  status                subscription_status NOT NULL DEFAULT 'pending_repermission',
  validation_status     validation_status NOT NULL DEFAULT 'unvalidated',
  validated_at          TIMESTAMPTZ,
  repermission_sent_at  TIMESTAMPTZ,
  repermission_optin_at TIMESTAMPTZ,
  last_open_at          TIMESTAMPTZ,
  last_click_at         TIMESTAMPTZ,
  sunset_at             TIMESTAMPTZ,
  unsubscribe_token     TEXT NOT NULL UNIQUE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_subs_sendable ON subscriptions(status, cohort_bucket)
  WHERE status = 'active';

CREATE TABLE suppression_list (
  email             CITEXT PRIMARY KEY,
  reason            TEXT NOT NULL,               -- hard_bounce|complaint|manual|role|trap|unsubscribe
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE email_campaigns (
  id                UUID PRIMARY KEY,
  kind              campaign_kind NOT NULL,
  edition_id        UUID REFERENCES editions(id),
  subject           TEXT NOT NULL,
  segment           JSONB NOT NULL,              -- declarative segment definition
  scheduled_at      TIMESTAMPTZ,
  started_at        TIMESTAMPTZ,
  completed_at      TIMESTAMPTZ,
  target_count      INTEGER,
  sent_count        INTEGER NOT NULL DEFAULT 0,
  created_by        UUID REFERENCES users(id)
);

CREATE TABLE email_sends (
  id                BIGSERIAL PRIMARY KEY,
  campaign_id       UUID NOT NULL REFERENCES email_campaigns(id) ON DELETE CASCADE,
  subscription_id   UUID NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  ses_message_id    TEXT,
  sent_at           TIMESTAMPTZ,
  delivered_at      TIMESTAMPTZ,
  opened_at         TIMESTAMPTZ,
  clicked_at        TIMESTAMPTZ,
  bounced_at        TIMESTAMPTZ,
  bounce_type       TEXT,
  complained_at     TIMESTAMPTZ,
  UNIQUE (campaign_id, subscription_id)
);
CREATE INDEX idx_sends_campaign ON email_sends(campaign_id);

CREATE TABLE warmup_schedule (
  day_index         SMALLINT PRIMARY KEY,        -- 1..49
  week_index        SMALLINT NOT NULL,
  max_volume        INTEGER  NOT NULL,
  segment           JSONB    NOT NULL,
  executed_at       TIMESTAMPTZ,
  actual_sent       INTEGER,
  bounce_rate       NUMERIC(5,4),
  complaint_rate    NUMERIC(6,5),
  open_rate         NUMERIC(5,4),
  gate_passed       BOOLEAN,
  gate_notes        TEXT
);
```

### 3.7 Agent telemetry, engagement, metrics

```sql
CREATE TABLE agent_runs (
  id                UUID PRIMARY KEY,
  agent_name        TEXT NOT NULL,               -- 'triage' | 'draft'
  execution_arn     TEXT,
  model_id          TEXT NOT NULL,
  input_tokens      INTEGER,
  output_tokens     INTEGER,
  latency_ms        INTEGER,
  cost_usd          NUMERIC(10,6),
  status            TEXT NOT NULL,               -- ok|error
  error             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE completions (
  id                BIGSERIAL PRIMARY KEY,
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  edition_id        UUID REFERENCES editions(id),
  content_item_id   UUID REFERENCES content_items(id),
  seconds_spent     INTEGER,
  completed_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, edition_id)
);

CREATE TABLE streaks (
  user_id           UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  current_streak    INTEGER NOT NULL DEFAULT 0,
  longest_streak    INTEGER NOT NULL DEFAULT 0,
  last_completed_on DATE
);
```

---

## 4. Cohort assignment — the moat

**NON-NEGOTIABLE.** This runs on every signup and on email change. It must be synchronous and must never fail the signup — on error, assign `individual` track and log.

### 4.1 Algorithm

```
INPUT: raw email
1. Normalise: lowercase, trim. Reject if not RFC-5322 valid.
2. Extract host = substring after '@'.
3. Reduce host to registrable domain using the Public Suffix List.
     mail.student.mq.edu.au  ->  mq.edu.au
     marketing.acme.com.au   ->  acme.com.au
4. If registrable domain ∈ FREE_MAIL_DOMAINS:
       cohort_track = 'individual'; organisation_id = NULL; RETURN
5. If registrable domain ∈ DISPOSABLE_DOMAINS:
       reject signup with 422 "Please use a permanent email address"
6. Look up organisation_domains WHERE domain = registrable domain.
       Found     -> organisation_id = that org; cohort_track = 'organisation'
       Not found -> create organisation:
                      primary_domain = registrable domain
                      name           = deriveName(registrable domain)
                      slug           = slugify(name), deduplicated
                      auto_created   = TRUE
                      kind           = inferKind(domain)
                    then insert organisation_domains row
                    cohort_track = 'organisation'
7. Increment organisations.member_count (trigger, not application code).
```

**`FREE_MAIL_DOMAINS`** — seed with at least: gmail.com, googlemail.com, outlook.com, hotmail.com, live.com, live.com.au, msn.com, yahoo.com, yahoo.com.au, ymail.com, icloud.com, me.com, mac.com, aol.com, proton.me, protonmail.com, gmx.com, mail.com, zoho.com, bigpond.com, bigpond.net.au, optusnet.com.au, iinet.net.au, tpg.com.au, internode.on.net, westnet.com.au. Store in a seeded table, not a hardcoded array — Vala must be able to add entries without a deploy.

**`deriveName(domain)`** — strip the public suffix, split on `.` and `-`, title-case, join with spaces. `mq.edu.au` → `Mq`. **This is not good enough**, so ship a seed table of known Australian institutions mapping domain → proper name:

| Domain | Name | Kind |
|---|---|---|
| mq.edu.au | Macquarie University | university |
| adelaide.edu.au | The University of Adelaide | university |
| acs.org.au | Australian Computer Society | professional_body |
| unsw.edu.au | UNSW Sydney | university |
| sydney.edu.au | The University of Sydney | university |
| unimelb.edu.au | The University of Melbourne | university |
| monash.edu | Monash University | university |
| uts.edu.au | University of Technology Sydney | university |
| health.nsw.gov.au | NSW Health | government |
| education.nsw.gov.au | NSW Department of Education | government |

Auto-created organisations with derived names are flagged `auto_created = true` and surfaced in an admin queue for Vala to rename.

**`inferKind(domain)`** — `.edu.au`/`.edu` → university; `.gov.au`/`.gov` → government; `.org.au`/`.org` → professional_body; else corporate.

### 4.2 Cohort page requirements

Route `/org/[slug]`. Visible to any authenticated member of that organisation.

- Organisation name, member count, and "you and N colleagues"
- Recent colleague activity: display name + streak, **last 20 only**, opt-out respected
- Organisation aggregate: briefs completed this week, most-read vertical
- "Claim this cohort" CTA for users whose email domain matches and where `claimed_by IS NULL`
- **Privacy:** never show another member's email address. Never show a member who has `show_in_cohort = false`. Aggregate counts must suppress when member_count < 3 (avoid deanonymisation in tiny orgs).

---

## 5. Content pipeline and review gate

### 5.1 Step Functions state machine

Name: `learn-ai-content-pipeline`. Triggered by EventBridge on a schedule (default 05:00 Australia/Sydney) and manually from the admin console.

```
PollSources            Map over content_sources WHERE active AND due
  ├─ FetchFeed         Lambda, per source, 20s timeout, 2 retries
NormaliseAndDedupe     Lambda — canonicalise URLs, sha256, drop existing url_hash
TriageAgent            Lambda — LlmClient, scores candidates 0..1
SelectTopN             Lambda — pick 1 news + 1 technique + 1 video candidate
                                honouring the vertical rotation in §5.4
DraftAgent             Map over selected — LlmClient, produces content_items
PersistDrafts          Lambda — INSERT status='in_review', create edition
NotifyReviewer         Lambda — email + push to reviewers
WaitForReview          Task with .waitForTaskToken   ← THE GATE
CheckOutcome           Choice
  ├─ approved          → RequiresSecondReview? (health/finance) → Publish
  ├─ changes_requested → DraftAgent (with reviewer notes appended, max 3 loops)
  └─ rejected          → ArchiveAndEnd
Publish                Lambda — status='published', published_at=now()
FanOut                 Parallel
  ├─ WebPublish        invalidate CDN cache for archive + home
  ├─ QueueEmail        create email_campaigns row (scheduled, NOT sent)
  ├─ QueuePush         Web Push to opted-in users at their local send hour
  └─ QueueSocial       write to a social_queue table for manual posting in V1
```

**NON-NEGOTIABLE — the gate:**

1. `WaitForReview` uses the Step Functions **callback pattern** (`.waitForTaskToken`). The token is stored on the `content_items` row. The state machine does not proceed until a human calls the approve/reject endpoint.
2. There is **no timeout auto-approve**. If a review times out (72h), the execution fails and alerts. It never publishes.
3. `Publish` must verify `approved_by IS NOT NULL` before the update, in addition to the CHECK constraint. Belt and braces, deliberately.
4. The maximum redraft loop count is 3, then the execution fails to a human.

### 5.2 Triage agent

**System prompt (use verbatim; changes require founder approval):**

```
You are the triage agent for Learn AI, a daily AI-literacy brief for Australian
working professionals in teaching, marketing, management, health and general
office roles. Readers have five minutes a day and limited patience.

Score each candidate 0.000-1.000 on ONE question:
"Would a busy Australian professional be able to DO something new tomorrow
because they read this?"

Score high: concrete techniques, prompts, workflows, tool capabilities that
change daily work, policy changes with direct practical consequence.
Score low: funding rounds, executive appointments, benchmark scores, model
release announcements with no user-facing change, speculation, hype, drama.

Reject entirely (score 0) if: it is primarily promotional, it cannot be verified
against a primary source, it gives clinical or financial advice, or it concerns
a person's private life.

Return ONLY a JSON array, no prose, no markdown fences:
[{"id":"<candidate id>","score":0.000,"reason":"<max 15 words>","vertical":"general|teaching|learning|marketing|management|health"}]
```

### 5.3 Draft agent

**System prompt (use verbatim):**

```
You write the Learn AI daily brief for Australian working professionals.

Voice: direct, concrete, warm but unsentimental. Australian English spelling.
No hype. No "game-changer", "revolutionary", "unlock", "supercharge", "in
today's fast-paced world". Never open with a rhetorical question.

Produce ONE item in the requested format:

kind=news       80-120 words. What happened, then what it means for the
                reader's work. Must link the primary source.
kind=technique  200-300 words. One prompt, workflow or method the reader can
                apply in under ten minutes. Include the literal prompt text in
                a fenced code block where relevant. Steps, not prose paragraphs.
kind=video      A 4-6 minute screen-recording script. Sections with timestamps.
                Show the technique in a real tool. Include what appears on
                screen, not just narration.

Constraints:
- Never state a tool capability you cannot verify from the supplied source.
- Never give clinical, diagnostic, legal or financial advice.
- Never invent statistics, quotes, or study findings.
- If the source is insufficient to write accurately, return
  {"error":"insufficient_source","detail":"<what is missing>"}.

Return ONLY JSON, no markdown fences:
{"title":"...","summary":"<=200 chars","body_md":"...","vertical":"...","source_url":"..."}
```

### 5.4 Editorial rules the pipeline enforces

- **Tier 1** sources: draft directly, single reviewer.
- **Tier 2** sources: draft allowed, but the reviewer UI must display the primary source link prominently with an unchecked "I verified against the primary source" checkbox that blocks approval until ticked.
- **Tier 3** sources: **never drafted from.** `SelectTopN` must exclude `source_tier = 3` candidates from the draft set. They appear in the admin console as idea prompts only.
- **Health and finance** verticals: `content_items.second_approved_by` required before publish. Enforce in the `Publish` Lambda and add a partial CHECK.
- **Vertical rotation** over any rolling 5 publishing days: 2 general, 1 teaching/learning, 1 marketing, 1 management. Health rotates in at most 1 in 10.

### 5.5 Reviewer console

Route `/admin/review`. Role `reviewer` or `admin`.

- Queue of `in_review` items, oldest first, grouped by edition
- Side-by-side: draft on the left, primary source on the right (iframe or fetched excerpt)
- Inline markdown editing with live preview
- Actions: **Approve**, **Request changes** (notes required, min 10 chars), **Reject** (reason required)
- Tier 2 verification checkbox (§5.4) blocks Approve until ticked
- Health/finance items show "Second reviewer required" and disable Approve for the first reviewer's second attempt
- Keyboard shortcuts: `a` approve, `r` request changes, `j`/`k` navigate
- Displays elapsed review time per item — this feeds the review-time KPI

**Target: a founder completes a full edition review in under 5 minutes.** If the UI cannot achieve that, it is not done.

---

## 6. Email subsystem

### 6.1 Warm-up gating — NON-NEGOTIABLE

No send path may exceed the volume permitted by `warmup_schedule` for the current day index. This is enforced in a single `canSend(count)` guard that every send path calls. There is no admin override in V1.

| Week | Daily volume | Segment | Gate to advance |
|---|---|---|---|
| 1 | 500 – 2,000 | cohort_bucket = 1 | bounce <2%, complaint <0.1% |
| 2 | 3,000 – 8,000 | cohort_bucket = 1 | bounce <2%, complaint <0.1% |
| 3 | 10,000 – 20,000 | cohort_bucket ≤ 2 | bounce <2%, complaint <0.1% |
| 4 | 25,000 – 40,000 | cohort_bucket ≤ 2 | open rate >25% |
| 5 | 50,000 – 70,000 | + re-permissioned 3,4 | bounce <2%, complaint <0.1% |
| 6 | 85,000 – 100,000 | all active | reputation stable |
| 7 | full | all active | steady state |

**Abort conditions, evaluated after every campaign:**

| Condition | Action |
|---|---|
| bounce > 3% | freeze volume 72h, alert both founders |
| bounce > 5% | halt all sending, alert, require manual DB flag to resume |
| complaint > 0.1% | freeze volume, alert |
| complaint > 0.5% | halt all sending, alert |
| open rate < 15% on cohort_bucket 1 | freeze volume, alert — this is a product problem, not a delivery problem |

Implement as a `deliverability_guard` Lambda on a 15-minute EventBridge schedule reading SES event data from `email_sends`.

### 6.2 Sending

- SES v2 API, dedicated **sending subdomain** (e.g. `mail.learnai.com.au`), configuration set with event destination → SNS → Lambda → `email_sends` updates.
- SPF, DKIM (3 CNAMEs), DMARC `p=none` at launch, `p=quarantine` from week 8.
- Every send: List-Unsubscribe and List-Unsubscribe-Post headers, one-click unsubscribe honoured within 1 second, physical sender address in footer, plain-text alternative.
- Send in batches of 50 with concurrency limits respecting the SES account send rate. Idempotent per `(campaign_id, subscription_id)`.
- **Suppression check on every recipient at send time**, not just at segment build time.

### 6.3 Segments

Declarative JSON on `email_campaigns.segment`, compiled to SQL:

```json
{ "status": "active",
  "cohort_bucket": { "lte": 2 },
  "cadence": ["daily"],
  "verticals_any": ["general","teaching"],
  "exclude_sent_campaign": "<uuid>" }
```

### 6.4 Sunset policy

Nightly job: any `subscriptions` row with `status='active'` and no `last_open_at` in 120 days → `status='suppressed'`, `sunset_at=now()`. Log to audit.

---

## 7. PWA

- Web app manifest, maskable icons, `display: standalone`, theme colour `#1B3A5C`.
- Service worker: cache-first for shell and static assets; network-first with 7-day cache for the last 7 editions (offline reading).
- **Web Push** via VAPID. Subscription stored in `user_preferences.push_subscription`. Delivered at the user's `send_hour_local` in their `timezone`.
- Install prompt shown after the user's **third** session, dismissible, never shown again once dismissed.
- Vertical video player for `kind='video'`, portrait, one-handed controls, captions on by default.
- Streak counter and a 5-minute completion timer that writes `completions`.
- Lighthouse PWA score ≥ 90 and performance ≥ 85 on mobile — a build gate, not an aspiration.

---

## 8. API contract

REST, JSON, `/api/v1`. Auth via the §2.2 provider. All mutating endpoints require CSRF protection and are rate-limited.

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/auth/signup` | — | Create user, run cohort assignment |
| POST | `/auth/verify` | — | Verify email token |
| GET | `/editions/today` | optional | Today's brief (gated by tier) |
| GET | `/editions/:date` | optional | Specific edition; 7-day window free |
| GET | `/content` | optional | Archive, paginated, filterable by vertical |
| GET | `/content/:slug` | optional | Single item |
| GET | `/search?q=` | optional | Full-text over published items |
| GET | `/prompts` | required | Prompt library; 10 free, rest premium |
| GET | `/me` | required | Profile, tier, streak, org summary |
| PATCH | `/me/preferences` | required | Cadence, send hour, verticals, push |
| POST | `/me/completions` | required | Mark edition complete, update streak |
| GET | `/org/:slug` | required | Cohort page data |
| POST | `/org/:slug/claim` | required | Request cohort claim |
| GET | `/admin/review/queue` | reviewer | Items awaiting review |
| POST | `/admin/review/:id/approve` | reviewer | Approve — resumes Step Functions token |
| POST | `/admin/review/:id/changes` | reviewer | Request changes + notes |
| POST | `/admin/review/:id/reject` | reviewer | Reject |
| GET | `/admin/metrics` | admin | KPI dashboard data |
| POST | `/webhooks/ses` | signed | SES event ingestion |
| GET | `/unsubscribe/:token` | — | One-click unsubscribe, no login |

Error format: `{ "error": { "code": "string", "message": "human readable", "details": {} } }`.

---

## 9. Environment and configuration

```
DATABASE_URL
LLM_PROVIDER               bedrock | anthropic
BEDROCK_REGION             ap-southeast-2
BEDROCK_MODEL_ID
ANTHROPIC_API_KEY          only when LLM_PROVIDER=anthropic
AWS_REGION                 ap-southeast-2
SES_CONFIGURATION_SET
SES_FROM_ADDRESS           brief@mail.learnai.com.au
SES_REPLY_TO
STEP_FUNCTION_ARN
VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY
PUBLIC_BASE_URL
AUTH_SECRET
SENTRY_DSN
FEATURE_PREMIUM_ENABLED    false until week 12
FEATURE_ADS_ENABLED        false until post-launch
```

No secrets in the repo. AWS Secrets Manager or SSM Parameter Store, injected at runtime.

---

## 10. Compliance requirements — NON-NEGOTIABLE

### 10.1 Review gate
Covered in §5.1. No content path may bypass it. Any PR that adds a publish path must add a corresponding test proving approval is required.

### 10.2 Consent evidence
Every `subscriptions` row must carry `consent_source` and `consent_recorded_at`. Rows without both **cannot be sent to** — enforce in the segment compiler, not just by convention. Import tooling must reject records missing consent metadata rather than defaulting them.

### 10.3 Spam Act 2003
Sender identification, functional unsubscribe honoured within 1 second, physical address in every commercial message.

### 10.4 Under-16 exclusion
Signup collects date of birth. Under 16 → reject with a clear message and do not persist the record beyond a hashed rejection log. No exceptions in V1.

### 10.5 Privacy Act / GDPR
- `GET /me/export` returns all personal data as JSON.
- `DELETE /me` soft-deletes, anonymises `email` and `display_name`, hard-deletes within 30 days via scheduled job.
- Cohort pages never expose email addresses.
- EU-resident subscriptions flagged and held to the stricter standard.

### 10.6 Accessibility
WCAG 2.1 AA. Keyboard navigable, visible focus states, captions on all video, colour contrast ≥ 4.5:1, tested with a screen reader on the daily brief and review console.

---

## 11. Testing and quality gates

| Layer | Requirement |
|---|---|
| Unit | Domain parsing and cohort assignment: ≥ 95% branch coverage. Table-driven tests covering subdomains, free-mail, disposable, `.edu.au`, `.gov.au`, unicode, plus-addressing |
| Unit | Segment compiler: every field, plus the consent-evidence exclusion |
| Integration | Full pipeline with a mocked `LlmClient`, asserting the gate blocks publish |
| Integration | SES event webhook → `email_sends` state transitions |
| Contract | Every §8 endpoint: happy path, 401, 403, 422 |
| E2E | Signup → cohort assignment → read brief → mark complete → streak increments |
| E2E | Draft → review → request changes → redraft → approve → publish |
| Security | No publish without approval. No send exceeding warm-up cap. No cross-org data leakage |
| Load | 100,000 sends in one campaign window; 5,000 concurrent readers on the brief |
| Lighthouse | PWA ≥ 90, performance ≥ 85 mobile |

CI runs lint, typecheck, unit, integration, and migration up/down on every PR. E2E and load run nightly.

---

## 12. Task sequence

Twenty-one tasks. Execute in order. Each lists its acceptance criteria — all must pass before moving on.

### Day 1 — Foundation

**T01 · Repository and CI/CD**
Monorepo scaffold, TypeScript strict, lint, format, test runner, CI pipeline, deploy to a staging environment.
*Accept:* CI green on an empty PR; staging URL responds; `README` documents local setup in under 10 commands.

**T02 · Database schema and migrations**
All of §3 as versioned migrations. Seed script for `content_sources` (Appendix B of the business plan), free-mail domains, known-institution mappings, and `warmup_schedule`.
*Accept:* migrate up and down cleanly; all constraints present; seed populates ≥ 25 sources across 3 tiers; `published_needs_approval` constraint proven by a failing insert test.

**T03 · Auth adapter and user model**
Implement the §2.2 `AuthProvider` interface with the recommended default. Signup, verify, session, role guards.
*Accept:* signup creates a `users` row; unverified users cannot access member routes; `requireRole` returns 403 correctly; swapping the provider requires touching only `lib/auth/`.

### Day 2 — Cohort layer

**T04 · Domain parsing and organisation matching**
Public Suffix List reduction, free-mail and disposable detection, `deriveName`, `inferKind`.
*Accept:* the §11 table-driven test suite passes at ≥ 95% branch coverage; `mail.student.mq.edu.au` → `mq.edu.au` → Macquarie University.

**T05 · Cohort assignment on signup**
Wire §4.1 into the signup flow. Auto-create organisations. `member_count` maintained by trigger.
*Accept:* `x@mq.edu.au` joins the existing Macquarie org; `x@newco.com.au` creates one flagged `auto_created`; `x@gmail.com` gets `individual` track; assignment failure never blocks signup.

**T06 · Cohort page**
`/org/[slug]` per §4.2, plus the claim flow and the admin rename queue for auto-created orgs.
*Accept:* members see colleagues; non-members get 403; no email addresses in any response payload; aggregates suppressed below 3 members; opt-out respected.

### Day 3 — Content pipeline

**T07 · RSS ingestion service**
Poll due sources, parse feeds, canonicalise URLs, sha256 dedupe, write `source_candidates`, track failures and auto-deactivate after 5 consecutive failures.
*Accept:* ingests all seeded Tier 1 and 2 sources; re-running produces zero duplicates; a malformed feed does not fail the batch.

**T08 · LLM client abstraction**
§2.3 interface, both implementations, provider selection, token and cost logging to `agent_runs`, retry with backoff, JSON-mode parsing with fence stripping.
*Accept:* both implementations pass the same contract test suite; every call writes an `agent_runs` row; malformed JSON responses retry once then fail cleanly.

**T09 · Triage agent**
§5.2 prompt, batch scoring, writes `triage_score` and `triage_reason`, excludes Tier 3 from selection.
*Accept:* scores a fixture batch of 20 candidates; Tier 3 never appears in the selected set; output schema validated.

**T10 · Draft agent**
§5.3 prompt, three `kind` variants, `insufficient_source` handling, vertical rotation per §5.4.
*Accept:* produces valid `content_items` for all three kinds; refuses on a deliberately thin source; rotation honoured over a simulated 10-day window.

**T11 · Step Functions orchestration**
Wire T07–T10 into the §5.1 state machine, minus the review gate (stub the wait state).
*Accept:* one execution ingests, triages, drafts, and persists three `in_review` items with an edition; execution visible in the console; failures alert.

### Day 4 — Review gate

**T12 · Review queue API and token handling**
Callback pattern, token stored on `content_items`, approve/changes/reject endpoints that resume or fail the execution.
*Accept:* approving resumes the paused execution; rejecting archives; no timeout auto-approves; a 72h timeout fails and alerts.

**T13 · Reviewer console UI**
§5.5 in full, including keyboard shortcuts, Tier 2 verification checkbox, dual review for health/finance, elapsed-time display.
*Accept:* a full edition reviewable in under 5 minutes in a timed run; Tier 2 approve blocked until verification ticked; health item cannot be published on a single approval.

**T14 · Audit log**
Append-only logging of every publish decision, review action, cohort assignment, and send. Application role has no UPDATE or DELETE.
*Accept:* privilege test proves immutability; every state transition in the E2E test appears in the log.

### Day 5 — Front end

**T15 · Daily brief, archive, search**
Today's brief, per-date editions, paginated archive, full-text search, tier gating (7-day free window), SSR with correct meta tags for SEO.
*Accept:* free user sees 7 days and is prompted beyond; premium sees all; search returns ranked results; Lighthouse SEO ≥ 95 on an archive page.

**T16 · Video player, vertical channels, prompt library**
Player with captions, vertical filtering and following, prompt library with the 10-free/rest-premium split.
*Accept:* captions render; vertical filter persists to preferences; prompt 11 is gated for free users.

### Day 6 — PWA and email

**T17 · PWA shell**
Manifest, service worker, offline caching of the last 7 editions, install prompt on third session.
*Accept:* installs on iOS and Android; last 7 briefs readable in airplane mode; Lighthouse PWA ≥ 90.

**T18 · Web Push**
VAPID, subscription storage, delivery at the user's local send hour, unsubscribe handling.
*Accept:* notification arrives at the configured local hour across two timezones; revoked subscriptions cleaned up.

**T19 · Email subsystem**
SES integration, templates (HTML + plain text), segment compiler, campaign runner, warm-up guard, suppression, SES event webhook, one-click unsubscribe, sunset job.
*Accept:* a campaign to a 500-address test segment sends and records events; `canSend` refuses a volume above the day's cap with no override path; unsubscribe honoured in under 1 second; consent-less records excluded by the compiler.

### Day 7 — Harden and ship

**T20 · Analytics, metrics, compliance endpoints**
KPI dashboard per business plan Table 27, `/me/export`, `/me` deletion, under-16 rejection, accessibility pass.
*Accept:* dashboard renders all KPIs from real data; export returns complete personal data; WCAG 2.1 AA verified on brief and review console with a screen reader.

**T21 · Load test, security review, production deploy**
Load per §11, dependency and secret scan, IAM least-privilege review, runbook for the abort conditions in §6.1, production deploy.
*Accept:* 100,000-send campaign completes within the window; 5,000 concurrent readers with p95 < 500ms; no high-severity findings; runbook reviewed by both founders; production smoke test green.

---

## 13. Explicitly out of scope for V1

Do not build these, and do not leave stubs that imply they exist.

| Excluded | Note |
|---|---|
| Native iOS/Android apps | PWA only |
| Stripe / payments | Feature-flagged off; week 12 |
| Cohort leaderboards | After the core cohort layer proves out |
| Live cohort courses | Phase 2 |
| Automated social posting | V1 writes to a queue; posting is manual |
| Display ad units | Feature-flagged off; archive pages only when enabled |
| Non-English content | Phase 3 |
| Members under 16 | Rejected at signup, permanently |
| Admin content authoring from scratch | V1 is agent-draft plus human edit |

---

## 14. Definition of done for V1

- [ ] All 21 tasks complete with acceptance criteria passing
- [ ] The six success criteria in §1 demonstrably met
- [ ] No publish path bypasses the review gate, proven by test
- [ ] No send path bypasses the warm-up cap, proven by test
- [ ] Consent-less subscription records cannot be sent to, proven by test
- [ ] Under-16 signups rejected, proven by test
- [ ] Lighthouse PWA ≥ 90, performance ≥ 85, SEO ≥ 95
- [ ] WCAG 2.1 AA verified on the brief and the review console
- [ ] Runbook exists for every abort condition in §6.1
- [ ] Both founders have completed one real edition review end to end in under 5 minutes

---

*Learn AI — V1 Build Specification · Version 1.0 · 11 August 2026 · Commercial in confidence*
