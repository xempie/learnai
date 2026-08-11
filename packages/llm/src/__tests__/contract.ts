import { describe, expect, it } from "vitest";
import { LlmJsonError } from "../errors.js";
import type { LlmClient } from "../types.js";
import type { FakePool } from "./fake-pool.js";

/**
 * One entry consumed per underlying transport call — including throttling
 * retries and the JSON corrective retry, so a script of length N means the
 * fake transport is called exactly N times before either succeeding or
 * exhausting the script.
 */
export type ScriptStep =
  | { kind: "text"; text: string; inputTokens: number; outputTokens: number }
  | { kind: "throttle" } // retryable: 429 / ThrottlingException
  | { kind: "server-error" } // retryable: 5xx
  | { kind: "client-error" }; // NOT retryable: 4xx other than 429

export interface ContractHarness {
  /** Human label for the describe block, e.g. "BedrockLlmClient". */
  name: string;
  /**
   * Build an `LlmClient` wired to a fake transport driven by `script`.
   * `pool` is the `FakePool` the client's `agent_runs` writes land in.
   * `callCount()` reports how many times the fake transport itself was
   * invoked (distinct from how many times `.complete()` was called).
   */
  makeClient(
    script: ScriptStep[],
    opts?: { retry?: { maxRetries?: number; baseDelayMs?: number } },
  ): { client: LlmClient; pool: FakePool; callCount: () => number };
}

/**
 * §12/T08 acceptance: "both implementations pass the same contract test
 * suite; every call writes an agent_runs row; malformed JSON responses
 * retry once then fail cleanly." This function is that one suite — each
 * provider's own test file supplies a `ContractHarness` translating the
 * provider-agnostic `ScriptStep` script into its own transport's real
 * request/response shape, so the SAME assertions exercise BedrockLlmClient
 * and AnthropicLlmClient end to end (minus the actual AWS/Anthropic call).
 *
 * Entirely non-DB — every assertion reads back from the injected FakePool,
 * per the "non-DB contract tests must run locally" requirement. The real
 * Postgres write path is covered once, generically, in
 * agent-runs.integration.test.ts (skip-locally/run-in-CI).
 */
