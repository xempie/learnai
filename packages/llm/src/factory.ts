import type { Pool } from "@learn-ai/db";
import { AnthropicLlmClient } from "./anthropic-client.js";
import { BedrockLlmClient } from "./bedrock-client.js";
import type { LlmClient } from "./types.js";

export interface CreateLlmClientOptions {
  /** Written to every `agent_runs` row (§3.7: 'triage' | 'draft' | ...). */
  agentName: string;
  /** Step Functions execution ARN, when called from within a state machine. */
  executionArn?: string;
  pool: Pool;
}

/**
 * §2.3: select the concrete `LlmClient` implementation by `LLM_PROVIDER`
 * ('bedrock' | 'anthropic'), defaulting to Bedrock per AGENTS.md's locked
 * default. Callers (T09 triage, T10 draft, ...) depend only on `LlmClient`
 * — never on `BedrockLlmClient`/`AnthropicLlmClient` directly — so swapping
 * providers is a `LLM_PROVIDER` env change, not a code change.
 */
export function createLlmClient(opts: CreateLlmClientOptions): LlmClient {
  const provider = (process.env.LLM_PROVIDER ?? "bedrock").trim().toLowerCase();
  switch (provider) {
    case "bedrock":
      return new BedrockLlmClient(opts);
    case "anthropic":
      return new AnthropicLlmClient(opts);
    default:
      throw new Error(
        `Unknown LLM_PROVIDER "${provider}" — expected "bedrock" or "anthropic" (§9).`,
      );
  }
}
