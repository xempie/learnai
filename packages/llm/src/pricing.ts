/**
 * Per-model USD price table, $ per 1,000,000 tokens.
 *
 * FOUNDER-UPDATABLE. Prices drift — Anthropic and AWS both revise them
 * independently of this codebase, and Bedrock pricing is partner-operated
 * (AWS sets it; it is not guaranteed to match Anthropic's first-party
 * rates or retirement schedule). Edit this table when pricing changes;
 * nothing else in this package should hardcode a per-model rate.
 *
 * Documented as of 2026-08-12:
 *  - Bedrock rows: https://aws.amazon.com/bedrock/pricing/ (ap-southeast-2)
 *  - Anthropic first-party rows: https://platform.claude.com/docs/en/pricing
 *    Claude Sonnet 5 carries an introductory rate of $2.00 / $10.00 per MTok
 *    through 2026-08-31 — this table uses the standing sticker price
 *    ($3.00 / $15.00) so it does not silently go stale the day the intro
 *    period ends; apply the discount out-of-band if precise intro-period
 *    accounting is needed.
 *
 * A model_id with no entry here computes a `null` cost_usd rather than
 * throwing — token counts and everything else about the `agent_runs` row
 * are still recorded, so a new/unpriced model never blocks logging.
 */
export interface ModelPrice {
  /** USD per 1,000,000 input tokens. */
  inputPerMTok: number;
  /** USD per 1,000,000 output tokens. */
  outputPerMTok: number;
}

export const MODEL_PRICES: Record<string, ModelPrice> = {
  // --- Amazon Bedrock (anthropic.* prefixed model IDs) ---
  "anthropic.claude-3-5-haiku-20241022-v1:0": { inputPerMTok: 0.8, outputPerMTok: 4.0 },
  "anthropic.claude-sonnet-5": { inputPerMTok: 3.0, outputPerMTok: 15.0 },
  "anthropic.claude-opus-5": { inputPerMTok: 5.0, outputPerMTok: 25.0 },
  "anthropic.claude-haiku-4-5": { inputPerMTok: 1.0, outputPerMTok: 5.0 },

  // --- Anthropic first-party API (bare model IDs) ---
  "claude-sonnet-5": { inputPerMTok: 3.0, outputPerMTok: 15.0 },
  "claude-opus-5": { inputPerMTok: 5.0, outputPerMTok: 25.0 },
  "claude-haiku-4-5": { inputPerMTok: 1.0, outputPerMTok: 5.0 },
};

/**
 * Cost in USD for the given token counts at `modelId`'s rate, or `null` when
 * the model has no price entry (see module doc — this must never throw).
 */
export function computeCostUsd(
  modelId: string,
  inputTokens: number,
  outputTokens: number,
): number | null {
  const price = MODEL_PRICES[modelId];
  if (!price) return null;
  return (
    (inputTokens / 1_000_000) * price.inputPerMTok +
    (outputTokens / 1_000_000) * price.outputPerMTok
  );
}
