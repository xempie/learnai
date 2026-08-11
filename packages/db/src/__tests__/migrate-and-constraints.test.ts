import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getPool, newId } from "../client.js";
import { seed } from "../seed.js";
import { requireDatabaseUrl, runMigrate } from "./test-helpers.js";

// These tests need a real Postgres instance (see docker-compose.yml at the
// repo root: `pnpm db:up`). They are skipped — not failed — when
// DATABASE_URL is unset, per the T02 controller decision.
//
// NB: getPool() is only ever called lazily, inside hooks/tests below — never
// at describe-collection time. Vitest always invokes a describe() body to
// collect its children even when skipIf marks every child a no-op, so a
// top-level `getPool()` call would throw ("DATABASE_URL is not set") before
// the skip ever takes effect.
const databaseUrl = requireDatabaseUrl();

describe.skipIf(!databaseUrl)("migrations: up / down / up cycle", () => {
  beforeAll(() => {
    // Start from a clean slate regardless of what a previous run left
    // behind. Ignore failure — there may be nothing to tear down yet.
    try {
      runMigrate("down");
    } catch {
      /* no-op: nothing to tear down */
    }
  });

  it("migrate up creates the core tables and constraints", () => {
    runMigrate("up");
  });

  it("key tables exist after migrating up", async () => {
    const { rows } = await getPool().query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`,
    );
    const tableNames = new Set(rows.map((r) => r.table_name));
    for (const expected of [
      "organisations",
      "organisation_domains",
      "users",
      "user_preferences",
      "organisation_claims",
      "editions",
      "content_items",
      "prompts",
      "content_sources",
      "source_candidates",
      "reviews",
      "audit_log",
      "subscriptions",
      "suppression_list",
      "email_campaigns",
      "email_sends",
      "warmup_schedule",
      "agent_runs",
      "completions",
      "streaks",
      "free_mail_domains",
      "disposable_domains",
      "known_institutions",
      // T03 — Auth.js adapter + credentials tables.
      "accounts",
      "sessions",
      "verification_tokens",
      "auth_credentials",
    ]) {
      expect(tableNames.has(expected), `expected table ${expected} to exist`).toBe(true);
    }
  });

  it("T06: users.show_in_cohort exists, NOT NULL, defaulting to true", async () => {
    const { rows } = await getPool().query<{
      column_name: string;
      is_nullable: string;
      column_default: string | null;
    }>(
      `SELECT column_name, is_nullable, column_default
         FROM information_schema.columns
        WHERE table_name = 'users' AND column_name = 'show_in_cohort'`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.is_nullable).toBe("NO");
    expect(rows[0]?.column_default).toContain("true");
  });

  it("the review-gate CHECK constraints are present", async () => {
    const { rows } = await getPool().query<{ conname: string }>(
      `SELECT conname FROM pg_constraint WHERE conname IN ('published_needs_approval', 'news_needs_source')`,
    );
    const names = rows.map((r) => r.conname).sort();
    expect(names).toEqual(["news_needs_source", "published_needs_approval"]);
  });

  it("the three circular foreign keys were added via ALTER TABLE", async () => {
    const { rows } = await getPool().query<{ conname: string }>(
      `SELECT conname FROM pg_constraint WHERE conname IN (
         'organisations_claimed_by_fkey',
         'content_items_source_id_fkey',
         'content_items_agent_run_id_fkey'
       )`,
    );
    const names = rows.map((r) => r.conname).sort();
    expect(names).toEqual([
      "content_items_agent_run_id_fkey",
      "content_items_source_id_fkey",
      "organisations_claimed_by_fkey",
    ]);
  });

  it("migrate down drops everything cleanly", async () => {
    runMigrate("down");
    const { rows } = await getPool().query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
         AND table_name IN ('users', 'content_items', 'organisations', 'warmup_schedule', 'auth_credentials')`,
    );
    expect(rows).toHaveLength(0);

    const { rows: enumRows } = await getPool().query<{ typname: string }>(
      `SELECT typname FROM pg_type WHERE typname IN ('content_status', 'user_role')`,
    );
    expect(enumRows).toHaveLength(0);
  });

  it("migrate up again succeeds (clean re-apply)", () => {
    runMigrate("up");
  });
});

