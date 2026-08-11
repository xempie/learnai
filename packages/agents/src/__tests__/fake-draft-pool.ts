import type { Pool } from "@learn-ai/db";

export interface CapturedContentItem {
  id: string;
  edition_id: string;
  kind: string;
  title: string;
  slug: string;
  body_md: string;
  summary: string;
  vertical: string;
  video_url: string | null;
  source_url: string;
  source_id: string;
  source_tier: number;
  status: string;
  is_premium: boolean;
  author_kind: string;
  agent_run_id: string;
}

interface EditionRow {
  id: string;
  edition_date: string;
  status: string;
}

/**
 * In-memory stand-in for the pg `Pool` `persistDrafts` writes through —
 * same convention as packages/llm's / T09's own FakePool: lets the
 * unit-level tests (find-or-create edition, status transition, slug
 * dedupe, "never inserts published") run without a live Postgres
 * connection. The real round-trip against the migrated §3.3 schema is
 * covered separately in persist-drafts.integration.test.ts.
 */
export class FakeDraftPool {
  readonly editions: EditionRow[] = [];
  readonly contentItems: CapturedContentItem[] = [];

  async query<T = unknown>(sql: string, params: unknown[] = []): Promise<{ rows: T[] }> {
    const normalised = sql.trim().toLowerCase();

    if (normalised.startsWith("insert into editions")) {
      const [id, editionDate] = params as [string, string];
      const existing = this.editions.find((e) => e.edition_date === editionDate);
      if (existing) {
        if (existing.status === "planning") existing.status = "in_review";
        return { rows: [{ id: existing.id }] as T[] };
      }
      const row: EditionRow = { id, edition_date: editionDate, status: "in_review" };
      this.editions.push(row);
      return { rows: [{ id: row.id }] as T[] };
    }

    if (normalised.startsWith("select 1 from content_items where slug")) {
      const [slug] = params as [string];
      const taken = this.contentItems.some((c) => c.slug === slug);
      return { rows: (taken ? [{ exists: true }] : []) as T[] };
    }

    if (normalised.startsWith("insert into content_items")) {
      const [
        id,
        edition_id,
        kind,
        title,
        slug,
        body_md,
        summary,
        vertical,
        video_url,
        source_url,
        source_id,
        source_tier,
        is_premium,
        agent_run_id,
      ] = params as [
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string | null,
        string,
        string,
        number,
        boolean,
        string,
      ];
      this.contentItems.push({
        id,
        edition_id,
        kind,
        title,
        slug,
        body_md,
        summary,
        vertical,
        video_url,
        source_url,
        source_id,
        source_tier,
        status: "in_review",
        is_premium,
        author_kind: "agent",
        agent_run_id,
      });
      return { rows: [] as T[] };
    }

    throw new Error(`FakeDraftPool: unexpected query: ${sql}`);
  }

  asPool(): Pool {
    return this as unknown as Pool;
  }
}
