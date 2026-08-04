# Services Funnel & Free Platform Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align the Acadu codebase with `LEARN_AI_SERVICES_ACTION_PLAN.md`: make the platform free (funnel, not revenue), add service landing pages (workshops / advisory / pilot sprint / 1:1 training with Cal.com), a "Talk to us about your team" enquiry pipeline with a leads table, an admin leads screen tracking qualified conversations, an AI-updates rail, a content-drafts review queue, and fix known housekeeping bugs.

**Architecture:** All new API routes follow the existing `/api/v1` conventions (`handler()` wrapper from `src/lib/api.ts`, Zod v4 validation, error envelope, in-process rate limits, `audit()` trail). New marketing pages live in `src/app/(marketing)/`. The leads table and enquiry route reuse the existing `src/lib/domain-parse.ts` intelligence to route org enquiries out of the hourly funnel. The agent content pipeline stays **external** — this repo only gets the ingestion endpoint and the human review queue over the existing `content_drafts` table.

**Tech Stack:** Next.js 16.2.12 App Router, React 19, TypeScript strict, Tailwind v4, Drizzle ORM + Postgres 16, Zod v4, node:test via tsx.

## Global Constraints

- **This is Next.js 16, not the one you know.** `params` and `searchParams` in pages are `Promise`s and must be awaited (see `src/app/(app)/content/[slug]/page.tsx:113-117`). Route handlers export `export const runtime = "nodejs"; export const dynamic = "force-dynamic";`. Read `node_modules/next/dist/docs/01-app/` if unsure.
- **pnpm only** — npm is broken on this machine (corrupted shim). Commands: `pnpm dev`, `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm db:generate`, `pnpm db:push`.
- Local DB: `pnpm db:up` starts Postgres on port **5433** (docker compose). If schema changed: `pnpm db:generate` then `pnpm db:push`.
- Every API route: wrap in `handler()`, throw `ApiError`, validate with `parseBody`/`parseQuery` from `@/lib/api`. JSON responses use **snake_case** keys. Rate-limit writes. Call `audit()` (see signature in `src/lib/audit.ts`) for admin/state-changing actions. Never log PII.
- Browser code must call the API through the helper in `src/lib/api-client.ts` — open that file and copy how `src/components/comments-section.tsx` uses it.
- Admin UI reuses primitives from `src/components/admin/admin-ui.tsx` and follows the pattern of `src/app/admin/coupons/page.tsx` + `src/components/admin/coupons-view.tsx`.
- Copy is Australian English. Prices verbatim from the action plan: workshops **$12–25k**, advisory **$20–60k**, Pilot Sprint **$25–40k**, 1:1 training rate ladder **$90–120 / $150–220 / $250–350 / $350+** per hour.
- `scripts/verify-live.sh` asserts the **homepage** contains "episode", contains "Become the person your team asks about AI", and contains **zero occurrences of "course"**. Never put the word "course" on `/` (the training page may use it — it's not the homepage).
- After each task: `pnpm typecheck && pnpm lint && pnpm test` must pass. Commit each task with a conventional message ending in:
  `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`

---

## Phase 0 — Baseline

### Task 0.1: Branch + baseline commit

Almost the whole codebase is currently **untracked** (only the create-next-app commit exists). Per-task commits need a baseline.

**Files:** none created.

- [ ] **Step 1:** `git checkout -b services-funnel`
- [ ] **Step 2:** `git add -A && git commit -m "chore: platform V1 baseline before services funnel work"` (include the footer). Do NOT commit `.env.local`, `.audit/`, `out/`, `.next/` — verify `.gitignore` covers them first with `git status --short`; if `out/` is listed, add `out/` to `.gitignore` before committing.
- [ ] **Step 3:** `pnpm typecheck && pnpm lint && pnpm test` — all pass (baseline green).

---

## Phase 1 — Free platform

### Task 1.1: Free-platform entitlement flag

**Files:**
- Modify: `src/lib/config.ts` (flags block, ~line 75)
- Modify: `src/lib/entitlements.ts` (reason union ~line 28, `getEntitlements` ~line 50)
- Modify: `.env.example` (add `FEATURE_FREE_PLATFORM`, `FEATURE_BILLING`)

**Interfaces:**
- Produces: `config.flags.freePlatform: boolean` (default **true**), `config.flags.billing: boolean` (default **false**); `Entitlements["reason"]` gains `"free_platform"`.

- [ ] **Step 1:** In `config.ts` flags block add:

```ts
flags: {
  comments: bool("FEATURE_COMMENTS", true),
  search: bool("FEATURE_SEARCH", false),
  share: bool("FEATURE_SHARE", true),
  /**
   * SERVICES_ACTION_PLAN §1: the platform is a funnel, not a revenue line.
   * When true every verified account gets full access and billing UI is hidden.
   */
  freePlatform: bool("FEATURE_FREE_PLATFORM", true),
  billing: bool("FEATURE_BILLING", false),
},
```

- [ ] **Step 2:** In `entitlements.ts`: add `"free_platform"` to the `reason` union; in `getEntitlements`, directly after the staff check insert:

```ts
// SERVICES_ACTION_PLAN §1: the free platform is the funnel; services are revenue.
if (config.flags.freePlatform) {
  return fullTier("free_platform", user.trialEndsAt, purchased);
}
```

- [ ] **Step 3:** Add both env names (values `true`/`false`) to `.env.example` next to the other FEATURE_ vars.
- [ ] **Step 4:** `pnpm typecheck && pnpm lint && pnpm test` — pass. (The entitlement unit tests re-implement `canAccessEpisode` locally and are unaffected — that's correct: per-episode rules still hold for any future non-full tier.)
- [ ] **Step 5:** Manual check: `pnpm db:up && pnpm dev`, sign in as the seeded learner (see README), `GET /api/v1/me` shows `"tier":"full","reason":"free_platform"`.
- [ ] **Step 6:** Commit `feat: free-platform entitlement flag`.

### Task 1.2: Hide billing UI and trial countdown when platform is free

**Files:**
- Modify: `src/components/settings-view.tsx` (SubscriptionSection)
- Modify: `src/components/app-shell.tsx` (trial countdown card)
- Modify: `.env.example` (add `NEXT_PUBLIC_FREE_PLATFORM=true`)

**Interfaces:**
- Consumes: `/api/v1/me` boot payload already serialises `entitlements.reason`.

- [ ] **Step 1:** In `settings-view.tsx`, render `SubscriptionSection` only when billing is on: `const billingEnabled = process.env.NEXT_PUBLIC_FREE_PLATFORM !== "true";` and wrap the section (`{billingEnabled && <SubscriptionSection … />}`). Keep the component code intact — it's dormant, not deleted.
- [ ] **Step 2:** In `app-shell.tsx`, the trial-countdown/upgrade card must not render when the current user's entitlement reason is `free_platform` (the `/me` payload is already in context) — or when `process.env.NEXT_PUBLIC_FREE_PLATFORM === "true"`. Whichever the component can reach with least code; prefer the entitlements payload.
- [ ] **Step 3:** Add `NEXT_PUBLIC_FREE_PLATFORM=true` to `.env.example` and `.env.local`.
- [ ] **Step 4:** `pnpm typecheck && pnpm lint`; in the dev server confirm `/settings` shows no subscription section and the sidebar shows no trial card.
- [ ] **Step 5:** Commit `feat: hide billing UI on free platform`.

### Task 1.3: Landing page — pricing section becomes services section

**Files:**
- Modify: `src/app/page.tsx` (the `{/* ===== Pricing ===== */}` section, lines ~252–315, plus hero microcopy)

- [ ] **Step 1:** Replace the three pricing cards with a **Services** section, `aria-labelledby="services-heading"`, heading `Work with the people behind the platform`. Four cards using the same card classes as the current pricing cards:
  1. **Corporate workshops** — "AI literacy, responsible AI and digital transformation for your whole team." — `$12–25k` — link `/services/workshops`.
  2. **AI advisory** — "Strategy and hard decisions with two AI PhDs, without hiring a team." — `$20–60k` — link `/services/advisory`.
  3. **AI Pilot Sprint** — "A fixed-scope working pilot in 2–4 weeks." — `$25–40k` — link `/services/pilot-sprint`.
  4. **1:1 training** — "Personal AI and software development coaching, basic to advanced." — `from $90/hr` — link `/services/training`.
  Below the grid, one centred CTA styled like the current primary button: `Talk to us about your team` → `/enquiry?service=team_platform`. Card copy must not contain the word "course" (say "tracks").
- [ ] **Step 2:** Hero microcopy: change `3 episodes free · no card` to `Free · no card needed`. Leave the H1 and "episode" wording untouched (verify-live assertions).
- [ ] **Step 3:** Footer: add links `Workshops`, `Advisory`, `Pilot Sprint`, `1:1 training`, `Enquire` alongside Privacy/Terms.
- [ ] **Step 4:** `pnpm typecheck && pnpm lint`; view `/` in dev — services section renders, no `$9/month` anywhere: `grep -rn '\$9' src/app/page.tsx` returns nothing.
- [ ] **Step 5:** Commit `feat: landing services section replaces pricing`.

---

## Phase 2 — Leads table and enquiry API

### Task 2.1: `leads` schema + migration

**Files:**
- Modify: `src/db/schema.ts` (new section before `CONTENT PIPELINE`, after `processedWebhookEvents`)

**Interfaces:**
- Produces: exported Drizzle table `leads` with columns exactly as below (later tasks import `leads` from `@/db/schema`).

- [ ] **Step 1:** Add:

```ts
/* ============================================================
   SERVICES FUNNEL  (SERVICES_ACTION_PLAN — leads & enquiries)
   ============================================================ */

/**
 * A service enquiry. The metric that decides everything is qualified
 * conversations per month originating from the platform — that is
 * count(*) where qualified_at is in the month.
 */
export const leads = pgTable(
  "leads",
  {
    id: id(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    /** lowercase registrable domain; null for consumer mailboxes */
    orgDomain: text("org_domain"),
    orgName: text("org_name"),
    orgId: uuid("org_id").references(() => organizations.id, { onDelete: "set null" }),
    serviceInterest: text("service_interest").notNull(),
    teamSize: integer("team_size"),
    message: text("message"),
    /** Routed out of the hourly funnel (SERVICES_ACTION_PLAN §3). */
    isTeam: boolean("is_team").notNull().default(false),
    source: text("source").notNull().default("platform"),
    status: text("status").notNull().default("new"),
    notes: text("notes"),
    /** Set once, the first time status reaches 'qualified'. */
    qualifiedAt: timestamp("qualified_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check(
      "leads_service",
      sql`${t.serviceInterest} in ('workshop','advisory','pilot_sprint','training','team_platform','other')`,
    ),
    check(
      "leads_status",
      sql`${t.status} in ('new','contacted','qualified','converted','closed')`,
    ),
    index("leads_status_idx").on(t.status, t.createdAt),
    index("leads_qualified_idx").on(t.qualifiedAt),
  ],
);
```

- [ ] **Step 2:** `pnpm db:generate` (new migration appears in `src/db/migrations/`), then `pnpm db:push`.
- [ ] **Step 3:** `pnpm typecheck` — pass.
- [ ] **Step 4:** Commit `feat: leads table` (include the generated migration).

### Task 2.2: Enquiry classification (TDD)

**Files:**
- Create: `src/lib/leads.ts`
- Create: `src/lib/schemas/leads.ts`
- Test: `tests/lead-routing.test.ts`

**Interfaces:**
- Consumes: `domainOf(email)`, `isFreeEmailDomain(domain)`, `registrableDomain(domain)` from `@/lib/domain-parse` (verify exact signatures in that file before writing — they are pure and unit-tested in `tests/domain-matching.test.ts`).
- Produces: `classifyEnquiry({ serviceInterest, email, teamSize }): { isTeam: boolean; orgDomain: string | null }`; Zod schema `enquirySchema`.

- [ ] **Step 1:** Write the failing test `tests/lead-routing.test.ts`:

```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { classifyEnquiry } from "../src/lib/leads";

describe("classifyEnquiry", () => {
  it("routes team services to the workshop funnel", () => {
    for (const s of ["workshop", "advisory", "pilot_sprint", "team_platform"] as const) {
      assert.equal(classifyEnquiry({ serviceInterest: s, email: "a@corp.com.au" }).isTeam, true);
    }
  });
  it("keeps solo training in the hourly funnel", () => {
    const r = classifyEnquiry({ serviceInterest: "training", email: "a@gmail.com" });
    assert.equal(r.isTeam, false);
    assert.equal(r.orgDomain, null);
  });
  it("routes training out of the hourly funnel when a team size is given", () => {
    assert.equal(
      classifyEnquiry({ serviceInterest: "training", email: "a@corp.com.au", teamSize: 5 }).isTeam,
      true,
    );
  });
  it("derives the registrable org domain from a corporate address", () => {
    const r = classifyEnquiry({ serviceInterest: "workshop", email: "a@mail.hr.acme.com.au" });
    assert.equal(r.orgDomain, "acme.com.au");
  });
  it("never treats a consumer mailbox as an organisation", () => {
    assert.equal(classifyEnquiry({ serviceInterest: "workshop", email: "a@outlook.com" }).orgDomain, null);
  });
  it("returns null org domain for malformed email", () => {
    assert.equal(classifyEnquiry({ serviceInterest: "other", email: "not-an-email" }).orgDomain, null);
  });
});
```

- [ ] **Step 2:** `pnpm test` — FAILS (module not found).
- [ ] **Step 3:** Implement `src/lib/leads.ts` (no `server-only` import — tests must load it, same as `domain-parse.ts`):

```ts
import { domainOf, isFreeEmailDomain, registrableDomain } from "@/lib/domain-parse";

export type ServiceInterest =
  | "workshop"
  | "advisory"
  | "pilot_sprint"
  | "training"
  | "team_platform"
  | "other";

export const SERVICE_INTERESTS = [
  "workshop",
  "advisory",
  "pilot_sprint",
  "training",
  "team_platform",
  "other",
] as const;

/** Services that are team engagements by definition (SERVICES_ACTION_PLAN §1). */
const TEAM_SERVICES: ReadonlySet<ServiceInterest> = new Set([
  "workshop",
  "advisory",
  "pilot_sprint",
  "team_platform",
]);

export interface EnquiryClassification {
  /**
   * True when this must leave the hourly funnel: a company booking delivered
   * at $120/hr is a mispriced workshop (SERVICES_ACTION_PLAN §3).
   */
  isTeam: boolean;
  orgDomain: string | null;
}

export function classifyEnquiry(input: {
  serviceInterest: ServiceInterest;
  email: string;
  teamSize?: number | null;
}): EnquiryClassification {
  const domain = domainOf(input.email);
  const orgDomain =
    domain && !isFreeEmailDomain(domain) ? registrableDomain(domain) : null;
  const isTeam =
    TEAM_SERVICES.has(input.serviceInterest) || (input.teamSize ?? 1) > 1;
  return { isTeam, orgDomain: orgDomain || null };
}
```

Note: if the test-runner cannot resolve the `@/` alias (check how `tests/domain-matching.test.ts` imports — it uses a relative path), use a relative import in the test and in `leads.ts` use `./domain-parse`.

- [ ] **Step 4:** `pnpm test` — PASS.
- [ ] **Step 5:** Create `src/lib/schemas/leads.ts` (follow the style of `src/lib/schemas/auth.ts`; Zod **v4** — `z.email()` not `z.string().email()`):

```ts
import { z } from "zod";
import { SERVICE_INTERESTS } from "@/lib/leads";

export const enquirySchema = z.object({
  name: z.string().trim().min(2, "Please tell us your name.").max(80),
  email: z.email("Enter a valid email address.").trim().toLowerCase().max(254),
  org_name: z.string().trim().max(120).optional(),
  service_interest: z.enum(SERVICE_INTERESTS),
  team_size: z.coerce.number().int().min(1).max(100_000).optional(),
  message: z.string().trim().max(4000).optional(),
});

export const leadPatchSchema = z
  .object({
    status: z.enum(["new", "contacted", "qualified", "converted", "closed"]).optional(),
    notes: z.string().trim().max(8000).nullable().optional(),
  })
  .refine((v) => v.status !== undefined || v.notes !== undefined, {
    message: "Nothing to update.",
  });
```

- [ ] **Step 6:** `pnpm typecheck && pnpm test` — PASS. Commit `feat: enquiry classification and schemas`.

### Task 2.3: `POST /api/v1/enquiries` + lead notification email

**Files:**
- Create: `src/app/api/v1/enquiries/route.ts`
- Modify: `src/lib/email.ts` (append one template)
- Modify: `src/lib/config.ts` (add `leads` block)
- Modify: `.env.example` (`LEAD_NOTIFY_EMAIL`)

**Interfaces:**
- Consumes: `leads` table (Task 2.1), `enquirySchema` (2.2), `classifyEnquiry` (2.2), `audit()` from `@/lib/audit` (match its exact signature in `src/lib/audit.ts`).
- Produces: `POST /api/v1/enquiries` → `201 { id, is_team }`; `sendLeadNotificationEmail(lead: LeadNotification): Promise<void>`.

- [ ] **Step 1:** `config.ts` — after the `ses` block add:

```ts
leads: {
  /** Where new service enquiries are sent. */
  notifyEmail: str("LEAD_NOTIFY_EMAIL", "afhayati@gmail.com"),
},
```

- [ ] **Step 2:** `email.ts` — append:

```ts
export interface LeadNotification {
  name: string;
  email: string;
  orgName: string | null;
  service: string;
  teamSize: number | null;
  message: string | null;
  isTeam: boolean;
}

/** New-enquiry alert to the founders. Reply-to is set to the enquirer. */
export async function sendLeadNotificationEmail(lead: LeadNotification): Promise<void> {
  const kind = lead.isTeam ? "TEAM enquiry" : "enquiry";
  const lines = [
    `Service: ${lead.service}`,
    `From: ${lead.name} <${lead.email}>`,
    lead.orgName ? `Organisation: ${lead.orgName}` : null,
    lead.teamSize ? `Team size: ${lead.teamSize}` : null,
    lead.message ? `\n${lead.message}` : null,
    `\nManage: ${config.appUrl}/admin/leads`,
  ].filter(Boolean);
  await send({
    to: config.leads.notifyEmail,
    subject: `New ${kind}: ${lead.service} — ${lead.name}`,
    text: lines.join("\n"),
    html: layout(
      `New ${kind}`,
      `<p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#4d4d4d">${lines
        .join("<br>")
        .replace(/\n/g, "<br>")}</p>`,
    ),
  });
}
```

(`send`/`layout` are module-private in the same file — this appends inside it. Do not HTML-inject: the message field is user input, escape `<`, `>` and `&` before interpolating into `html`; add a tiny local `esc()` helper.)

- [ ] **Step 3:** Create the route:

```ts
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { leads, organizationDomains } from "@/db/schema";
import { clientIp, handler, ok, parseBody, rateLimit } from "@/lib/api";
import { audit } from "@/lib/audit";
import { sendLeadNotificationEmail } from "@/lib/email";
import { classifyEnquiry } from "@/lib/leads";
import { enquirySchema } from "@/lib/schemas/leads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/v1/enquiries — public. The "Talk to us about your team" route.
 * No auth: a buyer must never need an account to start a sales conversation.
 */
export const POST = handler(async (req: Request) => {
  rateLimit(`enquiry-ip:${clientIp(req)}`, 3, 60_000);

  const body = await parseBody(req, enquirySchema);
  const { isTeam, orgDomain } = classifyEnquiry({
    serviceInterest: body.service_interest,
    email: body.email,
    teamSize: body.team_size ?? null,
  });

  let orgId: string | null = null;
  if (orgDomain) {
    const match = await db.query.organizationDomains.findFirst({
      where: eq(organizationDomains.domain, orgDomain),
      columns: { orgId: true },
    });
    orgId = match?.orgId ?? null;
  }

  const [lead] = await db
    .insert(leads)
    .values({
      name: body.name,
      email: body.email,
      orgDomain,
      orgName: body.org_name ?? null,
      orgId,
      serviceInterest: body.service_interest,
      teamSize: body.team_size ?? null,
      message: body.message ?? null,
      isTeam,
    })
    .returning({ id: leads.id });

  await audit({
    action: "lead.created",
    entityType: "lead",
    entityId: lead!.id,
    metadata: { service: body.service_interest, is_team: isTeam },
    ipAddress: clientIp(req),
  });

  // Best-effort: a failed alert must never fail the enquiry.
  void sendLeadNotificationEmail({
    name: body.name,
    email: body.email,
    orgName: body.org_name ?? null,
    service: body.service_interest,
    teamSize: body.team_size ?? null,
    message: body.message ?? null,
    isTeam,
  });

  return ok({ id: lead!.id, is_team: isTeam }, 201);
});
```

- [ ] **Step 4:** Add `LEAD_NOTIFY_EMAIL=` to `.env.example`.
- [ ] **Step 5:** Verify with dev server:

```bash
curl -s -X POST http://localhost:3000/api/v1/enquiries -H 'content-type: application/json' \
  -d '{"name":"Test Person","email":"test@acme.com.au","service_interest":"workshop","team_size":12,"message":"AI literacy for our team"}'
```

Expected: `201` with `{"id":"…","is_team":true}`; server log shows `[email:not-configured] would send to …`. A fourth call within a minute returns `429`.

- [ ] **Step 6:** `pnpm typecheck && pnpm lint && pnpm test`. Commit `feat: public enquiry endpoint with lead routing`.

---

## Phase 3 — Enquiry page and service landing pages

### Task 3.1: Marketing shell + enquiry form

**Files:**
- Create: `src/components/services/service-shell.tsx` (server component)
- Create: `src/components/services/enquiry-form.tsx` (client component)
- Create: `src/app/(marketing)/enquiry/page.tsx`

**Interfaces:**
- Produces: `<ServiceShell title subtitle eyebrow children>` — header (BRAND logo → `/`, links to the four service pages + "Log in"), content column, closing CTA banner → `/enquiry`, footer (Privacy/Terms). Reuse the landing page's Tailwind vocabulary (`page-container`, `border-line`, `bg-band`, `rounded-card`, `text-ink-muted`, `bg-primary text-on-primary`) — copy class stacks from `src/app/page.tsx`.
- Produces: `<EnquiryForm defaultService?: ServiceInterest>` posting to `/api/v1/enquiries`.

- [ ] **Step 1:** Build `ServiceShell` (~80 lines). Header identical in structure to the landing header; nav links: Workshops, Advisory, Pilot Sprint, 1:1 training, Enquire. Footer identical to landing footer.
- [ ] **Step 2:** Build `EnquiryForm`: fields name (required), work email (required), organisation (optional), service (select from `SERVICE_INTERESTS` with human labels: Corporate workshop / AI advisory / AI Pilot Sprint / 1:1 training / Team platform access / Something else), team size (number, optional), message (textarea, optional). Submit via the `api-client` helper; render the 422 field-error map inline (copy the error-handling pattern from `src/components/signup-form.tsx`). Success state replaces the form: heading `Thanks — we'll reply within one business day.` and, when the response has `is_team: true`, the line `We'll come prepared to talk about your whole team, not just one seat.`
- [ ] **Step 3:** `src/app/(marketing)/enquiry/page.tsx`:

```tsx
import type { Metadata } from "next";
import { EnquiryForm } from "@/components/services/enquiry-form";
import { ServiceShell } from "@/components/services/service-shell";
import type { ServiceInterest } from "@/lib/leads";
import { SERVICE_INTERESTS } from "@/lib/leads";

export const metadata: Metadata = {
  title: "Talk to us about your team",
  description: "Workshops, advisory, pilot sprints and training — tell us what you need.",
};

export default async function EnquiryPage({
  searchParams,
}: {
  searchParams: Promise<{ service?: string | string[] }>;
}) {
  const { service } = await searchParams;
  const preset = (Array.isArray(service) ? service[0] : service) as ServiceInterest | undefined;
  const defaultService =
    preset && (SERVICE_INTERESTS as readonly string[]).includes(preset) ? preset : undefined;
  return (
    <ServiceShell
      eyebrow="Enquiries"
      title="Talk to us about your team"
      subtitle="Tell us what you're trying to do. We reply within one business day."
    >
      <EnquiryForm defaultService={defaultService} />
    </ServiceShell>
  );
}
```

- [ ] **Step 4:** Dev check: `/enquiry?service=workshop` preselects the workshop option; submitting creates a lead (check server log). `pnpm typecheck && pnpm lint`.
- [ ] **Step 5:** Commit `feat: enquiry page and marketing shell`.

### Task 3.2: Workshops, advisory, pilot-sprint pages

**Files:**
- Create: `src/components/services/service-detail.tsx`
- Create: `src/app/(marketing)/services/workshops/page.tsx`
- Create: `src/app/(marketing)/services/advisory/page.tsx`
- Create: `src/app/(marketing)/services/pilot-sprint/page.tsx`

**Interfaces:**
- Consumes: `ServiceShell` (3.1).
- Produces: `<ServiceDetail spec: ServiceSpec>` where:

```ts
export interface ServiceSpec {
  eyebrow: string;
  title: string;
  subtitle: string;
  price: string;          // e.g. "$12–25k per engagement"
  audience: string;
  outcome: string;        // the defined outcome — required by the action plan
  format: string[];       // bullet list
  enquiryService: string; // service_interest value for the CTA link
}
```

- [ ] **Step 1:** Build `ServiceDetail`: hero (eyebrow/title/subtitle), a three-cell fact band (Price / Audience / Outcome), "How it runs" bullet list, CTA button `Start the conversation` → `/enquiry?service={enquiryService}`.
- [ ] **Step 2:** Three thin pages passing specs, each with `export const metadata`. Content (verbatim price bands from the action plan):
  - **Workshops** — price `$12–25k per engagement`; audience `L&D, HR and innovation leads`; outcome `A team that uses AI competently and can say why — with aggregate evidence of who has been trained and on what.`; format bullets: `AI literacy, responsible AI, or digital transformation — scoped to your industry`, `Half-day to two-day formats, on site or remote`, `Built and delivered by two AI PhDs, not a slide pack`, `Every session ends with an agreed next step, not a feedback form`.
  - **Advisory** — price `$20–60k`; audience `Executives, CTOs and transformation leads`; outcome `Decisions made: what to build, what to buy, what to ignore — with a defensible rationale.`; bullets: `Fixed-scope engagements, not open-ended retainers`, `Direct access to the founders — no delivery team between you and the answer`, `Covers strategy, vendor choice, responsible-AI posture and capability build`, `Outcome priced, never time-and-materials`.
  - **Pilot Sprint** — price `$25–40k fixed`; audience `CTOs and product owners`; outcome `A working pilot in production-adjacent shape, in 2–4 weeks, with a written go/no-go recommendation.`; bullets: `Fixed scope agreed up front, change-controlled`, `2–4 weeks, end to end`, `You keep the code and the findings`, `Priced on the outcome, not the hours`.
- [ ] **Step 3:** Dev check all three routes render; CTA links carry the right `?service=`. `pnpm typecheck && pnpm lint`.
- [ ] **Step 4:** Commit `feat: workshop, advisory and pilot sprint pages`.

### Task 3.3: 1:1 training page with Cal.com

**Files:**
- Create: `src/app/(marketing)/services/training/page.tsx`
- Create: `src/components/services/booking-embed.tsx` (client)
- Modify: `.env.example` (`NEXT_PUBLIC_CALCOM_HANDLE`)

- [ ] **Step 1:** `BookingEmbed` (client): reads `process.env.NEXT_PUBLIC_CALCOM_HANDLE`. When set, renders `<iframe src={"https://cal.com/" + handle} title="Book a session" className="h-[640px] w-full rounded-card border border-line" loading="lazy" />`. When unset, renders a bordered panel: `Booking opens soon.` + link `Enquire about training` → `/enquiry?service=training`.
- [ ] **Step 2:** Training page inside `ServiceShell`, sections in order:
  1. **Rate ladder** table (4 rows verbatim): Students & individual learners `$90–120/hr` · Professionals upskilling `$150–220/hr` · Senior engineers & tech leads `$250–350/hr` · Executive 1:1 briefing `$350+/hr`.
  2. **Tracks** — 7 cards, each with outcome, prerequisite level, session count (sold as packages of 1–5 sessions, payment upfront): AI Foundations (none, 2), Prompt Engineering (AI Foundations or equivalent, 2), Python for AI (basic programming, 4), Building with LLM APIs (Python, 4), Agentic Workflows (LLM APIs, 3), Software Development Fundamentals (none, 5), Cloud & AWS Basics (software fundamentals, 3).
  3. **How booking works** — bullets: `Packages, not loose hours — booked and paid upfront`, `24-hour cancellation notice, otherwise the session is forfeited`, `Limited weekly slots — capped deliberately`, `Booking for a team? That's a workshop — tell us here` (link `/enquiry?service=workshop`).
  4. `<BookingEmbed />`.
- [ ] **Step 3:** Add `NEXT_PUBLIC_CALCOM_HANDLE=` to `.env.example` with comment `# your cal.com username — booking embed hides until set`.
- [ ] **Step 4:** Dev check `/services/training`; embed placeholder panel shows (handle unset). `pnpm typecheck && pnpm lint`. Confirm the **homepage** still has no "course": `bash scripts/verify-live.sh` copy section, or `curl -s localhost:3000 | grep -ci course` → `0`.
- [ ] **Step 5:** Commit `feat: 1:1 training page with Cal.com embed`.

---

## Phase 4 — AI updates rail

### Task 4.1: Latest-updates rail on the landing page

**Files:**
- Modify: `src/lib/public-content.ts` (add `latestUpdates`)
- Modify: `src/components/marketing-sections.tsx` (new section)
- Modify: `src/app/page.tsx` (render it)

**Interfaces:**
- Produces: `latestUpdates(limit: number)` — published, non-deleted `topics` where `type = 'article'`, newest `published_at` first, same return shape as the existing `newestTopics()` (copy its select list exactly).

- [ ] **Step 1:** Implement `latestUpdates` next to `newestTopics` in `public-content.ts` — identical query plus `eq(topics.type, "article")`.
- [ ] **Step 2:** In `marketing-sections.tsx` add `LatestUpdates` server component: heading `Latest in AI`, sub `Short, human-reviewed updates — what changed and why it matters.`, renders the same card rail as the other `ContentRail` sections. Return `null` when the list is empty (no empty-state on the landing page).
- [ ] **Step 3:** Render `<LatestUpdates />` on `/` between DiscoverySections and BrowseTopics.
- [ ] **Step 4:** Dev check: seed has articles? If `latestUpdates` returns nothing, section is absent — verify by creating one article in `/admin/content/new`, publish, confirm it appears on `/`.
- [ ] **Step 5:** `pnpm typecheck && pnpm lint && pnpm test`. Commit `feat: latest-in-AI rail on landing page`.

### Task 4.2: Updates tab in the feed

**Files:**
- Modify: `src/app/api/v1/feed/route.ts` (accept `tab=updates`)
- Modify: `src/components/feed-view.tsx` (third tab)

- [ ] **Step 1:** Read the feed route. Extend its query schema so `tab` accepts `updates` alongside `for_you`/`everything`. For `updates`: same pagination contract, filter `eq(topics.type, "article")`, no category filter, no backfill block.
- [ ] **Step 2:** In `feed-view.tsx` add tab `Updates` (key `updates`) to the existing tab control; it hides the category chips while active (articles aren't category-filtered here).
- [ ] **Step 3:** Dev check: `/feed` shows three tabs; Updates lists only articles; cursor "Load more" works.
- [ ] **Step 4:** `pnpm typecheck && pnpm lint`. Commit `feat: updates tab in feed`.

---

## Phase 5 — Admin leads, warm orgs, the metric

### Task 5.1: Admin leads API

**Files:**
- Create: `src/app/api/v1/admin/leads/route.ts` (GET list)
- Create: `src/app/api/v1/admin/leads/[id]/route.ts` (PATCH)
- Create: `src/app/api/v1/admin/leads/metrics/route.ts` (GET)

**Interfaces:**
- Consumes: `requireAdmin()` from `@/lib/auth/session`, `leadPatchSchema` (2.2), cursor helpers from `@/lib/api`.
- Produces:
  - `GET /api/v1/admin/leads?status=&limit=&cursor=` → `{ data: Lead[], next_cursor }` — Lead serialised snake_case: `id, name, email, org_domain, org_name, service_interest, team_size, message, is_team, source, status, notes, qualified_at, created_at`.
  - `PATCH /api/v1/admin/leads/:id` body `{ status?, notes? }` → updated lead. First transition to `qualified` stamps `qualified_at` once (never overwritten).
  - `GET /api/v1/admin/leads/metrics` → `{ by_status: Record<string, number>, qualified_by_month: [{ month: "YYYY-MM", count: number }] }` (last 6 months from `qualified_at`).

- [ ] **Step 1:** List route — follow the keyset pagination pattern of `GET /api/v1/topics` (`(created_at, id)` descending). Optional `status` filter validated by `z.enum`.
- [ ] **Step 2:** PATCH route (Next 16: `ctx.params` is a Promise — copy the signature style from `src/app/api/v1/admin/coupons/[id]/route.ts`):

```ts
export const PATCH = handler(
  async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const admin = await requireAdmin();
    const { id } = await ctx.params;
    const body = await parseBody(req, leadPatchSchema);

    const existing = await db.query.leads.findFirst({ where: eq(leads.id, id) });
    if (!existing) throw new ApiError("NOT_FOUND", "Lead not found.");

    const [updated] = await db
      .update(leads)
      .set({
        ...(body.status ? { status: body.status } : {}),
        ...(body.notes !== undefined ? { notes: body.notes } : {}),
        ...(body.status === "qualified" && !existing.qualifiedAt
          ? { qualifiedAt: new Date() }
          : {}),
        updatedAt: new Date(),
      })
      .where(eq(leads.id, id))
      .returning();

    await audit({
      actorId: admin.id,
      action: "lead.updated",
      entityType: "lead",
      entityId: id,
      metadata: { status: body.status ?? existing.status },
    });
    return ok(serialiseLead(updated!));
  },
);
```

(Put `serialiseLead` in `src/lib/leads-serialise.ts` or co-locate in the list route and import — one definition, used by both routes.)

- [ ] **Step 3:** Metrics route — remember the postgres.js rule from `src/db/queries/analytics.ts:37-42`: bind dates as `.toISOString()` + `::timestamptz`. Months via `to_char(date_trunc('month', qualified_at), 'YYYY-MM')`, grouped, last 6 months, plus a `group by status` count.
- [ ] **Step 4:** Verify with curl (admin cookie via the seeded admin — see `scripts/audit.sh` for the sign-in pattern): list, patch status to `qualified` (response has `qualified_at` set), patch again to `contacted` then back to `qualified` (`qualified_at` unchanged), metrics reflects one qualified lead this month.
- [ ] **Step 5:** `pnpm typecheck && pnpm lint && pnpm test`. Commit `feat: admin leads API with qualified-conversation metric`.

### Task 5.2: Admin leads screen + warm organisations

**Files:**
- Create: `src/components/admin/leads-view.tsx`
- Create: `src/app/admin/leads/page.tsx`
- Modify: `src/components/admin/admin-sidebar.tsx` (Growth group)

**Interfaces:**
- Consumes: Task 5.1 endpoints; existing `GET /api/v1/admin/analytics/organizations` (see `analytics-view.tsx` for its response shape); primitives from `admin-ui.tsx`; icon `Inbox` from `lucide-react`.

- [ ] **Step 1:** `leads-view.tsx` (client), modelled on `coupons-view.tsx`:
  - Header KPI row (3 cards, same card component as analytics): **Qualified this month** (from metrics — the number the plan says decides everything), **Open leads** (`new` + `contacted`), **Team enquiries** (`is_team` count from list).
  - Filters: status select (All / New / Contacted / Qualified / Converted / Closed).
  - Table rows: created date, name + email (mailto link), org (name or domain, with a `TEAM` badge when `is_team`), service, status `<select>` (PATCHes immediately, optimistic with rollback like `notifications-view.tsx`), expandable message + notes textarea with a Save button.
  - Below the table, **Warm organisations** panel: fetches `admin/analytics/organizations`, sorts by `active_7d` descending, shows top 10 with member/active counts; suppressed rows render the existing `Suppressed` treatment. Caption: `Aggregate engagement only — flag for outreach, then judge by hand.`
- [ ] **Step 2:** `src/app/admin/leads/page.tsx` — copy the structure of `src/app/admin/coupons/page.tsx` (title `Leads`, renders the view).
- [ ] **Step 3:** Sidebar Growth group becomes:

```ts
{
  label: "Growth",
  items: [
    { href: "/admin/leads", label: "Leads", icon: Inbox },
    { href: "/admin/coupons", label: "Coupons", icon: Ticket },
  ],
},
```

- [ ] **Step 4:** Dev check as admin: `/admin/leads` lists the curl-created leads; changing status persists on reload; KPI updates.
- [ ] **Step 5:** `pnpm typecheck && pnpm lint`. Commit `feat: admin leads screen with warm-organisation panel`.

---

## Phase 6 — Content-drafts review queue

### Task 6.1: Draft ingestion endpoint (for the external agent pipeline)

**Files:**
- Create: `src/app/api/v1/ingest/drafts/route.ts`
- Modify: `src/lib/config.ts` (add `drafts.ingestToken`)
- Modify: `.env.example` (`DRAFT_INGEST_TOKEN`)

**Interfaces:**
- Consumes: `contentDrafts` table (already in `src/db/schema.ts:971`).
- Produces: `POST /api/v1/ingest/drafts`, bearer-token auth, body `{ draft_type, title, body: { markdown: string }, source_refs?: {url: string, title?: string}[], target_topic_id? }` → `201 { id }`. `501 NOT_CONFIGURED` when no token is set.

- [ ] **Step 1:** Config: `drafts: { ingestToken: str("DRAFT_INGEST_TOKEN") }`. `.env.example`: `DRAFT_INGEST_TOKEN=` with comment `# bearer token for the external drafting agents; ingestion is 501 until set`.
- [ ] **Step 2:** Route:

```ts
import { z } from "zod";
import { db } from "@/db";
import { contentDrafts } from "@/db/schema";
import { ApiError, clientIp, handler, ok, parseBody, rateLimit } from "@/lib/api";
import { audit } from "@/lib/audit";
import { config } from "@/lib/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ingestSchema = z.object({
  draft_type: z.enum(["script", "shot_list", "news_post", "social_post"]),
  title: z.string().trim().min(3).max(200),
  body: z.object({ markdown: z.string().min(1).max(50_000) }),
  source_refs: z
    .array(z.object({ url: z.url(), title: z.string().max(300).optional() }))
    .max(20)
    .optional(),
  target_topic_id: z.uuid().optional(),
});

/**
 * POST /api/v1/ingest/drafts — the write side of the human review gate
 * (SERVICES_ACTION_PLAN §4). External agents draft; nothing publishes
 * without a founder decision in /admin/drafts.
 */
export const POST = handler(async (req: Request) => {
  if (!config.drafts.ingestToken) {
    throw new ApiError("NOT_CONFIGURED", "Draft ingestion is not configured.");
  }
  if (req.headers.get("authorization") !== `Bearer ${config.drafts.ingestToken}`) {
    throw new ApiError("UNAUTHENTICATED", "Invalid ingest token.");
  }
  rateLimit(`ingest-ip:${clientIp(req)}`, 30, 60_000);

  const body = await parseBody(req, ingestSchema);
  const [draft] = await db
    .insert(contentDrafts)
    .values({
      draftType: body.draft_type,
      title: body.title,
      body: body.body,
      sourceRefs: body.source_refs ?? null,
      targetTopicId: body.target_topic_id ?? null,
    })
    .returning({ id: contentDrafts.id });

  await audit({
    action: "content_draft.ingested",
    entityType: "content_draft",
    entityId: draft!.id,
    metadata: { draft_type: body.draft_type },
  });
  return ok({ id: draft!.id }, 201);
});
```

- [ ] **Step 3:** Verify: without env → `501`; with `DRAFT_INGEST_TOKEN=test-token` in `.env.local` and header `Authorization: Bearer test-token` → `201`; wrong token → `401`.
- [ ] **Step 4:** `pnpm typecheck && pnpm lint`. Commit `feat: draft ingestion endpoint for external agents`.

### Task 6.2: Admin drafts API (review + promote)

**Files:**
- Create: `src/app/api/v1/admin/drafts/route.ts` (GET list)
- Create: `src/app/api/v1/admin/drafts/[id]/review/route.ts` (POST approve/reject)
- Create: `src/app/api/v1/admin/drafts/[id]/promote/route.ts` (POST → draft article topic)

**Interfaces:**
- Produces:
  - `GET /api/v1/admin/drafts?status=` → `{ data: [...] }` serialised snake_case (`id, draft_type, title, body, source_refs, status, review_notes, reviewed_at, target_topic_id, created_at`), newest first, status filter defaults `pending_review`.
  - `POST .../review` body `{ action: "approve" | "reject", notes?: string }` → sets `status`, `reviewerId`, `reviewNotes`, `reviewedAt`. Only from `pending_review` (else `409 CONFLICT`).
  - `POST .../promote` (only `draft_type='news_post'`, only `status='approved'`) → creates a `topics` row: `type: "article"`, `status: "draft"`, `title`, `body: body.markdown`, slug = slugified title + `-` + 6-char nanoid, `authorId` = admin; stamps `targetTopicId` on the draft; returns `{ topic_id }`. The article then goes through the normal editor/publish gate.

- [ ] **Step 1:** Implement the three routes with `requireAdmin()`, `audit()` on review (`content_draft.approved` / `content_draft.rejected`) and promote (`content_draft.promoted`). For the promote insert, copy the topic-creation column set from `POST /api/v1/admin/topics` (read it first) so defaults (excerpt derivation, counters) match. Slugify: reuse the existing slug helper if `admin/topics` has one; otherwise lowercase, non-alphanumeric → `-`, trim `-`.
- [ ] **Step 2:** Verify by curl as admin: ingest a `news_post` (6.1), list shows it `pending_review`, approve it, promote it → topic id returned and visible in `/admin/content` as a draft article; approving again → `409`.
- [ ] **Step 3:** `pnpm typecheck && pnpm lint`. Commit `feat: admin draft review and promote API`.

### Task 6.3: Admin drafts screen

**Files:**
- Create: `src/components/admin/drafts-view.tsx`
- Create: `src/app/admin/drafts/page.tsx`
- Modify: `src/components/admin/admin-sidebar.tsx` (Content group)

- [ ] **Step 1:** `drafts-view.tsx` (client), modelled on `moderation-view.tsx`: status tabs (Pending / Approved / Rejected / Published), list rows showing type badge, title, age, source-ref links; expanding a row renders the markdown via `MarkdownBody` (`src/components/markdown-body.tsx`); actions per row: **Approve** / **Reject** (with optional notes input, uses `ConfirmDialog` for reject), and **Create article** on approved `news_post` rows (calls promote, then links to `/admin/topics/{topic_id}`). Empty pending state: `Nothing waiting for review. Drafts arrive here from the agent pipeline.`
- [ ] **Step 2:** Page `src/app/admin/drafts/page.tsx` (copy coupons page structure, title `Drafts`).
- [ ] **Step 3:** Sidebar Content group gains `{ href: "/admin/drafts", label: "Drafts", icon: ClipboardCheck }` (lucide `ClipboardCheck`).
- [ ] **Step 4:** Dev check the whole loop: ingest → review in UI → promote → edit article → publish → appears in `/feed` Updates tab and the landing `Latest in AI` rail. **This is the end-to-end acceptance test for Phases 4+6.**
- [ ] **Step 5:** `pnpm typecheck && pnpm lint && pnpm test`. Commit `feat: admin drafts review queue UI`.

---

## Phase 7 — Housekeeping fixes

### Task 7.1: Stripe redirect 404 + dead middleware routes

**Files:**
- Modify: `src/app/api/v1/billing/checkout/route.ts:69-70`
- Modify: `src/middleware.ts:18`
- Modify: `scripts/verify-live.sh` (the `/catalogue` check)

- [ ] **Step 1:** Checkout URLs → pages that exist: `success_url: \`${config.appUrl}/settings?checkout=success#subscription\``, `cancel_url: \`${config.appUrl}/settings?checkout=cancelled#subscription\``.
- [ ] **Step 2:** Remove `"/dashboard"` and `"/catalogue"` from the middleware `PROTECTED` list.
- [ ] **Step 3:** In `verify-live.sh`, replace the `/catalogue` check with the same check against `/feed` (200-or-auth-redirect).
- [ ] **Step 4:** `pnpm typecheck && pnpm lint`. Commit `fix: checkout redirect targets and dead protected routes`.

### Task 7.2: Scheduled topics actually publish

**Files:**
- Modify: `src/lib/topics.ts` (add `promoteDueScheduledTopics`)
- Modify: `src/app/api/v1/topics/route.ts` and `src/app/api/v1/feed/route.ts` (call it)

**Interfaces:**
- Produces: `promoteDueScheduledTopics(): Promise<void>` — lazy promotion; there is no cron in this deployment (App Runner), so due topics flip on the next catalogue read.

- [ ] **Step 1:** In `topics.ts`:

```ts
/**
 * Lazily flip due 'scheduled' topics to 'published'. There is no cron in this
 * deployment, so the two catalogue read paths call this; the cost is one
 * indexed UPDATE that usually matches zero rows (topics_scheduled_idx).
 */
export async function promoteDueScheduledTopics(): Promise<void> {
  try {
    await db
      .update(topics)
      .set({ status: "published", publishedAt: sql`coalesce(${topics.publishAt}, now())` })
      .where(and(eq(topics.status, "scheduled"), sql`${topics.publishAt} <= now()`));
  } catch (err) {
    // Promotion must never break a read path.
    console.error("[topics] scheduled promotion failed", err);
  }
}
```

- [ ] **Step 2:** `await promoteDueScheduledTopics();` at the top of `GET /api/v1/topics` and `GET /api/v1/feed`.
- [ ] **Step 3:** Verify: schedule a topic 1 minute out in admin, wait, hit `/api/v1/topics` — it appears and its status in `/admin/content` is `published`.
- [ ] **Step 4:** `pnpm typecheck && pnpm lint && pnpm test`. Commit `fix: lazy promotion of scheduled topics`.

### Task 7.3: Legal placeholder contacts

**Files:**
- Modify: `src/app/(marketing)/privacy/page.tsx` (~L159-161)
- Modify: `src/app/(marketing)/terms/page.tsx` (~L136-137)

- [ ] **Step 1:** Replace `[privacy contact to be confirmed]`, `[company address to be confirmed]`, `[legal contact to be confirmed]` with: `the enquiry form at /enquiry` (as an actual `<Link href="/enquiry">`) — do not invent postal addresses or mailboxes; flag remaining address gaps in the final report to the user.
- [ ] **Step 2:** `pnpm typecheck && pnpm lint`. Commit `fix: legal pages point to the enquiry form`.

### Task 7.4: Full verification pass

- [ ] **Step 1:** `pnpm typecheck && pnpm lint && pnpm test` — all green.
- [ ] **Step 2:** With the dev server + seeded DB: run `bash scripts/audit.sh`. Expected change: the paywall section (§8) now shows the free account **can** access paid topics (free platform). All other sections pass. If the script hard-fails on that expectation, update its §8 assertion to expect access when `FEATURE_FREE_PLATFORM=true` and note it in the commit.
- [ ] **Step 3:** Manual click-through: `/` → services section → each service page → enquiry submit → `/admin/leads` shows it; ingest→review→promote→publish→Updates tab loop.
- [ ] **Step 4:** Commit any audit-script adjustment: `test: audit expectations for free platform`.

---

## Explicitly out of scope (per the action plan or user decision)

- Building a booking system (plan §3: "do not build this" — Cal.com embed only).
- Marketing email / SES wiring, consent audit, segments (blocked on the consent audit — calendar work, not code; `src/lib/email.ts` already isolates transactional sends).
- HeyGen, transcription, trend-scanning agents (external pipeline; this repo only hosts the ingest endpoint + review gate).
- Quizzes UI (advertised but unbuilt — separate decision; not part of the services plan).
- Removing Stripe (kept dormant behind `FEATURE_BILLING`/`FEATURE_FREE_PLATFORM` per user decision).

## Self-review notes

- Spec coverage: plan §1 services 4/5/6 → Task 3.2; service 2 → 3.3; free platform → Phase 1; §3 booking ops → 3.3 (embed, upfront-payment note, cancellation policy, org routing); §4 automation gate → Phase 6; §5 Day-1-30 actions (landing pages, enquiry route, booking, platform) → Phases 1–3; §7 metric → 5.1/5.2. Daily-effort items (§2) and consent audit (§6) are founder/calendar work, listed out of scope.
- Type consistency: `ServiceInterest`/`SERVICE_INTERESTS` defined once in `src/lib/leads.ts`, consumed by schemas (2.2), enquiry page (3.1); `serialiseLead` single definition (5.1); `classifyEnquiry` signature identical in test and implementation.
