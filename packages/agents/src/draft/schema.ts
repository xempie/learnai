import { z } from "zod";
import { VERTICALS } from "../triage/types.js";

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
 */
export const DraftSuccessShapeSchema = z.object({
  title: z.string().min(1),
  summary: z.string().min(1),
  body_md: z.string().min(1),
  vertical: z.enum(VERTICALS),
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
