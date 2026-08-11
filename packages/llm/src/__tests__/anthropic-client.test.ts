import type { Message } from "@anthropic-ai/sdk/resources/messages";
import { describe, expect, it } from "vitest";
import {
  AnthropicLlmClient,
  DEFAULT_ANTHROPIC_MODEL_ID,
  type AnthropicTransport,
} from "../anthropic-client.js";
import { describeLlmClientContract, type ScriptStep } from "./contract.js";
import { FakePool } from "./fake-pool.js";

function successMessage(
  text: string,
  inputTokens: number,
  outputTokens: number,
  model: string = DEFAULT_ANTHROPIC_MODEL_ID,
): Message {
  return {
    id: "msg_test",
    container: null,
    content: [{ type: "text", text, citations: null }],
    model,
    role: "assistant",
    stop_details: null,
    stop_reason: "end_turn",
    stop_sequence: null,
    type: "message",
    usage: {
      cache_creation: null,
      cache_creation_input_tokens: null,
      cache_read_input_tokens: null,
      inference_geo: null,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      output_tokens_details: null,
      server_tool_use: null,
      service_tier: null,
    },
  };
}

function statusError(message: string, status: number): Error {
  return Object.assign(new Error(message), { status });
}

/** Builds an `AnthropicTransport` that consumes one `ScriptStep` per call. */
function scriptedTransport(script: ScriptStep[]): {
  transport: AnthropicTransport;
  callCount: () => number;
} {
  const queue = [...script];
  let calls = 0;
  const transport: AnthropicTransport = async () => {
    calls += 1;
    const step = queue.shift();
    if (!step) throw new Error("test transport script exhausted");
    switch (step.kind) {
      case "text":
        return successMessage(step.text, step.inputTokens, step.outputTokens);
      case "throttle":
        throw statusError("Rate limited", 429);
      case "server-error":
        throw statusError("Internal server error", 500);
      case "client-error":
        throw statusError("Bad request", 400);
    }
  };
  return { transport, callCount: () => calls };
}

describeLlmClientContract({
  name: "AnthropicLlmClient",
  makeClient(script, opts) {
    const pool = new FakePool();
    const { transport, callCount } = scriptedTransport(script);
    const client = new AnthropicLlmClient({
      agentName: "triage",
      pool: pool.asPool(),
      transport,
      retry: opts?.retry,
    });
    return { client, pool, callCount };
  },
});

describe("AnthropicLlmClient — provider-specific behaviour", () => {
  it("passes system/messages/maxTokens/temperature through to the Messages params", async () => {
    let capturedParams: unknown;
    const transport: AnthropicTransport = async (params) => {
      capturedParams = params;
      return successMessage("ok", 1, 1);
    };
    const client = new AnthropicLlmClient({
      agentName: "draft",
      pool: new FakePool().asPool(),
      transport,
    });

    await client.complete({
      system: "You are a draft agent.",
      messages: [{ role: "user", content: "write it" }],
      maxTokens: 512,
      temperature: 0.3,
    });

    expect(capturedParams).toMatchObject({
      model: DEFAULT_ANTHROPIC_MODEL_ID,
      max_tokens: 512,
      system: "You are a draft agent.",
      temperature: 0.3,
      messages: [{ role: "user", content: "write it" }],
    });
  });

  it("uses the exact model ID Anthropic's response echoes back, not just the configured one", async () => {
    const client = new AnthropicLlmClient({
      agentName: "triage",
      pool: new FakePool().asPool(),
      transport: async () => successMessage("ok", 1, 1, "claude-sonnet-5"),
    });
    const res = await client.complete({
      system: "s",
      messages: [{ role: "user", content: "x" }],
      maxTokens: 10,
    });
    expect(res.modelId).toBe("claude-sonnet-5");
  });

  it("throws a clear error when ANTHROPIC_API_KEY is unset and no transport is injected", () => {
    const previous = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    try {
      expect(
        () => new AnthropicLlmClient({ agentName: "triage", pool: new FakePool().asPool() }),
      ).toThrow(/ANTHROPIC_API_KEY/);
    } finally {
      if (previous !== undefined) process.env.ANTHROPIC_API_KEY = previous;
    }
  });
});
