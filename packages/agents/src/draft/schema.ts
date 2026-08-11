import { z } from "zod";

const SUMMARY_MAX_LENGTH = 200;

/**
 * §5.3's success response shape:
 *   {"title":"...","summary":"<=200 chars","body_md":"...","vertical":"...","source_url":"..."}
 *
 * Split into a "shape" schema (fields present, right types, `summary`
 * length UNconstrained) and the full schema (shape + the <=200 length
 * rule) so `draftItem` can tell apart two different failure modes that get
 * different treatment per the §12/T10 controller decision: a `summary`
 * that is otherwise-valid-JSON-but-too-long triggers one specific
 * "shorten it" regenerate, while a response that doesn't even match the
 * shape (missing/wrong-typed fields) gets a generic "match the shape"
 * regenerate. Both give up (throw `DraftValidationError`) after exactly
 * one regenerate attempt — "regenerates once then fails cleanly".
 *
 * `vertical` is deliberately validated as "any non-empty string" HERE, not
 * `z.enum(VERTICALS)` — unlike §5.2's triage prompt, the verbatim §5.3
 * prompt never tells the model the closed vertical vocabulary (its
 * `"vertical":"..."` in the example response is just a placeholder), and a
 * live Bedrock smoke run confirmed the model will happily invent a value
 * outside the enum (e.g. `"tools"`) for content that doesn't fit neatly.
 * Since NON-NEGOTIABLE forbids editing the prompt to add the vocabulary,
 * treating that as a fatal shape violation would routinely burn the one
 * regenerate attempt and throw on perfectly good drafts. `draftItem`
 * normalises an out-of-enum value instead (falls back to the candidate's
 * own `sourceVertical`, then `'general'`) — title/body_md/source_url stay
 * strict non-empty-string checks, since those the model has no excuse to
 * get wrong.
 */
export const DraftSuccessShapeSchema = z.object({
  title: z.string().min(1),
  summary: z.string().min(1),
  body_md: z.string().min(1),
  vertical: z.string().min(1),
  source_url: z.string().min(1),
});
export type DraftSuccessShape = z.infer<typeof DraftSuccessShapeSchema>;

export const DraftSuccessSchema = DraftSuccessShapeSchema.extend({
  summary: z.string().min(1).max(SUMMARY_MAX_LENGTH),
});

/** §5.3's refusal shape: `{"error":"insufficient_source","detail":"..."}`. */
export const DraftRefusalSchema = z.object({
  error: z.literal("insufficient_source"),
  detail: z.string().min(1),
});
export type DraftRefusalResponse = z.infer<typeof DraftRefusalSchema>;

export { SUMMARY_MAX_LENGTH };
