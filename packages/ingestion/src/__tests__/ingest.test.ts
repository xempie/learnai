import { readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getPool, newId } from "@learn-ai/db";
import { requireDatabaseUrl, runMigrate } from "./test-helpers.js";
import { ingestSource } from "../ingest-source.js";
import { pollDueSources } from "../poll-sources.js";
import { runIngestion } from "../run-ingestion.js";
import { MAX_CONSECUTIVE_FAILURES, type ContentSourceRow } from "../types.js";

// These tests need a real Postgres instance (see docker-compose.yml at the
// repo root: `pnpm db:up`). Skipped — not failed — when DATABASE_URL is
// unset, same skip-locally/run-in-CI pattern as packages/db's own
// migration test (CI's postgres service always sets DATABASE_URL).
//
// Feeds are served from a tiny local http server over fixture XML files —
// deliberately never real internet, per the T07 controller decision.
const databaseUrl = requireDatabaseUrl();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.join(__dirname, "fixtures");

function readFixture(name: string): string {
  return readFileSync(path.join(fixturesDir, name), "utf8");
}

let server: Server;
let baseUrl: string;
const routes: Record<string, { status: number; body: string }> = {
  "/rss-feed.xml": { status: 200, body: readFixture("rss-feed.xml") },
  "/atom-feed.xml": { status: 200, body: readFixture("atom-feed.xml") },
  "/malformed-feed.xml": { status: 200, body: readFixture("malformed-feed.xml") },
  "/not-found.xml": { status: 404, body: "not found" },
};

beforeAll(async () => {
  server = createServer((req, res) => {
    const requestUrl = new URL(req.url ?? "/", "http://127.0.0.1");
    const route = routes[requestUrl.pathname];
    if (!route) {
      res.writeHead(404).end("no such fixture route");
      return;
    }
    // rss-feed.xml / atom-feed.xml embed a `__TOKEN__` placeholder in their
    // article links. Substituting in the caller-supplied `?token=` here
    // gives every test its own unique article URLs (and therefore unique
    // url_hash values) even though every test shares one Postgres instance
    // and one `source_candidates.url_hash` UNIQUE constraint — without
    // this, two different tests' sources would insert candidates for the
    // exact same URL and collide with each other via ON CONFLICT DO
    // NOTHING, which is exactly the dedupe behaviour under test.
    const token = requestUrl.searchParams.get("token");
    const body = token ? route.body.replaceAll("__TOKEN__", token) : route.body;
    res.writeHead(route.status, { "content-type": "application/xml" }).end(body);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address && typeof address === "object") {
    baseUrl = `http://127.0.0.1:${address.port}`;
  }
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve())),
  );
  if (databaseUrl) {
    await getPool().end();
  }
});

type FixtureKind = "rss" | "atom" | "malformed" | "not-found";
const FIXTURE_FILES: Record<FixtureKind, string> = {
  rss: "rss-feed.xml",
  atom: "atom-feed.xml",
  malformed: "malformed-feed.xml",
  "not-found": "not-found.xml",
};

/** Feed URL for a fixture, tokenised with `sourceId` so its article URLs
 * (and therefore their url_hash) are unique to this one source/call. */
function fixtureUrl(kind: FixtureKind, sourceId: string): string {
  const url = new URL(FIXTURE_FILES[kind], baseUrl);
  url.searchParams.set("token", sourceId);
  return url.toString();
}

function makeSource(
  overrides: Partial<ContentSourceRow> & { fixtureKind?: FixtureKind } = {},
): ContentSourceRow {
  const { fixtureKind = "rss", ...rest } = overrides;
  const id = rest.id ?? newId();
  return {
    id,
    name: rest.name ?? "Fixture Source",
    homepage_url: "https://example.test/",
    feed_url: rest.feed_url ?? fixtureUrl(fixtureKind, id),
    tier: 1,
    vertical: "general",
    ingest_method: "rss",
    poll_interval_min: 240,
    active: true,
    last_polled_at: null,
    last_item_at: null,
    consecutive_failures: 0,
    created_at: new Date(),
    ...rest,
  };
}

