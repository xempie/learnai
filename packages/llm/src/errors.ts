/**
 * Thrown when a `responseFormat: 'json'` request still fails to parse after
 * the single corrective retry §12/T08 requires ("malformed JSON responses
 * retry once then fail cleanly"). `rawText` carries the fence-stripped text
 * from the failed retry attempt for caller-side logging/debugging — it is
 * NOT persisted verbatim to `agent_runs.error` (see agent-runs.ts, which
 * truncates to 2000 chars).
 */
export class LlmJsonError extends Error {
  readonly rawText: string;

  constructor(message: string, rawText: string) {
    super(message);
    this.name = "LlmJsonError";
    this.rawText = rawText;
  }
}
