import type { Pool } from "@learn-ai/db";
import { writeAgentRun } from "./agent-runs.js";
import { LlmJsonError } from "./errors.js";
import { isValidJson, stripFences } from "./json.js";
import { computeCostUsd } from "./pricing.js";
import { withRetry, type RetryOptions } from "./retry.js";
import type { LlmClient, LlmRequest, LlmResponse } from "./types.js";

/** One raw model call's result — before JSON-mode post-processing. */
export interface RawCompletion {
  text: string;
  inputTokens: number;
  outputTokens: number;
  /** The exact model ID that served the request, per the provider's response
   * where it echoes one (Anthropic); falls back to the configured model ID
   * for providers whose response doesn't carry it (Bedrock Converse). */
  modelId: string;
}

export interface BaseLlmClientOptions {
  /** Written to every `agent_runs` row (§3.7: 'triage' | 'draft' | ...). */
  agentName: string;
  /** Step Functions execution ARN, when called from within a state machine. */
  executionArn?: string;
  /** DB pool `agent_runs` rows are written through. */
  pool: Pool;
  /** The model ID this client instance is configured to call. */
  modelId: string;
  retry?: RetryOptions;
}

const CORRECTIVE_JSON_MESSAGE =
  "Your previous response was not valid JSON. Respond again with ONLY a valid JSON value " +
  "matching the requested shape — no markdown code fences, no commentary before or after it.";

/**
 * Shared `LlmClient` orchestration: retry-with-backoff around each raw
 * provider call, JSON-mode fence-stripping + single corrective retry, and
 * unconditional `agent_runs` logging (§12/T08 acceptance: "every call
 * writes an agent_runs row"; "malformed JSON responses retry once then
 * fail cleanly"). Subclasses (`BedrockLlmClient`, `AnthropicLlmClient`)
 * only implement the provider-specific request/response mapping
 * (`invoke`) and retryability classification (`isRetryable`).
 */
export abstract class BaseLlmClient implements LlmClient {
  protected readonly agentName: string;
  protected readonly executionArn?: string;
  protected readonly pool: Pool;
  protected readonly modelId: string;
  private readonly retryOptions?: RetryOptions;

  constructor(opts: BaseLlmClientOptions) {
    this.agentName = opts.agentName;
    this.executionArn = opts.executionArn;
    this.pool = opts.pool;
    this.modelId = opts.modelId;
    this.retryOptions = opts.retry;
  }

  /** Perform exactly one provider call attempt. Called under `withRetry`. */
  protected abstract invoke(req: LlmRequest): Promise<RawCompletion>;

  /** True when `err` (thrown by `invoke`) is a 429/throttling/5xx that
   * warrants a backoff-and-retry rather than an immediate failure. */
  protected abstract isRetryable(err: unknown): boolean;

  async complete(req: LlmRequest): Promise<LlmResponse> {
    const start = Date.now();
    try {
      const result = await this.completeWithJsonHandling(req);
      const latencyMs = Date.now() - start;
      const agentRunId = await writeAgentRun(this.pool, {
        agentName: this.agentName,
        executionArn: this.executionArn,
        modelId: result.modelId,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        latencyMs,
        costUsd: computeCostUsd(result.modelId, result.inputTokens, result.outputTokens),
        status: "ok",
      });
      return { ...result, latencyMs, agentRunId };
    } catch (err) {
      const latencyMs = Date.now() - start;
      await writeAgentRun(this.pool, {
        agentName: this.agentName,
        executionArn: this.executionArn,
        modelId: this.modelId,
        inputTokens: null,
        outputTokens: null,
        latencyMs,
        costUsd: null,
        status: "error",
        error: describeError(err),
      });
      throw err;
    }
  }

  private async callWithRetry(req: LlmRequest): Promise<RawCompletion> {
    return withRetry(
      () => this.invoke(req),
      (err) => this.isRetryable(err),
      this.retryOptions,
    );
  }

  private async completeWithJsonHandling(req: LlmRequest): Promise<RawCompletion> {
    const first = await this.callWithRetry(req);
    if (req.responseFormat !== "json") {
      return first;
    }

    const strippedFirst = stripFences(first.text);
    if (isValidJson(strippedFirst)) {
      return { ...first, text: strippedFirst };
    }

    // Malformed JSON — one corrective retry with an appended user message,
    // per §12/T08 acceptance. Not a retry of the same request: the model's
    // own (invalid) reply is echoed back as an assistant turn so it can see
    // and correct what it got wrong.
    const correctiveReq: LlmRequest = {
      ...req,
      messages: [
        ...req.messages,
        { role: "assistant", content: first.text },
        { role: "user", content: CORRECTIVE_JSON_MESSAGE },
      ],
    };
    const second = await this.callWithRetry(correctiveReq);
    const strippedSecond = stripFences(second.text);
    if (!isValidJson(strippedSecond)) {
      throw new LlmJsonError(
        "LLM returned malformed JSON after one corrective retry",
        strippedSecond,
      );
    }

    return {
      text: strippedSecond,
      inputTokens: first.inputTokens + second.inputTokens,
      outputTokens: first.outputTokens + second.outputTokens,
      modelId: second.modelId,
    };
  }
}

function describeError(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