export function describeLlmClientContract(harness: ContractHarness): void {
  describe(`${harness.name} contract`, () => {
    it("happy path: returns text/tokens/modelId/latency, calling the transport once", async () => {
      const { client, callCount } = harness.makeClient([
        { kind: "text", text: "hello world", inputTokens: 10, outputTokens: 5 },
      ]);

      const res = await client.complete({
        system: "sys",
        messages: [{ role: "user", content: "hi" }],
        maxTokens: 100,
      });

      expect(res.text).toBe("hello world");
      expect(res.inputTokens).toBe(10);
      expect(res.outputTokens).toBe(5);
      expect(res.modelId).toBeTruthy();
      expect(res.latencyMs).toBeGreaterThanOrEqual(0);
      expect(callCount()).toBe(1);
    });

    it("token accounting: agent_runs row records the exact token counts and a computed cost", async () => {
      const { client, pool } = harness.makeClient([
        { kind: "text", text: "ok", inputTokens: 1000, outputTokens: 2000 },
      ]);

      await client.complete({
        system: "s",
        messages: [{ role: "user", content: "x" }],
        maxTokens: 10,
      });

      expect(pool.agentRuns).toHaveLength(1);
      const row = pool.agentRuns[0]!;
      expect(row.status).toBe("ok");
      expect(row.input_tokens).toBe(1000);
      expect(row.output_tokens).toBe(2000);
      expect(row.cost_usd).not.toBeNull();
      expect(row.cost_usd).toBeGreaterThan(0);
      expect(row.latency_ms).toBeGreaterThanOrEqual(0);
      expect(row.error).toBeNull();
    });

    it("retries on throttling (backoff) and succeeds once the transport recovers", async () => {
      const { client, callCount } = harness.makeClient(
        [
          { kind: "throttle" },
          { kind: "throttle" },
          { kind: "text", text: "recovered", inputTokens: 1, outputTokens: 1 },
        ],
        { retry: { baseDelayMs: 1 } },
      );

      const res = await client.complete({
        system: "s",
        messages: [{ role: "user", content: "x" }],
        maxTokens: 10,
      });

      expect(res.text).toBe("recovered");
      expect(callCount()).toBe(3);
    });

    it("gives up after 2 retries (3 attempts total) on sustained throttling/5xx and logs an error row", async () => {
      const { client, pool, callCount } = harness.makeClient(
        [{ kind: "throttle" }, { kind: "server-error" }, { kind: "throttle" }],
        { retry: { baseDelayMs: 1 } },
      );

      await expect(
        client.complete({ system: "s", messages: [{ role: "user", content: "x" }], maxTokens: 10 }),
      ).rejects.toThrow();

      expect(callCount()).toBe(3);
      expect(pool.agentRuns).toHaveLength(1);
      expect(pool.agentRuns[0]!.status).toBe("error");
      expect(pool.agentRuns[0]!.input_tokens).toBeNull();
    });

    it("does not retry a non-retryable client error", async () => {
      const { client, pool, callCount } = harness.makeClient([{ kind: "client-error" }], {
        retry: { baseDelayMs: 1 },
      });

      await expect(
        client.complete({ system: "s", messages: [{ role: "user", content: "x" }], maxTokens: 10 }),
      ).rejects.toThrow();

      expect(callCount()).toBe(1);
      expect(pool.agentRuns[0]!.status).toBe("error");
    });

    it("json mode: strips markdown fences and returns parseable JSON text", async () => {
      const { client, callCount } = harness.makeClient([
        { kind: "text", text: '```json\n{"a":1}\n```', inputTokens: 3, outputTokens: 4 },
      ]);

      const res = await client.complete({
        system: "s",
        messages: [{ role: "user", content: "x" }],
        maxTokens: 10,
        responseFormat: "json",
      });

      expect(res.text).toBe('{"a":1}');
      expect(() => JSON.parse(res.text)).not.toThrow();
      expect(callCount()).toBe(1);
    });

    it("json mode: malformed JSON retries once with a corrective user message, then succeeds", async () => {
      const { client, callCount } = harness.makeClient([
        { kind: "text", text: "not json at all", inputTokens: 5, outputTokens: 5 },
        { kind: "text", text: '{"fixed":true}', inputTokens: 6, outputTokens: 6 },
      ]);

      const res = await client.complete({
        system: "s",
        messages: [{ role: "user", content: "x" }],
        maxTokens: 10,
        responseFormat: "json",
      });

      expect(res.text).toBe('{"fixed":true}');
      // Both attempts cost real tokens — the response accounts for both.
      expect(res.inputTokens).toBe(11);
      expect(res.outputTokens).toBe(11);
      expect(callCount()).toBe(2);
    });

    it("json mode: malformed JSON on both attempts throws LlmJsonError and still logs an agent_runs error row", async () => {
      const { client, pool, callCount } = harness.makeClient([
        { kind: "text", text: "nope", inputTokens: 1, outputTokens: 1 },
        { kind: "text", text: "still nope", inputTokens: 1, outputTokens: 1 },
      ]);

      await expect(
        client.complete({
          system: "s",
          messages: [{ role: "user", content: "x" }],
          maxTokens: 10,
          responseFormat: "json",
        }),
      ).rejects.toBeInstanceOf(LlmJsonError);

      // Exactly one corrective retry — not a throttle-style backoff loop.
      expect(callCount()).toBe(2);
      expect(pool.agentRuns).toHaveLength(1);
      expect(pool.agentRuns[0]!.status).toBe("error");
      expect(pool.agentRuns[0]!.error).toContain("malformed JSON");
    });

    it("writes exactly one agent_runs row per complete() call", async () => {
      const { client, pool } = harness.makeClient([
        { kind: "text", text: "hi", inputTokens: 1, outputTokens: 1 },
        { kind: "text", text: "there", inputTokens: 1, outputTokens: 1 },
      ]);

      await client.complete({
        system: "s",
        messages: [{ role: "user", content: "x" }],
        maxTokens: 10,
      });
      await client.complete({
        system: "s",
        messages: [{ role: "user", content: "y" }],
        maxTokens: 10,
      });

      expect(pool.agentRuns).toHaveLength(2);
      for (const row of pool.agentRuns) {
        expect(row.agent_name).toBeTruthy();
        expect(row.model_id).toBeTruthy();
      }
    });
  });
}
