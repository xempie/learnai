// T09 — shared types for the triage agent. Deliberately plain-object shaped
// (not a `pg` row type) so `triageCandidates` stays testable without a live
// Postgres connection, same convention as packages/ingestion's types.ts.

/** The §3.4 `vertical` enum (§3.1), duplicated here as a literal union so
 * the triage response schema can validate against it without importing a
 * runtime enum from anywhere else. */
export const VERTICALS = [
  "general",
  "teaching",
  "learning",
  "marketing",
  "management",
  "health",
] as const;
export type Vertical = (typeof VERTICALS)[number];

/** One `source_candidates` row's fields the triage agent needs to see. */
export interface TriageCandidateInput {
  id: string;
  title: string;
  excerpt: string | null;
  url: string;
}

/** One validated, matched scoring result — ready to persist. */
export interface TriageScoredCandidate {
  id: string;
  score: number;
  reason: string;
  vertical: Vertical;
}

export interface TriageRunResult {
  /** Successfully scored and persisted candidates. */
  scored: TriageScoredCandidate[];
  /** Candidate ids present in the batch that the LLM did not return a
   * (valid, matching) entry for — left unscored in the DB. */
  missingIds: string[];
  /** Ids present in the LLM's response but not in the batch it was asked
   * to score — dropped, never persisted. */
  unmatchedIds: string[];
  /** Count of response array entries that failed schema validation
   * (wrong types, out-of-range score, unknown vertical, ...) — dropped. */
  invalidEntries: number;
  /** Number of LlmRequest batches sent. */
  batchCount: number;
}