async function insertSource(row: ContentSourceRow): Promise<void> {
  await getPool().query(
    `INSERT INTO content_sources
       (id, name, homepage_url, feed_url, tier, vertical, ingest_method,
        poll_interval_min, active, last_polled_at, last_item_at, consecutive_failures)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
    [
      row.id,
      row.name,
      row.homepage_url,
      row.feed_url,
      row.tier,
      row.vertical,
      row.ingest_method,
      row.poll_interval_min,
      row.active,
      row.last_polled_at,
      row.last_item_at,
      row.consecutive_failures,
    ],
  );
}

async function fetchSource(id: string): Promise<ContentSourceRow> {
  const { rows } = await getPool().query<ContentSourceRow>(
    `SELECT * FROM content_sources WHERE id = $1`,
    [id],
  );
  const row = rows[0];
  if (!row) throw new Error(`source ${id} not found`);
  return row;
}

async function candidateCountFor(sourceId: string): Promise<number> {
  const { rows } = await getPool().query<{ count: string }>(
    `SELECT count(*)::int AS count FROM source_candidates WHERE source_id = $1`,
    [sourceId],
  );
  return Number(rows[0]?.count ?? 0);
}

describe.skipIf(!databaseUrl)("@learn-ai/ingestion integration", () => {
  beforeAll(async () => {
    try {
      runMigrate("down");
    } catch {
      /* no-op: nothing to tear down */
    }
    runMigrate("up");
  });

  it("ingestSource inserts candidates from a fixture RSS feed with title/excerpt/published_at mapped", async () => {
    const source = makeSource();
    await insertSource(source);

    const result = await ingestSource(getPool(), source);

    expect(result.ok).toBe(true);
    expect(result.fetched).toBe(2);
    expect(result.inserted).toBe(2);

    const { rows } = await getPool().query(
      `SELECT title, excerpt, published_at, url, url_hash, raw
         FROM source_candidates WHERE source_id = $1 ORDER BY title`,
      [source.id],
    );
    expect(rows).toHaveLength(2);
    const first = rows.find((r: { title: string }) => r.title === "First Fixture Article");
    expect(first).toBeTruthy();
    expect(first.excerpt).toBe("Excerpt for the first fixture article.");
    expect(first.published_at).toBeInstanceOf(Date);
    // tracking params (utm_source, utm_medium, ref) stripped by normaliseUrl
    expect(first.url).toBe(`https://example.test/articles/first-article-${source.id}`);
    expect(first.url_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(first.raw).toBeTruthy();

    const updatedSource = await fetchSource(source.id);
    expect(updatedSource.last_polled_at).toBeInstanceOf(Date);
    expect(updatedSource.last_item_at).toBeInstanceOf(Date);
    expect(updatedSource.consecutive_failures).toBe(0);
  });

  it("ingestSource maps a fixture Atom feed the same way as RSS", async () => {
    const source = makeSource({ name: "Atom Fixture Source", fixtureKind: "atom" });
    await insertSource(source);

    const result = await ingestSource(getPool(), source);

    expect(result.ok).toBe(true);
    expect(result.fetched).toBe(1);
    expect(result.inserted).toBe(1);

    const { rows } = await getPool().query(
      `SELECT title, excerpt, url FROM source_candidates WHERE source_id = $1`,
      [source.id],
    );
    expect(rows[0]).toMatchObject({
      title: "Atom Fixture Entry",
      excerpt: "Excerpt for the atom fixture entry.",
      url: `https://example.test/atom/entry-one-${source.id}`,
    });
  });

  it("re-running ingestSource against the same feed inserts zero duplicates", async () => {
    const source = makeSource({ name: "Rerun Fixture Source" });
    await insertSource(source);

    const firstRun = await ingestSource(getPool(), source);
    expect(firstRun.inserted).toBe(2);

    const secondRun = await ingestSource(getPool(), await fetchSource(source.id));
    expect(secondRun.ok).toBe(true);
    expect(secondRun.fetched).toBe(2);
    expect(secondRun.inserted).toBe(0);

    expect(await candidateCountFor(source.id)).toBe(2);
  });

  it("a malformed feed marks failure, records zero candidates, and does not throw", async () => {
    const source = makeSource({ name: "Malformed Fixture Source", fixtureKind: "malformed" });
    await insertSource(source);

    const result = await ingestSource(getPool(), source);

    expect(result.ok).toBe(false);
    expect(result.inserted).toBe(0);
    expect(result.error).toBeTruthy();
    expect(await candidateCountFor(source.id)).toBe(0);

    const updated = await fetchSource(source.id);
    expect(updated.consecutive_failures).toBe(1);
    expect(updated.active).toBe(true);
  });

  it(`the ${MAX_CONSECUTIVE_FAILURES}th consecutive failure auto-deactivates the source`, async () => {
    const source = makeSource({ name: "Always Failing Fixture Source", fixtureKind: "not-found" });
    await insertSource(source);

    let current = source;
    for (let attempt = 1; attempt <= MAX_CONSECUTIVE_FAILURES; attempt += 1) {
      const result = await ingestSource(getPool(), current);
      expect(result.ok).toBe(false);
      current = await fetchSource(source.id);
      expect(current.consecutive_failures).toBe(attempt);
      if (attempt < MAX_CONSECUTIVE_FAILURES) {
        expect(current.active).toBe(true);
      }
    }

    expect(current.active).toBe(false);
  });

  it("a success after failures resets consecutive_failures to zero", async () => {
    const source = makeSource({ name: "Recovering Fixture Source", fixtureKind: "not-found" });
    await insertSource(source);

    await ingestSource(getPool(), source);
    let current = await fetchSource(source.id);
    expect(current.consecutive_failures).toBe(1);

    // Fix the feed_url (as an operator re-pointing a broken source would)
    // and confirm the next successful poll clears the failure count.
    await getPool().query(`UPDATE content_sources SET feed_url = $2 WHERE id = $1`, [
      source.id,
      fixtureUrl("rss", source.id),
    ]);
    current = await fetchSource(source.id);

    const result = await ingestSource(getPool(), current);
    expect(result.ok).toBe(true);

    current = await fetchSource(source.id);
    expect(current.consecutive_failures).toBe(0);
  });

  it("pollDueSources only returns active rss sources whose interval has elapsed", async () => {
    const due = makeSource({ name: "Due Fixture Source", last_polled_at: null });
    const notDue = makeSource({
      name: "Not Due Fixture Source",
      last_polled_at: new Date(),
      poll_interval_min: 240,
    });
    const inactive = makeSource({
      name: "Inactive Fixture Source",
      active: false,
      last_polled_at: null,
    });
    const overdue = makeSource({
      name: "Overdue Fixture Source",
      poll_interval_min: 60,
      last_polled_at: new Date(Date.now() - 2 * 60 * 60 * 1000),
    });
    for (const s of [due, notDue, inactive, overdue]) {
      await insertSource(s);
    }

    const dueSources = await pollDueSources(getPool());
    const dueIds = new Set(dueSources.map((s) => s.id));

    expect(dueIds.has(due.id)).toBe(true);
    expect(dueIds.has(overdue.id)).toBe(true);
    expect(dueIds.has(notDue.id)).toBe(false);
    expect(dueIds.has(inactive.id)).toBe(false);
  });

  it("runIngestion isolates a bad feed's failure from the rest of the batch", async () => {
    const good = makeSource({ name: "Batch Good Source" });
    const bad = makeSource({ name: "Batch Malformed Source", fixtureKind: "malformed" });
    for (const s of [good, bad]) {
      await insertSource(s);
    }

    const result = await runIngestion(getPool());

    const goodResult = result.results.find((r) => r.sourceId === good.id);
    const badResult = result.results.find((r) => r.sourceId === bad.id);
    expect(goodResult?.ok).toBe(true);
    expect(goodResult?.inserted).toBe(2);
    expect(badResult?.ok).toBe(false);
    expect(result.sourcesDue).toBeGreaterThanOrEqual(2);
  });
});
