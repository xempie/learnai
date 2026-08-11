import type { ConverseCommandOutput } from "@aws-sdk/client-bedrock-runtime";
import { describe, expect, it } from "vitest";
import {
  BedrockLlmClient,
  DEFAULT_BEDROCK_MODEL_ID,
  type BedrockTransport,
} from "../bedrock-client.js";
import { describeLlmClientContract, type ScriptStep } from "./contract.js";
import { FakePool } from "./fake-pool.js";

function successOutput(
  text: string,
  inputTokens: number,
  outputTokens: number,
): ConverseCommandOutput {
  return {
    $metadata: {},
    output: { message: { role: "assistant", content: [{ text }] } },
    stopReason: "end_turn",
    usage: { inputTokens, outputTokens, totalTokens: inputTokens + outputTokens },
    metrics: { latencyMs: 1 },
  };
}

function throttlingError(): Error {
  const err = new Error("Rate exceeded");
  err.name = "ThrottlingException";
  return err;
}

function statusError(message: string, httpStatusCode: number): Error {
  return Object.assign(new Error(message), { $metadata: { httpStatusCode } });
}

/** Builds a `BedrockTransport` that consumes one `ScriptStep` per call. */
function scriptedTransport(script: ScriptStep[]): {
  transport: BedrockTransport;
  callCount: () => number;
} {
  const queue = [...script];
  let calls = 0;
  const transport: BedrockTransport = async () => {
    calls += 1;
    const step = queue.shift();
    if (!step) throw new Error("test transport script exhausted");
    switch (step.kind) {
      case "text":
        return successOutput(step.text, step.inputTokens, step.outputTokens);
      case "throttle":
        throw throttlingError();
      case "server-error":
        throw statusError("Internal server error", 500);
      case "client-error":
        throw statusError("Bad request", 400);
    }
  };
  return { transport, callCount: () => calls };
}

describeLlmClientContract({
  name: "BedrockLlmClient",
  makeClient(script, opts) {
    const pool = new FakePool();
    const { transport, callCount } = scriptedTransport(script);
    const client = new BedrockLlmClient({
      agentName: "triage",
      pool: pool.asPool(),
      modelId: DEFAULT_BEDROCK_MODEL_ID,
      transport,
      retry: opts?.retry,
    });
    return { client, pool, callCount };
  },
});

describe("BedrockLlmClient — provider-specific behaviour", () => {
  it("passes system/messages/maxTokens/temperature through to the Converse input", async () => {
    let capturedInput: unknown;
    const transport: BedrockTransport = async (input) => {
      capturedInput = input;
      return successOutput("ok", 1, 1);
    };
    const client = new BedrockLlmClient({
      agentName: "draft",
      pool: new FakePool().asPool(),
      transport,
    });

    await client.complete({
      system: "You are a triage agent.",
      messages: [
        { role: "user", content: "score this" },
        { role: "assistant", content: "ok" },
        { role: "user", content: "go" },
      ],
      maxTokens: 512,
      temperature: 0.2,
    });

    expect(capturedInput).toMatchObject({
      modelId: DEFAULT_BEDROCK_MODEL_ID,
      system: [{ text: "You are a triage agent." }],
      inferenceConfig: { maxTokens: 512, temperature: 0.2 },
    });
  });

  it("defaults modelId to BEDROCK_MODEL_ID / the founder-tunable default when unset", async () => {
    const client = new BedrockLlmClient({
      agentName: "triage",
      pool: new FakePool().asPool(),
      transport: async () => successOutput("ok", 1, 1),
    });
    const res = await client.complete({
      system: "s",
      messages: [{ role: "user", content: "x" }],
      maxTokens: 10,
    });
    expect(res.modelId).toBe(DEFAULT_BEDROCK_MODEL_ID);
  });
});
