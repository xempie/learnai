import { afterAll, describe, expect, it } from "vitest";
import { getPool, newId } from "@learn-ai/db";
import { selectCandidates } from "../triage/select-candidates.js";
import { requireDatabaseUrl } from "./test-helpers.js";

// Real Postgres round-trip for §5.4's hard rule: "SelectTopN must exclude
// source_tier = 3 candidates from the draft set." Skipped — not failed —
// when DATABASE_URL is unset, same skip-locally/run-in-CI pattern as
// packages/llm's and packages/ingestion's DB-backed tests. CI's postgres
// service already has the schema migrated up before `pnpm test` runs, so
// this file does not re-run migrations itself.
const databaseUrl = requireDatabaseUrl();

async function insertSource(tier: 1 | 2 | 3, name: string): Promise<string> {
  const id = newId();
  await getPool().query(
    `INSERT INTO content_sources (id, name, homepage_url, tier)
     VALUES ($1, $2, $3, $4)`,
    [id, name, "https://example.test/", tier],
  );
  return id;
}

async function insertCandidate(
  sourceId: string,
  opts: { score: number; status?: string; url?: string },
): Promise<string> {
  const id = newId();
  const url = opts.url ?? `https://example.test/articles/${id}`;
  await getPool().query(
    `INSERT INTO source_candidates (id, source_id, url, url_hash, title, triage_score, triage_reason, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      id,
      sourceId,
      url,
      // url_hash just needs to be unique per row for this test — not a real sha256.
      `hash-${id}`,
      `Fixture candidate ${id}`,
      opts.score,
      "fixture reason",
      opts.status ?? "new",
    ],
  );
  return id;
}

describe.skipIf(!databaseUrl)("selectCandidates integration", () => {
  afterAll(async () => {
    if (databaseUrl) {
      await getPool().end();
    }
  });

  it("never includes a Tier 3 candidate even when it has the highest score", async () => {
    const tier1Source = await insertSource(1, `Tier 1 Source ${newId()}`);
    const tier3Source = await insertSource(3, `Tier 3 Source ${newId()}`);

    const tier3HighScore = await insertCandidate(tier3Source, { score: 0.99 });
    const tier1LowerScore = await insertCandidate(tier1Source, { score: 0.5 });

    const selected = await selectCandidates(getPool(), 10);
    const selectedIds = selected.map((c) => c.id);

    expect(selectedIds).not.toContain(tier3HighScore);
    expect(selectedIds).toContain(tier1LowerScore);
    expect(selected.every((c) => c.sourceTier !== 3)).toBe(true);
  });

  it("returns the highest-scored NEW candidates and marks them status='selected'", async () => {
    const source = await insertSource(1, `Rank Source ${newId()}`);
    const high = await insertCandidate(source, { score: 0.9 });
    const mid = await insertCandidate(source, { score: 0.6 });
    const low = await insertCandidate(source, { score: 0.1 });

    const selected = await selectCandidates(getPool(), 2);
    const selectedIds = selected.map((c) => c.id);

    expect(selectedIds).toEqual(expect.arrayContaining([high, mid]));
    expect(selectedIds).not.toContain(low);

    const { rows } = await getPool().query<{ id: string; status: string }>(
      `SELECT id, status FROM source_candidates WHERE id = ANY($1::uuid[])`,
      [[high, mid]],
    );
    expect(rows.every((r) => r.status === "selected")).toBe(true);
  });

  it("excludes candidates without a triage_score and candidates not in status='new'", async () => {
    const source = await insertSource(1, `Unscored Source ${newId()}`);
    const unscoredId = newId();
    await getPool().query(
      `INSERT INTO source_candidates (id, source_id, url, url_hash, title, status)
       VALUES ($1, $2, $3, $4, $5, 'new')`,
      [unscoredId, source, `https://example.test/articles/${unscoredId}`, `hash-${unscoredId}`, "Unscored"],
    );
    const alreadySelected = await insertCandidate(source, { score: 0.95, status: "selected" });

    const selected = await selectCandidates(getPool(), 10);
    const selectedIds = selected.map((c) => c.id);

    expect(selectedIds).not.toContain(unscoredId);
    expect(selectedIds).not.toContain(alreadySelected);
  });
});
