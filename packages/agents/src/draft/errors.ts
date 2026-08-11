/**
 * Thrown when `draftItem`'s response still fails validation (wrong shape,
 * or `summary` still >200 chars) after the one regenerate attempt §12/T10
 * calls for ("validation regenerates once then fails cleanly"). `rawText`
 * carries the fence-stripped text of the failed second attempt, for
 * caller-side logging — mirrors `@learn-ai/llm`'s `LlmJsonError` shape.
 */
export class DraftValidationError extends Error {
  readonly rawText: string;

  constructor(message: string, rawText: string) {
    super(message);
    this.name = "DraftValidationError";
    this.rawText = rawText;
  }
}
