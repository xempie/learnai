/**
 * Exponential-backoff retry wrapper. §12/T08: "retry with backoff" on
 * 429/throttling/5xx — 2 retries (3 attempts total), classification is
 * provider-specific (see BedrockLlmClient.isRetryable /
 * AnthropicLlmClient.isRetryable).
 */
export interface RetryOptions {
  /** Number of retries AFTER the first attempt. Default 2 (3 attempts total). */
  maxRetries?: number;
  /** Base delay in ms; attempt N waits baseDelayMs * 2^N. Default 200ms. */
  baseDelayMs?: number;
  /** Injectable so tests don't sleep for real. */
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export async function withRetry<T>(
  fn: () => Promise<T>,
  isRetryable: (err: unknown) => boolean,
  opts: RetryOptions = {},
): Promise<T> {
  const maxRetries = opts.maxRetries ?? 2;
  const baseDelayMs = opts.baseDelayMs ?? 200;
  const sleep = opts.sleep ?? defaultSleep;

  for (let attempt = 0; ; attempt += 1) {
    try {
      return await fn();
    } catch (err) {
      if (attempt >= maxRetries || !isRetryable(err)) {
        throw err;
      }
      await sleep(baseDelayMs * 2 ** attempt);
    }
  }
}
