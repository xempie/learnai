/**
 * §2.3 contract — implemented verbatim from LEARN_AI_V1_BUILD_SPEC.md.
 * `LlmClient` is the abstraction every agent (triage, draft, ...) codes
 * against; the concrete provider (`BedrockLlmClient` / `AnthropicLlmClient`,
 * selected by `LLM_PROVIDER`) is an implementation detail behind it.
 */

export interface LlmMessage {
  role: "user" | "assistant";
  content: string;
}

export interface LlmRequest {
  system: string;
  messages: LlmMessage[];
  maxTokens: number;
  temperature?: number;
  responseFormat?: "text" | "json";
}

export interface LlmResponse {
  text: string;
  inputTokens: number;
  outputTokens: number;
  modelId: string;
  latencyMs: number;
}

export interface LlmClient {
  complete(req: LlmRequest): Promise<LlmResponse>;
}
