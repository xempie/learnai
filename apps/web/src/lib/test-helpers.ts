import { encode } from "next-auth/jwt";
import { NextRequest } from "next/server";
import { newId, type Pool } from "@learn-ai/db";

/**
 * Shared scaffolding for T06's DB-backed route-handler tests (§4.2 cohort
 * page, claim flow, admin rename queue). Deliberately named `test-helpers.ts`
 * to match `packages/db/src/__tests__/test-helpers.ts` — this file is never
 * imported by application code, only by `*.test.ts` files under
 * `app/api/v1/org` and `app/api/v1/admin`. It does not itself match the
 * project's `*.test.ts`/`*.spec.ts` vitest glob, so it is never run as a
 * suite on its own.
 */

// Matches @auth/core/jwt's defaultCookies().sessionToken.name for a
// non-secure (http) deployment — same constant as
// apps/web/src/lib/auth/provider.integration.test.ts.
const SESSION_COOKIE_NAME = "authjs.session-token";

/**
 * Deliberately narrower than the DOM `RequestInit` (only the fields these
 * tests actually pass): spreading a full `RequestInit` into `NextRequest`'s
 * constructor options trips a `signal: AbortSignal | null` vs `| undefined`
 * mismatch between lib.dom.d.ts's `RequestInit` and Next's own narrower
 * one. Building the object from named fields sidesteps that entirely.
 */
export interface SessionRequestInit {
  method?: string;
  body?: BodyInit;
  headers?: Record<string, string>;
}

/** A signed-in NextRequest for `userId`, reusable across GET/POST/PATCH tests. */
export async function sessionRequestFor(
  userId: string,
  url: string,
  init: SessionRequestInit = {},
): Promise<NextRequest> {
  const token = await encode({
    secret: process.env.AUTH_SECRET ?? "integration-test-secret",
    salt: SESSION_COOKIE_NAME,
    token: { sub: userId },
  });
  return new NextRequest(url, {
    method: init.method,
    body: init.body,
    headers: { ...(init.headers ?? {}), cookie: `${SESSION_COOKIE_NAME}=${token}` },
  });
}

export interface TestOrganisationOverrides {
  name: string;
  slug: string;
  primaryDomain: string;
  claimedBy: string | null;
  autoCreated: boolean;
}

/** Inserts an `organisations` row directly, bypassing §4.1 assignment (T05 already covers that path). */
export async function insertTestOrganisation(
  pool: Pool,
  overrides: Partial<TestOrganisationOverrides> = {},
): Promise<{ id: string; slug: string }> {
  const id = newId();
  const suffix = newId();
  const name = overrides.name ?? `Test Org ${suffix}`;
  const slug = overrides.slug ?? `test-org-${suffix}`;
  const primaryDomain = overrides.primaryDomain ?? `${suffix}.example.test`;
  const claimedBy = overrides.claimedBy ?? null;
  const autoCreated = overrides.autoCreated ?? true;

  await pool.query(
    `INSERT INTO organisations (id, name, slug, primary_domain, kind, auto_created, claimed_by)
       VALUES ($1, $2, $3, $4, 'corporate', $5, $6)`,
    [id, name, slug, primaryDomain, autoCreated, claimedBy],
  );
  return { id, slug };
}

export interface TestUserOverrides {
  email: string;
  organisationId: string | null;
  role: "member" | "reviewer" | "admin";
  displayName: string | null;
  showInCohort: boolean;
  verified: boolean;
}

/** Inserts a `users` row directly, with sane member defaults (verified, role='member', visible in cohort). */
export async function insertTestUser(
  pool: Pool,
  overrides: Partial<TestUserOverrides> = {},
): Promise<string> {
  const id = newId();
  const email = overrides.email ?? `user-${id}@example.test`;
  const emailDomain = email.split("@")[1] ?? "example.test";
  const organisationId = overrides.organisationId ?? null;
  const role = overrides.role ?? "member";
  const displayName = overrides.displayName ?? null;
  const showInCohort = overrides.showInCohort ?? true;
  const verified = overrides.verified ?? true;

  await pool.query(
    `INSERT INTO users
       (id, email, email_domain, role, cohort_track, organisation_id, display_name,
        show_in_cohort, email_verified_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, ${verified ? "now()" : "NULL"})`,
    [
      id,
      email,
      emailDomain,
      role,
      organisationId ? "organisation" : "individual",
      organisationId,
      displayName,
      showInCohort,
    ],
  );
  return id;
}

/** Inserts a `streaks` row for `userId` with the given current streak. */
export async function insertTestStreak(
  pool: Pool,
  userId: string,
  currentStreak: number,
): Promise<void> {
  await pool.query(
    `INSERT INTO streaks (user_id, current_streak, longest_streak) VALUES ($1, $2, $2)`,
    [userId, currentStreak],
  );
}
