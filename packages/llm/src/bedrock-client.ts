import {
  BedrockRuntimeClient,
  ConverseCommand,
  type ConverseCommandInput,
  type ConverseCommandOutput,
} from "@aws-sdk/client-bedrock-runtime";
import { BaseLlmClient, type BaseLlmClientOptions, type RawCompletion } from "./base-client.js";
import type { LlmRequest } from "./types.js";

/** ap-southeast-2, same region as the rest of the stack (§2.3 recommended
 * default) — keeps Bedrock credentials in the same IAM/region boundary as
 * everything else instead of introducing a second region to reason about. */
export const DEFAULT_BEDROCK_REGION = "ap-southeast-2";

/**
 * A cheap default, per the T08 controller decision — Bedrock model access
 * is founder-tunable via `BEDROCK_MODEL_ID` without a code change. If this
 * exact model is retired on Bedrock before the env var is updated, requests
 * fail with a clear `ValidationException` from AWS naming the bad model ID.
 */
export const DEFAULT_BEDROCK_MODEL_ID = "anthropic.claude-3-5-haiku-20241022-v1:0";

/** The low-level "make the real AWS call" seam. Defaults to an actual
 * `BedrockRuntimeClient.send(new ConverseCommand(...))`; tests inject a
 * fake to drive the contract suite without touching AWS. */
export type BedrockTransport = (input: ConverseCommandInput) => Promise<ConverseCommandOutput>;

export interface BedrockLlmClientOptions extends Omit<BaseLlmClientOptions, "modelId"> {
  region?: string;
  modelId?: string;
  transport?: BedrockTransport;
}

/** AWS error shapes seen from Bedrock throttling/overload — `.name` is set
 * by the modeled Smithy exception classes; `$metadata.httpStatusCode` is
 * always present as a fallback for anything not individually modeled. */
const RETRYABLE_BEDROCK_ERROR_NAMES = new Set([
  "ThrottlingException",
  "ServiceUnavailableException",
  "ModelTimeoutException",
  "ModelNotReadyException",
  "InternalServerException",
]);

export class BedrockLlmClient extends BaseLlmClient {
  private readonly transport: BedrockTransport;

  constructor(opts: BedrockLlmClientOptions) {
    const modelId = opts.modelId ?? process.env.BEDROCK_MODEL_ID ?? DEFAULT_BEDROCK_MODEL_ID;
    super({
      agentName: opts.agentName,
      executionArn: opts.executionArn,
      pool: opts.pool,
      modelId,
      retry: opts.retry,
    });
    this.transport =
      opts.transport ??
      createDefaultTransport(opts.region ?? process.env.BEDROCK_REGION ?? DEFAULT_BEDROCK_REGION);
  }

  protected isRetryable(err: unknown): boolean {
    if (!err || typeof err !== "object") return false;
    const name = (err as { name?: unknown }).name;
    if (typeof name === "string" && RETRYABLE_BEDROCK_ERROR_NAMES.has(name)) return true;
    const status = (err as { $metadata?: { httpStatusCode?: unknown } }).$metadata?.httpStatusCode;
    return typeof status === "number" && (status === 429 || status >= 500);
  }

  protected async invoke(req: LlmRequest): Promise<RawCompletion> {
    const input: ConverseCommandInput = {
      modelId: this.modelId,
      system: [{ text: req.system }],
      messages: req.messages.map((m) => ({ role: m.role, content: [{ text: m.content }] })),
      inferenceConfig: {
        maxTokens: req.maxTokens,
        temperature: req.temperature,
      },
    };
    const output = await this.transport(input);
    return {
      text: extractText(output),
      inputTokens: output.usage?.inputTokens ?? 0,
      outputTokens: output.usage?.outputTokens ?? 0,
      // Converse doesn't echo the model ID back — the configured one is the
      // only one there is.
      modelId: this.modelId,
    };
  }
}

function extractText(output: ConverseCommandOutput): string {
  const blocks = output.output?.message?.content ?? [];
  return blocks.map((block) => block.text ?? "").join("");
}

function createDefaultTransport(region: string): BedrockTransport {
  const client = new BedrockRuntimeClient({ region });
  return (input) => client.send(new ConverseCommand(input));
}
