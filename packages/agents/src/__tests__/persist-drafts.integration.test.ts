import { afterAll, describe, expect, it } from "vitest";
import { getPool, newId } from "@learn-ai/db";
import { persistDrafts } from "../draft/persist-drafts.js";
import type { DraftedContentItem } from "../draft/types.js";
import { requireDatabaseUrl } from "./test-helpers.js";

// Real Postgres round-trip for §12/T10's "DB persist test": editions
// find-or-create + status transition, and content_items inserted with
// status='in_review' against the real, migrated §3.3 schema (including the
// `published_needs_approval` / `news_needs_source` CHECK constraints).
// Skipped — not failed — when DATABASE_URL is unset, same pattern as every
// other DB-backed suite in this repo.
const databaseUrl = requireDatabaseUrl();

async function insertSource(): Promise<string> {
  const id = newId();
  await getPool().query(
    `INSERT INTO content_sources (id, name, homepage_url, tier) VALUES ($1, $2, $3, 1)`,
    [id, `Fixture Source ${id}`, "https://example.test/"],
  );
  return id;
}

function makeItem(
  sourceId: string,
  overrides: Partial<DraftedContentItem> = {},
): DraftedContentItem {
  return {
    title: `Fixture drafted item ${newId()}`,
    slug: "",
    summary: "A short fixture summary.",
    bodyMd: "Fixture body markdown.",
    vertical: "general",
    kind: "news",
    sourceUrl: "https://example.test/fixture-source-article",
    sourceId,
    sourceTier: 1,
    status: "in_review",
    authorKind: "agent",
    agentRunId: newId(),
    isPremium: false,
    videoUrl: null,
    ...overrides,
  };
}

// Far-future, high-entropy fixture dates so repeated CI runs never collide
// on `editions.edition_date UNIQUE` with a previous run's leftover row.
function randomEditionDate(): string {
  const year = 2100 + Math.floor(Math.random() * 400);
  const month = String(Math.floor(Math.random() * 12) + 1).padStart(2, "0");
  const day = String(Math.floor(Math.random() * 28) + 1).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

describe.skipIf(!databaseUrl)("persistDrafts integration", () => {
  afterAll(async () => {
    if (databaseUrl) {
      await getPool().end();
    }
  });

  it("creates an edition and inserts drafted items with status='in_review'", async () => {
    const sourceId = await insertSource();
    const editionDate = randomEditionDate();
    const items = [
      makeItem(sourceId, { kind: "news" }),
      makeItem(sourceId, { kind: "technique" }),
      makeItem(sourceId, { kind: "video" }),
    ];

    const result = await persistDrafts(items, editionDate, getPool());

    expect(result.insertedIds).toHaveLength(3);

    const { rows: editionRows } = await getPool().query<{ id: string; status: string }>(
      `SELECT id, status FROM editions WHERE id = $1`,
      [result.editionId],
    );
    expect(editionRows).toHaveLength(1);
    expect(editionRows[0]!.status).toBe("in_review");

    const { rows: itemRows } = await getPool().query<{
      id: string;
      status: string;
      author_kind: string;
      agent_run_id: string;
      edition_id: string;
    }>(
      `SELECT id, status, author_kind, agent_run_id, edition_id FROM content_items WHERE id = ANY($1::uuid[])`,
      [result.insertedIds],
    );
    expect(itemRows).toHaveLength(3);
    for (const row of itemRows) {
      expect(row.status).toBe("in_review");
      expect(row.author_kind).toBe("agent");
      expect(row.agent_run_id).toBeTruthy();
      expect(row.edition_id).toBe(result.editionId);
    }
  });

  it("dedupes a slug collision against a real existing row with a numeric suffix", async () => {
    const sourceId = await insertSource();
    const sharedTitle = `Collision fixture ${newId()}`;
    const editionDate = randomEditionDate();

    const first = await persistDrafts(
      [makeItem(sourceId, { title: sharedTitle })],
      editionDate,
      getPool(),
    );
    const second = await persistDrafts(
      [makeItem(sourceId, { title: sharedTitle })],
      editionDate,
      getPool(),
    );

    const { rows } = await getPool().query<{ slug: string }>(
      `SELECT slug FROM content_items WHERE id = ANY($1::uuid[])`,
      [[...first.insertedIds, ...second.insertedIds]],
    );
    const slugs = rows.map((r) => r.slug).sort();
    expect(new Set(slugs).size).toBe(2); // guaranteed unique — the UNIQUE constraint would throw otherwise
  });

  it("reuses the same edition row when called twice for the same edition_date", async () => {
    const sourceId = await insertSource();
    const editionDate = randomEditionDate();

    const first = await persistDrafts([makeItem(sourceId)], editionDate, getPool());
    const second = await persistDrafts([makeItem(sourceId)], editionDate, getPool());

    expect(second.editionId).toBe(first.editionId);
    const { rows } = await getPool().query<{ count: string }>(
      `SELECT count(*)::int AS count FROM editions WHERE edition_date = $1`,
      [editionDate],
    );
    expect(Number(rows[0]?.count ?? 0)).toBe(1);
  });
});
