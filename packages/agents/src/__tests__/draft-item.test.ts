import { describe, expect, it } from "vitest";
import { DraftValidationError } from "../draft/errors.js";
import { draftItem } from "../draft/draft-item.js";
import type { DraftCandidateInput, DraftItemInput } from "../draft/types.js";
import { FakeLlmClient } from "./fake-llm-client.js";

function makeCandidate(overrides: Partial<DraftCandidateInput> = {}): DraftCandidateInput {
  return {
    id: "cand-1",
    title: "New ChatGPT feature turns any webpage into a checklist",
    url: "https://example.test/articles/checklist-feature",
    excerpt: "OpenAI added a 'convert to checklist' action for pasted webpage text.",
    raw: { published: "2026-08-01" },
    sourceId: "source-1",
    sourceTier: 1,
    sourceVertical: "general",
    ...overrides,
  };
}

const VALID_NEWS_RESPONSE = JSON.stringify({
  title: "OpenAI adds one-click checklist conversion to ChatGPT",
  summary: "ChatGPT can now turn any pasted webpage into a numbered checklist in one prompt.",
  body_md:
    "OpenAI shipped a new action in ChatGPT that converts pasted webpage text into a " +
    "numbered checklist in under 10 seconds. For busy professionals, this means turning a " +
    "long policy page or meeting notes into an actionable list without manual formatting.",
  vertical: "general",
  source_url: "https://example.test/articles/checklist-feature",
});

describe("draftItem", () => {
  for (const kind of ["news", "technique", "video"] as const) {
    it(`produces a valid content_items-shaped draft for kind=${kind}`, async () => {
      const client = new FakeLlmClient([VALID_NEWS_RESPONSE]);
      const input: DraftItemInput = { candidate: makeCandidate(), kind };

      const result = await draftItem(input, client);

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.item).toMatchObject({
        title: "OpenAI adds one-click checklist conversion to ChatGPT",
        slug: "openai-adds-one-click-checklist-conversion-to-chatgpt",
        vertical: "general",
        kind,
        sourceUrl: "https://example.test/articles/checklist-feature",
        sourceId: "source-1",
        sourceTier: 1,
        status: "in_review",
        authorKind: "agent",
        isPremium: false,
        videoUrl: null,
      });
      expect(result.item.summary.length).toBeLessThanOrEqual(200);
      expect(result.item.agentRunId).toBeTruthy();
      expect(client.requests).toHaveLength(1);
      expect(client.requests[0]?.responseFormat).toBe("json");
    });
  }

  it("sends the candidate's title/excerpt/url/raw content and the requested kind in the user message", async () => {
    const client = new FakeLlmClient([VALID_NEWS_RESPONSE]);
    const candidate = makeCandidate({ excerpt: "specific excerpt text" });
    await draftItem({ candidate, kind: "technique" }, client);

    const sent = JSON.parse(client.requests[0]!.messages[0]!.content);
    expect(sent).toMatchObject({
      kind: "technique",
      title: candidate.title,
      url: candidate.url,
      excerpt: "specific excerpt text",
      raw: candidate.raw,
    });
  });

  it("appends reviewer notes to the user message when provided (§5.1 redraft loop)", async () => {
    const client = new FakeLlmClient([VALID_NEWS_RESPONSE]);
    await draftItem(
      { candidate: makeCandidate(), kind: "news", reviewerNotes: "Please cite the exact date." },
      client,
    );

    expect(client.requests[0]!.messages[0]!.content).toContain(
      "Reviewer requested changes: Please cite the exact date.",
    );
  });

  it("returns a typed insufficient_source refusal instead of throwing on a deliberately thin source", async () => {
    const refusal = JSON.stringify({
      error: "insufficient_source",
      detail: "No primary source URL or verifiable claim in the excerpt.",
    });
    const client = new FakeLlmClient([refusal]);

    const result = await draftItem({ candidate: makeCandidate(), kind: "news" }, client);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("insufficient_source");
    expect(result.detail).toBe("No primary source URL or verifiable claim in the excerpt.");
    expect(client.requests).toHaveLength(1); // no regenerate for a well-formed refusal
  });

  it("regenerates once when summary is >200 chars, then succeeds if the retry fixes it", async () => {
    const tooLong = JSON.stringify({
      title: "Title",
      summary: "x".repeat(250),
      body_md: "Body content here.",
      vertical: "general",
      source_url: "https://example.test/a",
    });
    const fixed = JSON.stringify({
      title: "Title",
      summary: "x".repeat(150),
      body_md: "Body content here.",
      vertical: "general",
      source_url: "https://example.test/a",
    });
    const client = new FakeLlmClient([tooLong, fixed]);

    const result = await draftItem({ candidate: makeCandidate(), kind: "news" }, client);

    expect(client.requests).toHaveLength(2);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.item.summary).toHaveLength(150);
    // The corrective retry echoes the model's own over-long reply back as
    // an assistant turn, same pattern as T08's JSON corrective retry.
    expect(client.requests[1]!.messages).toHaveLength(3);
    expect(client.requests[1]!.messages[1]).toEqual({ role: "assistant", content: tooLong });
  });

  it("fails cleanly with DraftValidationError when summary is still >200 chars after the regenerate", async () => {
    const stillTooLong = (n: number) =>
      JSON.stringify({
        title: "Title",
        summary: "x".repeat(250 + n),
        body_md: "Body content here.",
        vertical: "general",
        source_url: "https://example.test/a",
      });
    const client = new FakeLlmClient([stillTooLong(0), stillTooLong(1)]);

    await expect(draftItem({ candidate: makeCandidate(), kind: "news" }, client)).rejects.toThrow(
      DraftValidationError,
    );
    expect(client.requests).toHaveLength(2); // exactly one regenerate, not an open-ended loop
  });

  it("regenerates once on a malformed shape (missing fields), then fails cleanly if still malformed", async () => {
    const client = new FakeLlmClient([
      JSON.stringify({ title: "only a title" }),
      JSON.stringify({ title: "still incomplete" }),
    ]);

    await expect(
      draftItem({ candidate: makeCandidate(), kind: "technique" }, client),
    ).rejects.toThrow(DraftValidationError);
    expect(client.requests).toHaveLength(2);
  });

  it("recovers when a malformed-shape regenerate produces a valid response", async () => {
    const client = new FakeLlmClient([
      JSON.stringify({ title: "only a title" }),
      VALID_NEWS_RESPONSE,
    ]);

    const result = await draftItem({ candidate: makeCandidate(), kind: "news" }, client);

    expect(result.ok).toBe(true);
    expect(client.requests).toHaveLength(2);
  });
});
