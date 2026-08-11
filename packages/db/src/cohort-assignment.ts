// T05 — Cohort assignment on signup. LEARN_AI_V1_BUILD_SPEC.md §4.1.
//
// This is the DB-aware controller layer on top of @learn-ai/cohort's pure
// functions (T04): it does the find-or-create against `organisations` /
// `organisation_domains`, looks up the `free_mail_domains` /
// `disposable_domains` / `known_institutions` seed tables, and is the only
// place in the codebase allowed to run §4.1 end to end.
//
// NON-NEGOTIABLE (§4): this runs on every signup, must be synchronous, and
// must NEVER fail the signup. `assignCohort` therefore never throws — any
// unexpected error (DB unavailable, an unexpected constraint violation,
// etc.) is caught internally, logged with context, and resolved as
// `{ organisationId: null, cohortTrack: 'individual' }`. The one outcome
// that is NOT a thrown error is `rejected: 'disposable'` — that is a normal
// return value, and it is the caller's job (the signup route) to turn it
// into the spec's 422 "Please use a permanent email address" response
// *before* the user row is inserted.
//
// DEVIATION FROM §4.1 (founder-overridable, documented per the T05
// controller brief): the spec's step 3 says "reduce host to registrable
// domain using the Public Suffix List" and only afterwards (step 6) does it
// consult a known-institutions mapping to name the organisation. T04 found
// a wrinkle in that ordering (see .superpowers/sdd/progress.md, T04 entry):
// the real PSL's `gov.au` entry is a *plain* (non-wildcard) suffix, so
// `health.nsw.gov.au` and `education.nsw.gov.au` both reduce to the SAME
// registrable domain, `nsw.gov.au` — the spec's own §4.1 seed table lists
// them as two distinct organisations, which the plain registrable-domain
// algorithm can never produce.
//
// We resolve this here, before step 3, by checking `known_institutions` for
// the LONGEST matching suffix of the full (unreduced) host. `mail.health.
// nsw.gov.au` matches the `health.nsw.gov.au` row (host === row.domain or
// host ends with `.<row.domain>`); `admin.education.nsw.gov.au` matches the
// `education.nsw.gov.au` row. Whichever row matches supplies the
// organisation's domain/name/kind directly — the PSL registrable-domain
// reduction, deriveName fallback, and inferKind never run for that signup.
// A host that doesn't match any known_institutions row falls through to the
// unmodified §4.1 steps 3-6 via `classifyEmail`. Known-institution matches
// are NOT flagged `auto_created` (the name is already authoritative, so
// there is nothing for Vala's rename queue to fix) — that flag is reserved
// for the deriveName fallback path, exactly as the spec's own prose
// describes ("auto-created organisations WITH DERIVED NAMES are flagged").
import { classifyEmail, normaliseEmail } from "@learn-ai/cohort";
// Extensionless specifier deliberately (see the same note in index.ts):
// apps/web's Turbopack build now reaches this file through
// index.ts -> cohort-assignment.ts -> client, and Turbopack's resolver for
// a bundled-by-source workspace package only resolves the extensionless
// form for this hop, the same way it does for index.ts's own re-exports.
import { getPool, newId } from "./client";
import type { Pool } from "pg";

export interface CohortAssignment {
  organisationId: string | null;
  cohortTrack: "organisation" | "individual";
  /** Set only when §4.1 step 5 fires: the caller must reject the signup. */
  rejected?: "disposable";
}

interface KnownInstitutionRow {
  domain: string;
  name: string;
  kind: string;
}

const PG_UNIQUE_VIOLATION = "23505";
const MAX_SLUG_ATTEMPTS = 25;

function isUniqueViolation(error: unknown, constraint: string): boolean {
  if (!error || typeof error !== "object") return false;
  const err = error as { code?: string; constraint?: string };
  return err.code === PG_UNIQUE_VIOLATION && err.constraint === constraint;
}

/**
 * §4.1 slug generation: `slugify(name)`, deduplicated. Deliberately
 * minimal — this package has no other slugify need, so a small local
 * helper beats pulling in a dependency for one call site.
 */
function slugify(name: string): string {
  const base = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "") // strip combining diacritics
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base.length > 0 ? base : "org";
}

async function loadDomainList(
  pool: Pool,
  table: "free_mail_domains" | "disposable_domains",
): Promise<string[]> {
  const { rows } = await pool.query<{ domain: string }>(`SELECT domain FROM ${table}`);
  return rows.map((row) => row.domain);
}

/**
 * The known-institutions longest-suffix match described in this file's
 * header comment. `known_institutions` has ~10 rows at V1 scale, so a full
 * scan per signup is simpler and fast enough — no caching needed.
 */
async function findKnownInstitutionForHost(
  pool: Pool,
  host: string,
): Promise<KnownInstitutionRow | null> {
  const { rows } = await pool.query<KnownInstitutionRow>(
    `SELECT domain, name, kind FROM known_institutions`,
  );

  let best: KnownInstitutionRow | null = null;
  for (const row of rows) {
    const matches = host === row.domain || host.endsWith(`.${row.domain}`);
    if (matches && (!best || row.domain.length > best.domain.length)) {
      best = row;
    }
  }
  return best;
}

/**
 * Insert a new `organisations` row, retrying the slug on a genuine slug
 * collision (a different organisation already has that slug) and falling
 * back to the existing row on a `primary_domain` collision (two concurrent
 * signups from the same brand-new domain — see `findOrCreateOrganisation`).
 */
