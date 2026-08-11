import { describe, expect, it, vi } from "vitest";
import { DEFAULT_BATCH_SIZE, triageCandidates } from "../triage/triage-candidates.js";
import type { TriageCandidateInput } from "../triage/types.js";
import { FakeLlmClient } from "./fake-llm-client.js";
import { FakePool } from "./fake-pool.js";

function makeCandidates(n: number): TriageCandidateInput[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `cand-${i}`,
    title: `Fixture article ${i}`,
    excerpt: `Excerpt for fixture article ${i}.`,
    url: `https://example.test/articles/${i}`,
  }));
}

describe("triageCandidates", () => {
  it("scores a fixture batch of 20 candidates and persists triage_score/triage_reason/triage_vertical", async () => {
    const candidates = makeCandidates(20);
    const canned = candidates.map((c, i) => ({
      id: c.id,
      score: Number((i / 19).toFixed(3)),
      reason: `Reason for candidate ${i}`,
      vertical: "general" as const,
    }));
    const client = new FakeLlmClient([JSON.stringify(canned)]);
    const pool = new FakePool();

    const result = await triageCandidates(candidates, client, pool.asPool());

    expect(result.batchCount).toBe(1);
    expect(client.requests).toHaveLength(1);
    expect(result.scored).toHaveLength(20);
    expect(result.missingIds).toHaveLength(0);
    expect(result.unmatchedIds).toHaveLength(0);
    expect(result.invalidEntries).toBe(0);

    expect(pool.updates).toHaveLength(20);
    const first = pool.updates.find((u) => u.id === "cand-0");
    expect(first).toMatchObject({
      id: "cand-0",
      triage_score: 0,
      triage_reason: "Reason for candidate 0",
      triage_vertical: "general",
    });
  });

  it("splits more than the batch size (~20) into multiple LlmRequests, one per batch", async () => {
    const candidates = makeCandidates(DEFAULT_BATCH_SIZE + 5);
    const firstBatchResponse = candidates
      .slice(0, DEFAULT_BATCH_SIZE)
      .map((c) => ({ id: c.id, score: 0.5, reason: "ok", vertical: "general" as const }));
    const secondBatchResponse = candidates
      .slice(DEFAULT_BATCH_SIZE)
      .map((c) => ({ id: c.id, score: 0.5, reason: "ok", vertical: "general" as const }));
    const client = new FakeLlmClient([
      JSON.stringify(firstBatchResponse),
      JSON.stringify(secondBatchResponse),
    ]);
    const pool = new FakePool();

    const result = await triageCandidates(candidates, client, pool.asPool());

    expect(result.batchCount).toBe(2);
    expect(client.requests).toHaveLength(2);
    expect(result.scored).toHaveLength(DEFAULT_BATCH_SIZE + 5);
  });

  it("drops a malformed response entry (bad score, unknown vertical, missing field) and continues scoring the rest of the batch", async () => {
    const candidates = makeCandidates(4);
    const canned = [
      { id: "cand-0", score: 0.9, reason: "good entry", vertical: "general" },
      { id: "cand-1", score: 1.5, reason: "score out of range", vertical: "general" }, // invalid: score > 1
      { id: "cand-2", score: 0.5, reason: "bad vertical", vertical: "finance" }, // invalid: not in enum
      { id: "cand-3" }, // invalid: missing score/reason/vertical
    ];
    const client = new FakeLlmClient([JSON.stringify(canned)]);
    const pool = new FakePool();
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const result = await triageCandidates(candidates, client, pool.asPool());

    expect(result.scored).toHaveLength(1);
    expect(result.scored[0]?.id).toBe("cand-0");
    expect(result.invalidEntries).toBe(3);
    expect(result.missingIds.sort()).toEqual(["cand-1", "cand-2", "cand-3"]);
    expect(pool.updates).toHaveLength(1);
    expect(warnSpy).toHaveBeenCalled();

    warnSpy.mockRestore();
  });

  it("drops a response entry whose id does not belong to the batch and reports it as unmatched", async () => {
    const candidates = makeCandidates(2);
    const canned = [
      { id: "cand-0", score: 0.8, reason: "fine", vertical: "general" },
      { id: "not-in-this-batch", score: 0.8, reason: "fine", vertical: "general" },
    ];
    const client = new FakeLlmClient([JSON.stringify(canned)]);
    const pool = new FakePool();
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const result = await triageCandidates(candidates, client, pool.asPool());

    expect(result.scored.map((s) => s.id)).toEqual(["cand-0"]);
    expect(result.unmatchedIds).toEqual(["not-in-this-batch"]);
    expect(result.missingIds).toEqual(["cand-1"]);
    expect(pool.updates).toHaveLength(1);

    warnSpy.mockRestore();
  });

  it("truncates a reason longer than 15 words instead of rejecting the entry", async () => {
    const candidates = makeCandidates(1);
    const longReason = Array.from({ length: 30 }, (_, i) => `word${i}`).join(" ");
    const canned = [{ id: "cand-0", score: 0.5, reason: longReason, vertical: "general" }];
    const client = new FakeLlmClient([JSON.stringify(canned)]);
    const pool = new FakePool();

    const result = await triageCandidates(candidates, client, pool.asPool());

    expect(result.scored).toHaveLength(1);
    const words = result.scored[0]!.reason.replace(/…$/, "").trim().split(/\s+/);
    expect(words.length).toBeLessThanOrEqual(15);
  });

  it("rounds score to 3 decimal places", async () => {
    const candidates = makeCandidates(1);
    const canned = [{ id: "cand-0", score: 0.123456, reason: "ok", vertical: "general" }];
    const client = new FakeLlmClient([JSON.stringify(canned)]);
    const pool = new FakePool();

    const result = await triageCandidates(candidates, client, pool.asPool());

    expect(result.scored[0]?.score).toBe(0.123);
  });

  it("drops the whole batch (all ids reported missing) when the response is not valid JSON", async () => {
    const candidates = makeCandidates(2);
    const client = new FakeLlmClient(["not json at all"]);
    const pool = new FakePool();
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const result = await triageCandidates(candidates, client, pool.asPool());

    expect(result.scored).toHaveLength(0);
    expect(result.missingIds.sort()).toEqual(["cand-0", "cand-1"]);
    expect(pool.updates).toHaveLength(0);

    warnSpy.mockRestore();
  });

  it("drops the whole batch when the response is valid JSON but not an array", async () => {
    const candidates = makeCandidates(2);
    const client = new FakeLlmClient([JSON.stringify({ not: "an array" })]);
    const pool = new FakePool();
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const result = await triageCandidates(candidates, client, pool.asPool());

    expect(result.scored).toHaveLength(0);
    expect(result.missingIds.sort()).toEqual(["cand-0", "cand-1"]);

    warnSpy.mockRestore();
  });
});
