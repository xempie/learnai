import { afterAll, describe, expect, it } from "vitest";
import { getPool, newId } from "@learn-ai/db";
import { triageCandidates } from "../triage/triage-candidates.js";
import type { TriageCandidateInput } from "../triage/types.js";
import { FakeLlmClient } from "./fake-llm-client.js";
import { requireDatabaseUrl } from "./test-helpers.js";

// Real Postgres round-trip for the §12/T09 controller decision: "fixture
// batch of 20 candidates scored via FakeTransport (canned JSON) -> scores
// persisted (DB test, skip-locally/run-in-CI)". The FakeLlmClient stands in
// for the transport (see fake-llm-client.ts); this test proves the
// triage_score/triage_reason/raw.triage_vertical UPDATE lands correctly
// against the real, migrated §3.4 schema. The batching/validation logic
// itself is covered without a DB in triage-candidates.test.ts (FakePool).
const databaseUrl = requireDatabaseUrl();

async function insertSource(): Promise<string> {
  const id = newId();
  await getPool().query(
    `INSERT INTO content_sources (id, name, homepage_url, tier) VALUES ($1, $2, $3, 1)`,
    [id, `Fixture Source ${id}`, "https://example.test/"],
  );
  return id;
}

async function insertCandidates(sourceId: string, n: number): Promise<TriageCandidateInput[]> {
  const candidates: TriageCandidateInput[] = [];
  for (let i = 0; i < n; i += 1) {
    const id = newId();
    const title = `Fixture article ${i}`;
    const excerpt = `Excerpt for fixture article ${i}.`;
    const url = `https://example.test/articles/${id}`;
    await getPool().query(
      `INSERT INTO source_candidates (id, source_id, url, url_hash, title, excerpt, raw)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [id, sourceId, url, `hash-${id}`, title, excerpt, JSON.stringify({ original: "data" })],
    );
    candidates.push({ id, title, excerpt, url });
  }
  return candidates;
}

describe.skipIf(!databaseUrl)("triageCandidates integration", () => {
  afterAll(async () => {
    if (databaseUrl) {
      await getPool().end();
    }
  });

  it("scores a fixture batch of 20 candidates and persists triage_score/triage_reason/raw.triage_vertical without clobbering existing raw keys", async () => {
    const sourceId = await insertSource();
    const candidates = await insertCandidates(sourceId, 20);
    const canned = candidates.map((c, i) => ({
      id: c.id,
      score: Number((i / 19).toFixed(3)),
      reason: `Reason for ${c.title}`,
      vertical: "general" as const,
    }));
    const client = new FakeLlmClient([JSON.stringify(canned)]);

    const result = await triageCandidates(candidates, client, getPool());

    expect(result.scored).toHaveLength(20);
    expect(result.missingIds).toHaveLength(0);

    const { rows } = await getPool().query<{
      id: string;
      triage_score: string;
      triage_reason: string;
      raw: { original: string; triage_vertical: string };
      status: string;
    }>(
      `SELECT id, triage_score, triage_reason, raw, status FROM source_candidates WHERE id = ANY($1::uuid[])`,
      [candidates.map((c) => c.id)],
    );
    expect(rows).toHaveLength(20);
    for (const row of rows) {
      expect(row.triage_score).not.toBeNull();
      expect(Number(row.triage_score)).toBeGreaterThanOrEqual(0);
      expect(Number(row.triage_score)).toBeLessThanOrEqual(1);
      expect(row.triage_reason).toBeTruthy();
      // §3.4 has no `vertical` column — stored under raw.triage_vertical.
      expect(row.raw.triage_vertical).toBe("general");
      // The ingestion-written `raw.original` key must survive the merge.
      expect(row.raw.original).toBe("data");
      // Triage does not change status — that is selectCandidates' job.
      expect(row.status).toBe("new");
    }
  });
});
