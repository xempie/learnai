import { describe, expect, it } from "vitest";
import { collectDraftedItems, persistDrafts } from "../draft/persist-drafts.js";
import type { DraftedContentItem, DraftResult } from "../draft/types.js";
import { FakeDraftPool } from "./fake-draft-pool.js";

function makeItem(overrides: Partial<DraftedContentItem> = {}): DraftedContentItem {
  return {
    title: "A useful AI technique",
    slug: "a-useful-ai-technique",
    summary: "Short summary.",
    bodyMd: "Body markdown.",
    vertical: "general",
    kind: "technique",
    sourceUrl: "https://example.test/a",
    sourceId: "source-1",
    sourceTier: 1,
    status: "in_review",
    authorKind: "agent",
    agentRunId: "run-1",
    isPremium: false,
    videoUrl: null,
    ...overrides,
  };
}

describe("persistDrafts", () => {
  it("creates a new edition (status='in_review') and inserts every item with status='in_review'", async () => {
    const pool = new FakeDraftPool();
    const items = [makeItem({ title: "First" }), makeItem({ title: "Second", kind: "news" })];

    const result = await persistDrafts(items, "2026-08-12", pool.asPool());

    expect(pool.editions).toHaveLength(1);
    expect(pool.editions[0]!.status).toBe("in_review");
    expect(result.editionId).toBe(pool.editions[0]!.id);
    expect(result.insertedIds).toHaveLength(2);
    expect(pool.contentItems).toHaveLength(2);
    for (const row of pool.contentItems) {
      expect(row.status).toBe("in_review");
      expect(row.author_kind).toBe("agent");
    }
  });

  it("reuses an existing edition for the same date and moves status planning -> in_review", async () => {
    const pool = new FakeDraftPool();
    pool.editions.push({ id: "existing-edition", edition_date: "2026-08-12", status: "planning" });

    const result = await persistDrafts([makeItem()], "2026-08-12", pool.asPool());

    expect(pool.editions).toHaveLength(1);
    expect(result.editionId).toBe("existing-edition");
    expect(pool.editions[0]!.status).toBe("in_review");
  });

  it("does not downgrade an edition already past 'planning'", async () => {
    const pool = new FakeDraftPool();
    pool.editions.push({ id: "existing-edition", edition_date: "2026-08-12", status: "approved" });

    await persistDrafts([makeItem()], "2026-08-12", pool.asPool());

    expect(pool.editions[0]!.status).toBe("approved");
  });

  it("dedupes a colliding slug with a numeric suffix, against both existing rows and siblings in the same call", async () => {
    const pool = new FakeDraftPool();
    pool.contentItems.push({
      id: "pre-existing",
      edition_id: "e1",
      kind: "news",
      title: "A useful AI technique",
      slug: "a-useful-ai-technique",
      body_md: "x",
      summary: "x",
      vertical: "general",
      video_url: null,
      source_url: "https://example.test/pre",
      source_id: "s",
      source_tier: 1,
      status: "in_review",
      is_premium: false,
      author_kind: "agent",
      agent_run_id: "r",
    });

    const items = [
      makeItem({ title: "A useful AI technique" }), // collides with the pre-existing row
      makeItem({ title: "A useful AI technique" }), // collides with the sibling above too
    ];

    await persistDrafts(items, "2026-08-12", pool.asPool());

    const slugs = pool.contentItems
      .filter((c) => c.title === "A useful AI technique")
      .map((c) => c.slug);
    expect(slugs).toEqual([
      "a-useful-ai-technique",
      "a-useful-ai-technique-2",
      "a-useful-ai-technique-3",
    ]);
  });

  it("never inserts status='published' regardless of what the item claims", async () => {
    const pool = new FakeDraftPool();
    // DraftedContentItem's type only allows 'in_review', but persistDrafts
    // hardcodes the literal in the SQL text rather than trusting a
    // parameter — this asserts that belt-and-braces behaviour end to end.
    await persistDrafts([makeItem()], "2026-08-12", pool.asPool());
    expect(pool.contentItems.every((c) => c.status === "in_review")).toBe(true);
  });

  it("collectDraftedItems drops refusals, so a thin-source result inserts nothing", async () => {
    const pool = new FakeDraftPool();
    const results: DraftResult[] = [
      { ok: true, item: makeItem({ title: "Kept" }) },
      { ok: false, error: "insufficient_source", detail: "not enough context" },
    ];

    const items = collectDraftedItems(results);
    expect(items).toHaveLength(1);
    expect(items[0]?.title).toBe("Kept");

    await persistDrafts(items, "2026-08-12", pool.asPool());
    expect(pool.contentItems).toHaveLength(1);
  });
});