describe.skipIf(!databaseUrl)("acceptance test: published_needs_approval CHECK constraint", () => {
  let reviewerId: string;

  beforeAll(async () => {
    // Schema is migrated up by the previous describe block (same process,
    // same DB, vitest runs test files' top-level describes in order within
    // a file — this block lives in the same file, after the migration
    // cycle above).
    reviewerId = newId();
    await getPool().query(
      `INSERT INTO users (id, email, email_domain, cohort_track, role)
         VALUES ($1, $2, 'learnai.test', 'individual', 'reviewer')`,
      [reviewerId, `reviewer-${reviewerId}@learnai.test`],
    );
  });

  it("rejects publishing content_items without approved_by/approved_at", async () => {
    await expect(
      getPool().query(
        `INSERT INTO content_items (id, kind, title, slug, status, author_kind)
           VALUES ($1, 'technique', 'Unapproved publish attempt', $2, 'published', 'agent')`,
        [newId(), `unapproved-${newId()}`],
      ),
    ).rejects.toMatchObject({
      code: "23514", // check_violation
      constraint: "published_needs_approval",
    });
  });

  it("allows publishing content_items with approved_by and approved_at set", async () => {
    const id = newId();
    await expect(
      getPool().query(
        `INSERT INTO content_items
             (id, kind, title, slug, status, author_kind, approved_by, approved_at)
           VALUES ($1, 'technique', 'Approved publish', $2, 'published', 'agent', $3, now())`,
        [id, `approved-${id}`, reviewerId],
      ),
    ).resolves.toMatchObject({ rowCount: 1 });
  });
});

describe.skipIf(!databaseUrl)("seed script", () => {
  beforeAll(async () => {
    // Run twice up front to prove idempotency before asserting counts.
    await seed();
    await seed();
  });

  it("seeds at least 25 content_sources spanning tiers 1, 2 and 3", async () => {
    const { rows } = await getPool().query<{ tier: number; count: string }>(
      `SELECT tier, count(*)::int AS count FROM content_sources GROUP BY tier ORDER BY tier`,
    );
    const total = rows.reduce((sum, r) => sum + Number(r.count), 0);
    expect(total).toBeGreaterThanOrEqual(25);
    expect(rows.map((r) => r.tier).sort()).toEqual([1, 2, 3]);
  });

  it("seeds exactly 49 warm-up schedule rows (day_index 1..49)", async () => {
    const { rows } = await getPool().query<{ count: string }>(
      `SELECT count(*)::int AS count FROM warmup_schedule`,
    );
    expect(Number(rows[0]?.count)).toBe(49);

    const { rows: bounds } = await getPool().query<{ min: number; max: number }>(
      `SELECT min(day_index)::int AS min, max(day_index)::int AS max FROM warmup_schedule`,
    );
    expect(bounds[0]).toEqual({ min: 1, max: 49 });
  });

  it("seeds the free-mail domain list", async () => {
    const { rows } = await getPool().query<{ count: string }>(
      `SELECT count(*)::int AS count FROM free_mail_domains`,
    );
    expect(Number(rows[0]?.count)).toBeGreaterThanOrEqual(25);

    const gmail = await getPool().query(
      `SELECT 1 FROM free_mail_domains WHERE domain = 'gmail.com'`,
    );
    expect(gmail.rowCount).toBe(1);
  });

  it("seeds disposable domains and known institutions", async () => {
    const disposable = await getPool().query<{ count: string }>(
      `SELECT count(*)::int AS count FROM disposable_domains`,
    );
    expect(Number(disposable.rows[0]?.count)).toBeGreaterThanOrEqual(10);

    const institutions = await getPool().query<{ count: string }>(
      `SELECT count(*)::int AS count FROM known_institutions`,
    );
    expect(Number(institutions.rows[0]?.count)).toBe(10);
  });

  it("is idempotent: re-running the seed does not change row counts", async () => {
    const before = await getPool().query<{ count: string }>(
      `SELECT count(*)::int AS count FROM content_sources`,
    );
    await seed();
    const after = await getPool().query<{ count: string }>(
      `SELECT count(*)::int AS count FROM content_sources`,
    );
    expect(after.rows[0]?.count).toBe(before.rows[0]?.count);
  });
});

afterAll(async () => {
  if (databaseUrl) {
    await getPool().end();
  }
});
