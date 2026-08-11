import { newId, type Pool } from "@learn-ai/db";
import { slugify } from "@learn-ai/db";
import type { DraftedContentItem, DraftResult } from "./types.js";

export interface PersistDraftsResult {
  editionId: string;
  insertedIds: string[];
}

/**
 * §5.1 `PersistDrafts` / §12 T10 controller decision: find-or-create the
 * `editions` row for `editionDate` (default status 'planning' on create,
 * moved to 'in_review' the moment drafts land — never downgraded if the
 * edition somehow already moved past that), then INSERT every item with
 * `status='in_review'` — hardcoded in the SQL text, not a parameter, so a
 * caller can never accidentally slip 'published' through here. Only
 * `Publish` (T12+) may ever set a `content_items` row to 'published'.
 *
 * Slug uniqueness is resolved HERE (not in `draftItem` — see draft-item.ts
 * for why): each item's base slug (`slugify(title)`) is checked against
 * both already-persisted rows and its own siblings already inserted
 * earlier in this same call, with a numeric `-2`, `-3`, ... suffix on
 * collision.
 */
export async function persistDrafts(
  items: readonly DraftedContentItem[],
  editionDate: string,
  pool: Pool,
): Promise<PersistDraftsResult> {
  const editionId = await findOrCreateEdition(pool, editionDate);
  const insertedIds: string[] = [];

  for (const item of items) {
    const slug = await nextAvailableSlug(pool, slugify(item.title));
    const id = newId();
    await pool.query(
      `INSERT INTO content_items
         (id, edition_id, kind, title, slug, body_md, summary, vertical,
          video_url, source_url, source_id, source_tier, status, is_premium,
          author_kind, agent_run_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'in_review', $13, 'agent', $14)`,
      [
        id,
        editionId,
        item.kind,
        item.title,
        slug,
        item.bodyMd,
        item.summary,
        item.vertical,
        item.videoUrl,
        item.sourceUrl,
        item.sourceId,
        item.sourceTier,
        item.isPremium,
        item.agentRunId,
      ],
    );
    insertedIds.push(id);
  }

  return { editionId, insertedIds };
}

/** Filters `draftItem`'s per-candidate results down to the successfully
 * drafted items — the natural input to `persistDrafts`. A refusal
 * (`ok: false`) is dropped here: "typed refusal, nothing inserted" per
 * §12/T10 acceptance. */
export function collectDraftedItems(results: readonly DraftResult[]): DraftedContentItem[] {
  const items: DraftedContentItem[] = [];
  for (const result of results) {
    if (result.ok) items.push(result.item);
  }
  return items;
}

async function findOrCreateEdition(pool: Pool, editionDate: string): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO editions (id, edition_date, status)
     VALUES ($1, $2, 'in_review')
     ON CONFLICT (edition_date) DO UPDATE
       SET status = CASE WHEN editions.status = 'planning' THEN 'in_review' ELSE editions.status END
     RETURNING id`,
    [newId(), editionDate],
  );
  return rows[0]!.id;
}

async function nextAvailableSlug(pool: Pool, baseSlug: string): Promise<string> {
  let candidate = baseSlug;
  let suffix = 2;
  while (await slugTaken(pool, candidate)) {
    candidate = `${baseSlug}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}

async function slugTaken(pool: Pool, slug: string): Promise<boolean> {
  const { rows } = await pool.query(`SELECT 1 FROM content_items WHERE slug = $1`, [slug]);
  return rows.length > 0;
}
