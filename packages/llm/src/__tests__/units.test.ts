import { describe, expect, it, vi } from "vitest";
import { writeAgentRun } from "../agent-runs.js";
import { isValidJson, stripFences } from "../json.js";
import { computeCostUsd } from "../pricing.js";
import { withRetry } from "../retry.js";
import { FakePool } from "./fake-pool.js";

describe("pricing.computeCostUsd", () => {
  it("computes cost from a priced model's input/output rate", () => {
    // claude-sonnet-5: $3.00 / $15.00 per 1M tokens
    const cost = computeCostUsd("claude-sonnet-5", 1_000_000, 1_000_000);
    expect(cost).toBeCloseTo(18.0, 6);
  });

  it("returns null for an unpriced model rather than throwing", () => {
    expect(computeCostUsd("some-future-model-id", 100, 100)).toBeNull();
  });

  it("scales linearly with token count", () => {
    const cost = computeCostUsd("claude-haiku-4-5", 500_000, 0);
    expect(cost).toBeCloseTo(0.5, 6);
  });
});

describe("json.stripFences", () => {
  it("strips a ```json fenced block", () => {
    expect(stripFences('```json\n{"a":1}\n```')).toBe('{"a":1}');
  });

  it("strips a bare ``` fenced block", () => {
    expect(stripFences('```\n{"a":1}\n```')).toBe('{"a":1}');
  });

  it("leaves already-unfenced text alone (trimmed)", () => {
    expect(stripFences('  {"a":1}  ')).toBe('{"a":1}');
  });

  it("leaves non-JSON prose untouched (no stray fence to strip)", () => {
    expect(stripFences("not json")).toBe("not json");
  });
});

describe("json.isValidJson", () => {
  it("accepts valid JSON", () => {
    expect(isValidJson('{"a":1}')).toBe(true);
    expect(isValidJson("[1,2,3]")).toBe(true);
  });

  it("rejects malformed JSON", () => {
    expect(isValidJson("{a:1}")).toBe(false);
    expect(isValidJson("not json")).toBe(false);
  });
});

describe("agent-runs.writeAgentRun", () => {
  it("truncates error to 2000 chars before insert", async () => {
    const pool = new FakePool();
    await writeAgentRun(pool.asPool(), {
      agentName: "triage",
      modelId: "claude-sonnet-5",
      inputTokens: null,
      outputTokens: null,
      latencyMs: 5,
      costUsd: null,
      status: "error",
      error: "x".repeat(3000),
    });
    expect(pool.agentRuns[0]!.error).toHaveLength(2000);
  });

  it("stores a null error on success", async () => {
    const pool = new FakePool();
    await writeAgentRun(pool.asPool(), {
      agentName: "triage",
      modelId: "claude-sonnet-5",
      inputTokens: 10,
      outputTokens: 5,
      latencyMs: 5,
      costUsd: 0.001,
      status: "ok",
    });
    expect(pool.agentRuns[0]!.error).toBeNull();
  });
});

describe("retry.withRetry", () => {
  it("returns the first successful result without retrying", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    const result = await withRetry(fn, () => true, { baseDelayMs: 1 });
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries up to maxRetries times on a retryable error, then succeeds", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("fail 1"))
      .mockRejectedValueOnce(new Error("fail 2"))
      .mockResolvedValueOnce("ok");
    const result = await withRetry(fn, () => true, { maxRetries: 2, baseDelayMs: 1 });
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("throws after exhausting maxRetries", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("always fails"));
    await expect(withRetry(fn, () => true, { maxRetries: 2, baseDelayMs: 1 })).rejects.toThrow(
      "always fails",
    );
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("does not retry when the error is classified non-retryable", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("client error"));
    await expect(withRetry(fn, () => false, { maxRetries: 2, baseDelayMs: 1 })).rejects.toThrow(
      "client error",
    );
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("backs off exponentially between attempts", async () => {
    const sleeps: number[] = [];
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("1"))
      .mockRejectedValueOnce(new Error("2"))
      .mockResolvedValueOnce("ok");
    await withRetry(fn, () => true, {
      maxRetries: 2,
      baseDelayMs: 200,
      sleep: async (ms) => {
        sleeps.push(ms);
      },
    });
    expect(sleeps).toEqual([200, 400]);
  });
});