async function insertOrganisation(
  pool: Pool,
  name: string,
  primaryDomain: string,
  kind: string,
  autoCreated: boolean,
): Promise<string> {
  const baseSlug = slugify(name);

  for (let attempt = 1; attempt <= MAX_SLUG_ATTEMPTS; attempt += 1) {
    const candidateSlug = attempt === 1 ? baseSlug : `${baseSlug}-${attempt}`;
    try {
      const { rows } = await pool.query<{ id: string }>(
        `INSERT INTO organisations (id, name, slug, primary_domain, kind, auto_created)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (primary_domain) DO NOTHING
           RETURNING id`,
        [newId(), name, candidateSlug, primaryDomain, kind, autoCreated],
      );
      if (rows[0]) {
        return rows[0].id;
      }

      // ON CONFLICT (primary_domain) DO NOTHING fired: we lost a race to
      // create this domain's organisation. The winner's row is committed by
      // the time our INSERT statement returns (Postgres's unique-index
      // insertion lock guarantees this even without an explicit
      // transaction), so a plain SELECT is safe here.
      const existing = await pool.query<{ id: string }>(
        `SELECT id FROM organisations WHERE primary_domain = $1`,
        [primaryDomain],
      );
      if (existing.rows[0]) {
        return existing.rows[0].id;
      }
      // Vanishingly unlikely (the row was deleted between the conflict and
      // our re-select) — loop and try again rather than throw.
      continue;
    } catch (error) {
      if (isUniqueViolation(error, "organisations_slug_key")) {
        // A different organisation already has this slug — try the next
        // dedupe suffix.
        continue;
      }
      if (isUniqueViolation(error, "organisations_primary_domain_key")) {
        // Defensive: in case a genuine constraint violation is raised here
        // instead of being absorbed by ON CONFLICT DO NOTHING, treat it the
        // same way — re-select the winner's row.
        const existing = await pool.query<{ id: string }>(
          `SELECT id FROM organisations WHERE primary_domain = $1`,
          [primaryDomain],
        );
        if (existing.rows[0]) {
          return existing.rows[0].id;
        }
      }
      throw error;
    }
  }

  throw new Error(
    `Could not allocate a unique slug for organisation "${name}" after ${String(MAX_SLUG_ATTEMPTS)} attempts.`,
  );
}

async function ensureOrganisationDomain(
  pool: Pool,
  organisationId: string,
  domain: string,
): Promise<void> {
  await pool.query(
    `INSERT INTO organisation_domains (id, organisation_id, domain)
       VALUES ($1, $2, $3)
       ON CONFLICT (domain) DO NOTHING`,
    [newId(), organisationId, domain],
  );
}

/**
 * §4.1 step 6, concurrency-safe: two simultaneous signups from the same
 * brand-new domain must create exactly ONE organisation. The fast path
 * (existing `organisation_domains` row) covers the common case; the slow
 * path handles the race via `insertOrganisation`'s ON CONFLICT handling.
 */
async function findOrCreateOrganisation(
  pool: Pool,
  domain: string,
  name: string,
  kind: string,
  autoCreated: boolean,
): Promise<string> {
  const existing = await pool.query<{ organisation_id: string }>(
    `SELECT organisation_id FROM organisation_domains WHERE domain = $1`,
    [domain],
  );
  if (existing.rows[0]) {
    return existing.rows[0].organisation_id;
  }

  const organisationId = await insertOrganisation(pool, name, domain, kind, autoCreated);
  await ensureOrganisationDomain(pool, organisationId, domain);
  return organisationId;
}

/**
 * §4.1 end to end, plus the known-institutions longest-suffix deviation
 * documented above. Never throws — see this file's header comment.
 */
export async function assignCohort(rawEmail: string): Promise<CohortAssignment> {
  try {
    const pool = getPool();

    // Known-institutions longest-suffix match runs on the full host,
    // BEFORE §4.1 step 3's registrable-domain reduction (the T05 deviation
    // documented at the top of this file).
    const normalised = normaliseEmail(rawEmail);
    if (normalised) {
      const host = normalised.slice(normalised.lastIndexOf("@") + 1);
      const institution = await findKnownInstitutionForHost(pool, host);
      if (institution) {
        const organisationId = await findOrCreateOrganisation(
          pool,
          institution.domain,
          institution.name,
          institution.kind,
          false, // authoritative name — not a candidate for the auto_created rename queue
        );
        return { organisationId, cohortTrack: "organisation" };
      }
    }

    // No known-institution match: fall through to the unmodified §4.1
    // steps 1/3/4/5/6 via T04's pure classifier.
    const [freeMailDomains, disposableDomains] = await Promise.all([
      loadDomainList(pool, "free_mail_domains"),
      loadDomainList(pool, "disposable_domains"),
    ]);
    const result = classifyEmail(rawEmail, { freeMailDomains, disposableDomains });

    switch (result.outcome) {
      case "invalid":
        // The auth provider validates email shape before ever calling
        // assignCohort, so this should be unreachable in practice. Fail
        // safe rather than reject here — never blocking signup wins.
        return { organisationId: null, cohortTrack: "individual" };

      case "free_mail":
        return { organisationId: null, cohortTrack: "individual" };

      case "disposable":
        return { organisationId: null, cohortTrack: "individual", rejected: "disposable" };

      case "organisation": {
        const organisationId = await findOrCreateOrganisation(
          pool,
          result.domain,
          result.derivedName,
          result.kind,
          true, // §4.1 step 6: auto_created = TRUE for the deriveName fallback path
        );
        return { organisationId, cohortTrack: "organisation" };
      }
    }
  } catch (error) {
    // NON-NEGOTIABLE (§4): cohort assignment must never fail a signup.
    // eslint-disable-next-line no-console
    console.error("Cohort assignment failed; defaulting to individual track.", {
      email: rawEmail,
      error,
    });
    return { organisationId: null, cohortTrack: "individual" };
  }
}
