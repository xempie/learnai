import { afterEach, describe, expect, it } from "vitest";
import { AnthropicLlmClient } from "../anthropic-client.js";
import { BedrockLlmClient } from "../bedrock-client.js";
import { createLlmClient } from "../factory.js";
import { FakePool } from "./fake-pool.js";

// createLlmClient() constructs the real default transport when none is
// injected (BedrockRuntimeClient / Anthropic SDK client) — it never makes a
// network call at construction time, so these assertions only need to
// check *which class* got built, not exercise a live call.
describe("createLlmClient", () => {
  const originalProvider = process.env.LLM_PROVIDER;
  const originalApiKey = process.env.ANTHROPIC_API_KEY;

  afterEach(() => {
    if (originalProvider === undefined) delete process.env.LLM_PROVIDER;
    else process.env.LLM_PROVIDER = originalProvider;
    if (originalApiKey === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = originalApiKey;
  });

  it("defaults to BedrockLlmClient when LLM_PROVIDER is unset", () => {
    delete process.env.LLM_PROVIDER;
    const client = createLlmClient({ agentName: "triage", pool: new FakePool().asPool() });
    expect(client).toBeInstanceOf(BedrockLlmClient);
  });

  it("selects BedrockLlmClient for LLM_PROVIDER=bedrock", () => {
    process.env.LLM_PROVIDER = "bedrock";
    const client = createLlmClient({ agentName: "triage", pool: new FakePool().asPool() });
    expect(client).toBeInstanceOf(BedrockLlmClient);
  });

  it("selects AnthropicLlmClient for LLM_PROVIDER=anthropic", () => {
    process.env.LLM_PROVIDER = "anthropic";
    process.env.ANTHROPIC_API_KEY = "sk-ant-test-key";
    const client = createLlmClient({ agentName: "triage", pool: new FakePool().asPool() });
    expect(client).toBeInstanceOf(AnthropicLlmClient);
  });

  it("is case-insensitive on LLM_PROVIDER", () => {
    process.env.LLM_PROVIDER = "ANTHROPIC";
    process.env.ANTHROPIC_API_KEY = "sk-ant-test-key";
    const client = createLlmClient({ agentName: "triage", pool: new FakePool().asPool() });
    expect(client).toBeInstanceOf(AnthropicLlmClient);
  });

  it("throws a clear error for an unknown LLM_PROVIDER", () => {
    process.env.LLM_PROVIDER = "openai";
    expect(() => createLlmClient({ agentName: "triage", pool: new FakePool().asPool() })).toThrow(
      /Unknown LLM_PROVIDER/,
    );
  });
});
