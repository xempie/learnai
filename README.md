# Acadu

AI-literacy platform: short video topics, quizzes, streaks, and organisation
cohorts that form automatically from the learner's email domain.

Next.js 16 (App Router) · TypeScript strict · Tailwind v4 · Drizzle ORM ·
PostgreSQL · Amazon Cognito · Stripe · S3 + CloudFront.

---

## Run it locally

You need **Node 20+**, **pnpm**, and **Docker** (for Postgres).

```bash
pnpm install
cp .env.example .env.local     # defaults work as-is for local dev
pnpm db:up                     # Postgres 16 on localhost:5433
pnpm db:push                   # create the tables
pnpm db:seed                   # categories, an org, users, 11 topics
pnpm dev
```

Open http://localhost:3000 and sign in with a seeded account:

```
admin@data-corner.com.au   / ChangeMe12345!    platform admin
learner@adelaide.edu.au    / TestPassword123   in the pilot organisation
solo@gmail.com             / TestPassword123   free tier, trial lapsed
```

These passwords are **local defaults only**. Production overrides them with
generated values held in Secrets Manager (`acadu/seed-admin-password`,
`acadu/seed-learner-password`) - see [DEPLOYMENT.md](DEPLOYMENT.md).

`npm` is broken on the primary dev machine (a corrupted Herd nvm shim) - use
`pnpm` for everything.

### No AWS account needed

The app runs fully offline. Three switches in `.env.local` control this:

| Variable | Empty / true (default) | Set |
|---|---|---|
| `COGNITO_USER_POOL_ID` | **Dev auth**: passwords hashed with PBKDF2 in the local `auth_credentials` table; verification codes printed to the server console | Real Cognito, including Google sign-in |
| `USE_LOCAL_UPLOADS` | Uploads written to `public/uploads/`, served by the dev server | Presigned S3 PUT + signed CloudFront playback |
| `STRIPE_SECRET_KEY` | Billing routes return `501 NOT_CONFIGURED`; the rest of the app works | Real Checkout, Billing Portal and webhooks |

A new engineer is productive in about two minutes, and nothing bills anyone.

### Useful commands

```bash
pnpm dev            # dev server
pnpm build          # production build
pnpm typecheck      # tsc --noEmit
pnpm lint
pnpm db:studio      # Drizzle Studio, browse the data
pnpm db:generate    # new SQL migration after a schema change
pnpm db:migrate     # apply migrations (use instead of db:push in staging/prod)
pnpm db:down        # stop Postgres
```

---

## Architecture

```
src/
├── app/
│   ├── (marketing)/        public pages: landing, privacy, terms
│   ├── (auth)/             login, signup, verify, onboarding
│   ├── (app)/              authenticated shell: feed, topics, org, activity, settings
│   ├── admin/              role-gated content ops, analytics, moderation, users
│   └── api/v1/             route handlers (the backend)
├── db/
│   ├── schema.ts           Drizzle schema - single source of truth
│   ├── migrations/         forward-only SQL, never edited after merge
│   ├── queries/            typed query functions (analytics lives here)
│   └── seed.ts
├── lib/
│   ├── auth/               Cognito + dev provider, session, guards
│   ├── entitlements.ts     the single access gate
│   ├── visibility.ts       the ONLY place org_visible is filtered
│   ├── domain-matching.ts  email domain -> organisation
│   ├── coupons.ts          discount validation and redemption
│   ├── org-codes.ts        team join codes
│   ├── storage.ts          presigned uploads, signed playback
│   ├── stripe.ts           lazily-constructed client, subscription sync
│   ├── notifications.ts    fan-out with the daily cap
│   └── audit.ts            audit_log + analytics_events writers
└── components/             UI
```

### Rules that are not negotiable

These come from the technical spec and are enforced in code, not documentation:

1. **`org_visible` defaults to `false`.** Every query that can return another
   member goes through `src/lib/visibility.ts`. Never write
   `where org_visible = true` anywhere else.
