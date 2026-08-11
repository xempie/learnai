import { z } from "zod";
import { VERTICALS } from "./types.js";

/**
 * §5.2's response shape:
 *   [{"id":"<candidate id>","score":0.000,"reason":"<max 15 words>","vertical":"..."}]
 *
 * Deliberately permissive on `score`'s exact decimal precision and
 * `reason`'s exact word count — the prompt asks the model for 3 decimals
 * and <=15 words, but models don't always comply exactly. Per the T09
 * controller decision ("score 0-1 with 3 decimals; reason <=15 words
 * tolerated loosely — truncate") this schema validates the *shape*
 * (score is a number in [0,1], reason is a non-empty string, vertical is
 * one of the enum) and `normaliseEntry` (triage-candidates.ts) does the
 * rounding/truncation. What this schema does reject as invalid: missing
 * fields, wrong types, an out-of-range score, or an unknown vertical.
 */
export const TriageEntrySchema = z.object({
  id: z.string().min(1),
  score: z.number().min(0).max(1),
  reason: z.string().min(1),
  vertical: z.enum(VERTICALS),
});

export type TriageEntry = z.infer<typeof TriageEntrySchema>;

/** The raw parsed JSON value must at least be an array before per-entry
 * validation is worth attempting. */
export const TriageResponseArraySchema = z.array(z.unknown());
