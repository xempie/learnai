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
  /** The `agent_runs.id` of the row `BaseLlmClient.complete()` wrote for this
   * call (§3.7). T10's draft agent needs this to populate
   * `content_items.agent_run_id` on the item it produces — a small
   * T08-compatible addition (§12/T10 controller decision): `writeAgentRun`
   * already generates this id application-side (`newId()`, before the
   * INSERT), so surfacing it here on the success path costs nothing extra. */
  agentRunId: string;
}

export interface LlmClient {
  complete(req: LlmRequest): Promise<LlmResponse>;
}
