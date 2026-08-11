// T10 — shared types for the draft agent. Deliberately plain-object shaped
// (not a `pg` row type), same convention as ../triage/types.ts.
import type { Vertical } from "../triage/types.js";

export { VERTICALS, type Vertical } from "../triage/types.js";

/** §5.3's three `kind` variants. */
export const DRAFT_KINDS = ["news", "technique", "video"] as const;
export type DraftKind = (typeof DRAFT_KINDS)[number];

/**
 * The candidate `draftItem` writes from — deliberately the same shape T09's
 * `SelectedCandidate` (../triage/select-candidates.ts) already produces
 * (title/url/excerpt/raw + the §5.4 tier/vertical fields the pipeline needs
 * downstream), so T11's orchestration can hand a `SelectedCandidate`
 * straight to `draftItem` with no adapter. Declared independently here
 * (rather than importing `SelectedCandidate`) so the draft module doesn't
 * depend on triage's DB-query module for a type.
 */
export interface DraftCandidateInput {
  id: string;
  title: string;
  url: string;
  excerpt: string | null;
  /** Raw ingested payload (`source_candidates.raw`) — passed through to the
   * model as additional context; shape is source-specific and unvalidated. */
  raw: unknown;
  sourceId: string;
  sourceTier: 1 | 2 | 3;
  sourceVertical: string;
}

export interface DraftItemInput {
  candidate: DraftCandidateInput;
  kind: DraftKind;
  /** §5.1 redraft loop: "DraftAgent (with reviewer notes appended, max 3
   * loops)" — when set, appended to the user message so a redraft responds
   * to what the reviewer asked for. The loop-count cap itself is T11's
   * orchestration concern, not draftItem's. */
  reviewerNotes?: string;
}

/** Ready-to-insert `content_items` shape (§3.3), camelCase — `persistDrafts`
 * maps these onto the actual INSERT's column list. */
export interface DraftedContentItem {
  title: string;
  slug: string;
  summary: string;
  bodyMd: string;
  vertical: Vertical;
  kind: DraftKind;
  sourceUrl: string;
  sourceId: string;
  sourceTier: 1 | 2 | 3;
  status: "in_review";
  authorKind: "agent";
  agentRunId: string;
  isPremium: false;
  /** §12/T10 controller decision: "video: leave video_url null — script
   * goes in body_md" — true for all three kinds at draft time (no real
   * recording exists yet), not just kind='video'. */
  videoUrl: null;
}

export interface DraftSuccess {
  ok: true;
  item: DraftedContentItem;
}

/** The §5.3 `{"error":"insufficient_source","detail":"..."}` refusal,
 * surfaced as a TYPED result rather than an exception (§12/T10 controller
 * decision) — a thin source is an expected, routine outcome, not a bug. */
export interface DraftRefusal {
  ok: false;
  error: "insufficient_source";
  detail: string;
}

export type DraftResult = DraftSuccess | DraftRefusal;