2. **Cohort counts below `MIN_COHORT_DISPLAY` (5) are suppressed.** With two
   members, "2 people" plus one known colleague identifies someone.
3. **Domain matching runs only after email verification.** An unverified address
   must never grant access to an organisation.
4. **Entitlements are resolved server-side before a playback URL is signed.**
   Signing first is the bug to avoid - a leaked signed URL is a leaked video.
5. **Org admin analytics are aggregate-only**, with a minimum cell size of 5.
   Never an individual name, score, or viewing history.
6. **Stripe webhooks are idempotent.** `event.id` is inserted into
   `processed_webhook_events` before any work; a duplicate returns 200 and does
   nothing.
7. **Affiliate and sponsor disclosures render from the data model**, and the
   disclosure text is stored so it is auditable after the fact.
8. **Captions are required before a video publishes.** Accessibility, the older
   learner persona, and sound-off mobile viewing all depend on them.
9. **Episodes are capped at 360 seconds**, enforced by a database check
   constraint as well as the API.

---

## Database design

30 tables. The full schema is `src/db/schema.ts`, which is commented throughout.

The content model is **already creator-ready** even though only platform admins
can publish today. A topic carries `owner_id`, `origin` (`platform` | `creator`),
`pricing_model` and `price_cents`; `instructor_profiles` holds the seller
identity and Stripe Connect account; `enrollments` records entitlement per user
per topic however it was acquired; `orders` / `order_items` / `payouts` carry
the revenue split. Opening the marketplace in year 2 is a permissions and UI
change, not a destructive migration.

```
organizations ─┬─ organization_domains
               ├─ org_join_codes ── org_join_code_redemptions
               └─ users ─┬─ user_categories ── categories
                         ├─ enrollments ── topics ─┬─ episodes ── episode_progress
                         ├─ likes / bookmarks       ├─ topic_categories
                         ├─ comments ── comment_reports
                         ├─ notifications           ├─ topic_hashtags ── hashtags
                         ├─ subscriptions           ├─ topic_links
                         ├─ orders ── order_items   └─ topic_attachments
                         ├─ daily_activity / user_streaks
                         └─ quiz_attempts ── quizzes ── quiz_questions ── quiz_options
```

## Content model

A **topic** is one subject. It holds one or more **episodes**, each a video
capped at five minutes by a database constraint.

- One episode: the page renders a single player and no episode list.
- Several episodes: the page renders the ordered list with lock states.

Topics and articles share one table with a `type` discriminator, so likes,
comments, bookmarks and analytics reference a single foreign key instead of
branching on content type in a dozen places.

Non-paying accounts, **including trials**, may watch a topic's free intro video
plus its first `PREVIEW_EPISODE_COUNT` (2) episodes. Everything after that needs
an active subscription or an organisation licence.

---

## API

REST under `/api/v1`, JSON only. Conventions:

- Validation with Zod; failures return `422` and a field-level error map.
- Errors: `{ "error": { "code": "SNAKE_CASE", "message": "...", "details": {...} } }`
- Cursor pagination: `?limit=20&cursor=<opaque>` → `{ data, next_cursor }`
- Rate limits: 100/min reads, 20/min writes, 5/min auth.

Browser code should use `src/lib/api-client.ts` rather than raw `fetch` - it
unwraps the error envelope and batches analytics events (10s flush, plus a
`sendBeacon` flush on page hide).

---

## Testing priorities

Given a small team, test these and let the rest ride:

1. `entitlements.ts` - every branch. A bug gives away paid content or blocks a
   paying customer.
2. `visibility.ts` - assert no query path returns a non-opted-in user.
3. `domain-matching.ts` - `gmail.com`, `adelaide.edu.au`,
   `student.adelaide.edu.au`, `company.co.uk`, unknown domain creating a
   provisional org.
4. Stripe webhook idempotency - replay the same event twice, assert one grant.
5. `coupons.ts` - expiry, usage limits, per-user limits.

---

## Deployment

See [DEPLOYMENT.md](DEPLOYMENT.md).
