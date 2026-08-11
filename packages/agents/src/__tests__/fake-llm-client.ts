import type { LlmClient, LlmRequest, LlmResponse } from "@learn-ai/llm";

/**
 * In-process `LlmClient` stand-in for triage unit tests — the T09
 * controller decision's "FakeTransport (canned JSON)" seam, applied at the
 * `LlmClient` level (the interface `triageCandidates` actually depends on)
 * rather than re-driving a specific provider's wire transport, which T08's
 * own contract suite (packages/llm/src/__tests__/contract.ts) already
 * covers exhaustively for both providers.
 *
 * Scripted by a queue of canned response texts, one per `complete()` call
 * (one call per batch) — a test with N candidate batches supplies N
 * scripted responses. Records every request it was asked to serve so tests
 * can assert on batching (how many requests, what candidates were in each).
 */
export class FakeLlmClient implements LlmClient {
  readonly requests: LlmRequest[] = [];
  private readonly responses: string[];
  private cursor = 0;

  constructor(responses: string[]) {
    this.responses = responses;
  }

  async complete(req: LlmRequest): Promise<LlmResponse> {
    this.requests.push(req);
    const text = this.responses[this.cursor];
    if (text === undefined) {
      throw new Error(
        `FakeLlmClient: complete() called ${this.cursor + 1} times but only ` +
          `${this.responses.length} canned responses were supplied`,
      );
    }
    this.cursor += 1;
    return {
      text,
      inputTokens: 10,
      outputTokens: 10,
      modelId: "fake-model",
      latencyMs: 1,
      agentRunId: `fake-agent-run-${this.cursor}`,
    };
  }
}
