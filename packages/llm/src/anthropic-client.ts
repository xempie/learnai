import Anthropic from "@anthropic-ai/sdk";
import type {
  Message,
  MessageCreateParamsNonStreaming,
} from "@anthropic-ai/sdk/resources/messages";
import { BaseLlmClient, type BaseLlmClientOptions, type RawCompletion } from "./base-client.js";
import type { LlmRequest } from "./types.js";

/**
 * The swappable alternative to Bedrock (§2.3). Default model per the T08
 * controller decision: Claude Sonnet 5, the current `@anthropic-ai/sdk`
 * model ID (no date suffix — see the SDK's own `Model` union). Founder-
 * tunable via `ANTHROPIC_MODEL_ID` without a code change.
 */
export const DEFAULT_ANTHROPIC_MODEL_ID = "claude-sonnet-5";

/** The low-level "make the real Anthropic API call" seam. Defaults to an
 * actual `client.messages.create(...)`; tests inject a fake to drive the
 * contract suite without a network call. */
export type AnthropicTransport = (params: MessageCreateParamsNonStreaming) => Promise<Message>;

export interface AnthropicLlmClientOptions extends Omit<BaseLlmClientOptions, "modelId"> {
  apiKey?: string;
  modelId?: string;
  transport?: AnthropicTransport;
}

export class AnthropicLlmClient extends BaseLlmClient {
  private readonly transport: AnthropicTransport;

  constructor(opts: AnthropicLlmClientOptions) {
    const modelId = opts.modelId ?? process.env.ANTHROPIC_MODEL_ID ?? DEFAULT_ANTHROPIC_MODEL_ID;
    super({
      agentName: opts.agentName,
      executionArn: opts.executionArn,
      pool: opts.pool,
      modelId,
      retry: opts.retry,
    });
    this.transport =
      opts.transport ?? createDefaultTransport(opts.apiKey ?? process.env.ANTHROPIC_API_KEY);
  }

  protected isRetryable(err: unknown): boolean {
    const status = (err as { status?: unknown } | null | undefined)?.status;
    // 429 (rate_limit_error / throttling) and any 5xx (api_error,
    // overloaded_error 529 included since 529 >= 500).
    return typeof status === "number" && (status === 429 || status >= 500);
  }

  protected async invoke(req: LlmRequest): Promise<RawCompletion> {
    const params: MessageCreateParamsNonStreaming = {
      model: this.modelId,
      max_tokens: req.maxTokens,
      system: req.system,
      temperature: req.temperature,
      messages: req.messages.map((m) => ({ role: m.role, content: m.content })),
    };
    const response = await this.transport(params);
    const text = response.content
      .filter((block): block is Extract<typeof block, { type: "text" }> => block.type === "text")
      .map((block) => block.text)
      .join("");
    return {
      text,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      // Anthropic echoes the exact model that served the request.
      modelId: response.model,
    };
  }
}

function createDefaultTransport(apiKey: string | undefined): AnthropicTransport {
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set. Required when LLM_PROVIDER=anthropic (or when " +
        "constructing AnthropicLlmClient directly without an injected transport).",
    );
  }
  const client = new Anthropic({ apiKey });
  return (params) => client.messages.create(params);
}
