import type { Pool } from "@learn-ai/db";

/** One selected candidate — enough for T10's draft agent to fetch/draft
 * from, plus the source tier/vertical needed for §5.4's editorial rules
 * (tier 2 verification checkbox, vertical rotation). */
export interface SelectedCandidate {
  id: string;
  sourceId: string;
  title: string;
  url: string;
  excerpt: string | null;
  triageScore: number;
  triageReason: string | null;
  sourceTier: 1 | 2 | 3;
  sourceVertical: string;
  raw: unknown;
}

interface SelectCandidatesRow {
  id: string;
  source_id: string;
  title: string;
  url: string;
  excerpt: string | null;
  triage_score: string; // NUMERIC comes back as a string from `pg`
  triage_reason: string | null;
  tier: 1 | 2 | 3;
  vertical: string;
  raw: unknown;
}

/**
 * §5.1 `SelectTopN` building block / §5.4 hard rule: the highest-scored
 * `status='new'` candidates, joined to `content_sources` to enforce
 * "`SelectTopN` must exclude `source_tier = 3` candidates from the draft
 * set" — Tier 3 candidates are NEVER in the returned set, full stop. Kept
 * kind-agnostic (no news/technique/video split, no vertical rotation) on
 * purpose: T10/T11 layer the 1-news+1-technique+1-video selection and the
 * §5.4 vertical rotation on top of this. Chosen rows are marked
 * `status='selected'` so a re-run doesn't reselect them.
 */
export async function selectCandidates(pool: Pool, topN: number): Promise<SelectedCandidate[]> {
  const { rows } = await pool.query<SelectCandidatesRow>(
    `SELECT sc.id, sc.source_id, sc.title, sc.url, sc.excerpt,
            sc.triage_score, sc.triage_reason, sc.raw,
            cs.tier, cs.vertical
       FROM source_candidates sc
       JOIN content_sources cs ON cs.id = sc.source_id
      WHERE sc.status = 'new'
        AND sc.triage_score IS NOT NULL
        AND cs.tier <> 3
      ORDER BY sc.triage_score DESC
      LIMIT $1`,
    [topN],
  );

  if (rows.length > 0) {
    await pool.query(
      `UPDATE source_candidates SET status = 'selected' WHERE id = ANY($1::uuid[])`,
      [rows.map((r) => r.id)],
    );
  }

  return rows.map((r) => ({
    id: r.id,
    sourceId: r.source_id,
    title: r.title,
    url: r.url,
    excerpt: r.excerpt,
    triageScore: Number(r.triage_score),
    triageReason: r.triage_reason,
    sourceTier: r.tier,
    sourceVertical: r.vertical,
    raw: r.raw,
  }));
}
