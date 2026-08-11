import type { Pool } from "@learn-ai/db";
import type { LlmClient } from "@learn-ai/llm";
import { TRIAGE_SYSTEM_PROMPT } from "../prompts/triage-prompt.js";
import { TriageEntrySchema, TriageResponseArraySchema } from "./schema.js";
import type { TriageCandidateInput, TriageRunResult, TriageScoredCandidate } from "./types.js";

/** §12/T09 controller decision: batch size ~20 candidates per LlmRequest. */
export const DEFAULT_BATCH_SIZE = 20;

const MAX_REASON_WORDS = 15;
const SCORE_DECIMALS = 3;

export interface TriageCandidatesOptions {
  /** Candidates per LlmRequest batch. Defaults to `DEFAULT_BATCH_SIZE`. */
  batchSize?: number;
}

/**
 * §5.2 triage agent. Batches `candidates` (batch size ~20) into one
 * `LlmRequest` per batch using the verbatim §5.2 system prompt, validates
 * the response array against the §5.2 shape, and persists
 * `triage_score`/`triage_reason` (+ `raw.triage_vertical` — §3.4 has no
 * `vertical` column on `source_candidates`) for every matched candidate.
 *
 * Unmatched response ids (not in the batch) and missing candidates (in the
 * batch but absent from a valid response entry) are left unscored and
 * reported back, never thrown — one bad batch must not fail the whole run.
 */
export async function triageCandidates(
  candidates: TriageCandidateInput[],
  client: LlmClient,
  pool: Pool,
  options: TriageCandidatesOptions = {},
): Promise<TriageRunResult> {
  const batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;
  const result: TriageRunResult = {
    scored: [],
    missingIds: [],
    unmatchedIds: [],
    invalidEntries: 0,
    batchCount: 0,
  };

  for (const batch of chunk(candidates, batchSize)) {
    result.batchCount += 1;
    const batchResult = await triageBatch(batch, client);
    result.scored.push(...batchResult.scored);
    result.missingIds.push(...batchResult.missingIds);
    result.unmatchedIds.push(...batchResult.unmatchedIds);
    result.invalidEntries += batchResult.invalidEntries;
  }

  for (const entry of result.scored) {
    await persistScore(pool, entry);
  }

  return result;
}

interface BatchResult {
  scored: TriageScoredCandidate[];
  missingIds: string[];
  unmatchedIds: string[];
  invalidEntries: number;
}

async function triageBatch(
  batch: TriageCandidateInput[],
  client: LlmClient,
): Promise<BatchResult> {
  const candidateIds = new Set(batch.map((c) => c.id));
  const response = await client.complete({
    system: TRIAGE_SYSTEM_PROMPT,
    messages: [{ role: "user", content: JSON.stringify(batch.map(toPromptCandidate)) }],
    maxTokens: estimateMaxTokens(batch.length),
    responseFormat: "json",
  });

  let parsed: unknown;
  try {
    parsed = JSON.parse(response.text);
  } catch (err) {
    // BaseLlmClient already guarantees valid JSON for responseFormat:'json'
    // (or throws before returning) — this is defence in depth for a fake
    // client used in tests that skips that guarantee.
    console.warn(`[triage] response was not valid JSON, dropping whole batch: ${String(err)}`);
    return { scored: [], missingIds: [...candidateIds], unmatchedIds: [], invalidEntries: 0 };
  }

  const arrayResult = TriageResponseArraySchema.safeParse(parsed);
  if (!arrayResult.success) {
    console.warn(`[triage] response was not a JSON array, dropping whole batch`);
    return { scored: [], missingIds: [...candidateIds], unmatchedIds: [], invalidEntries: 0 };
  }

  const scored: TriageScoredCandidate[] = [];
  const unmatchedIds: string[] = [];
  let invalidEntries = 0;
  const seenIds = new Set<string>();

  for (const rawEntry of arrayResult.data) {
    const entryResult = TriageEntrySchema.safeParse(rawEntry);
    if (!entryResult.success) {
      invalidEntries += 1;
      console.warn(`[triage] dropping malformed response entry: ${entryResult.error.message}`);
      continue;
    }
    const entry = entryResult.data;
    if (!candidateIds.has(entry.id)) {
      unmatchedIds.push(entry.id);
      console.warn(`[triage] dropping response entry for unknown candidate id "${entry.id}"`);
      continue;
    }
    if (seenIds.has(entry.id)) {
      // A duplicate valid entry for an id already scored in this batch —
      // keep the first, drop the rest, same "malformed batch continues"
      // spirit as any other per-entry defect.
      invalidEntries += 1;
      console.warn(`[triage] dropping duplicate response entry for candidate id "${entry.id}"`);
      continue;
    }
    seenIds.add(entry.id);
    scored.push({
      id: entry.id,
      score: roundScore(entry.score),
      reason: truncateWords(entry.reason, MAX_REASON_WORDS),
      vertical: entry.vertical,
    });
  }

  const missingIds = batch.map((c) => c.id).filter((id) => !seenIds.has(id));
  if (missingIds.length > 0) {
    console.warn(`[triage] no scored response for candidate ids: ${missingIds.join(", ")}`);
  }

  return { scored, missingIds, unmatchedIds, invalidEntries };
}

function toPromptCandidate(c: TriageCandidateInput): Record<string, unknown> {
  return { id: c.id, title: c.title, excerpt: c.excerpt, url: c.url };
}

/** Generous but bounded — a batch of N candidates needs roughly N short
 * JSON objects back; padded well above that estimate. */
function estimateMaxTokens(batchLength: number): number {
  return Math.min(4000, Math.max(500, batchLength * 80 + 200));
}

function roundScore(score: number): number {
  const clamped = Math.min(1, Math.max(0, score));
  return Number(clamped.toFixed(SCORE_DECIMALS));
}

function truncateWords(text: string, maxWords: number): string {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return words.join(" ");
  return `${words.slice(0, maxWords).join(" ")}…`;
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

/**
 * §3.4: `source_candidates` has no `vertical` column — the triage-assigned
 * vertical is stored under `raw.triage_vertical` (documented here and in
 * README.md) rather than adding a column, per the T09 controller decision.
 * `jsonb_set(..., true)` creates the key if `raw` doesn't have it yet and
 * preserves every other key ingestion already wrote (title/excerpt source
 * data, feed-specific fields, ...).
 */
async function persistScore(pool: Pool, entry: TriageScoredCandidate): Promise<void> {
  await pool.query(
    `UPDATE source_candidates
        SET triage_score = $2,
            triage_reason = $3,
            raw = jsonb_set(coalesce(raw, '{}'::jsonb), '{triage_vertical}', to_jsonb($4::text), true)
      WHERE id = $1`,
    [entry.id, entry.score, entry.reason, entry.vertical],
  );
}
