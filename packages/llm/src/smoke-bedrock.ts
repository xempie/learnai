/**
 * Live, report-only Bedrock smoke check — NOT part of the automated test
 * suite and NOT run in CI. §12/T08 controller decision: attempt one real
 * `Converse` call against the founder-tunable default model and report the
 * outcome — including AccessDenied / "model access not granted" — as a
 * user checkpoint, without failing the build on it.
 *
 * Run with:
 *   pnpm --filter @learn-ai/llm run smoke:bedrock
 *
 * Requires real AWS credentials reachable via the standard SDK resolution
 * chain (env vars, shared profile, or an assumed role) and network access
 * to Bedrock in the target region.
 */
import type { Pool } from "@learn-ai/db";
import {
  BedrockLlmClient,
  DEFAULT_BEDROCK_MODEL_ID,
  DEFAULT_BEDROCK_REGION,
} from "./bedrock-client.js";

// This script reports the raw model call outcome; it deliberately never
// touches a real database, so `agent_runs` writes go to a no-op pool.
const noopPool = { query: async () => ({ rows: [] }) } as unknown as Pool;

async function main(): Promise<void> {
  const region = process.env.BEDROCK_REGION ?? DEFAULT_BEDROCK_REGION;
  const modelId = process.env.BEDROCK_MODEL_ID ?? DEFAULT_BEDROCK_MODEL_ID;
  console.log(`[smoke-bedrock] region=${region} modelId=${modelId}`);

  const client = new BedrockLlmClient({
    agentName: "smoke-test",
    pool: noopPool,
    region,
    modelId,
  });

  try {
    const res = await client.complete({
      system: "Reply with exactly one word, nothing else.",
      messages: [{ role: "user", content: "Say hello." }],
      maxTokens: 20,
    });
    console.log("[smoke-bedrock] OK");
    console.log(`  text: ${JSON.stringify(res.text)}`);
    console.log(
      `  inputTokens=${res.inputTokens} outputTokens=${res.outputTokens} latencyMs=${res.latencyMs}`,
    );
  } catch (err) {
    // Report-only: a founder checkpoint (e.g. Bedrock model access not yet
    // granted in the console) is expected here and must not fail the task.
    console.error("[smoke-bedrock] FAILED — this is a report, not a build failure.");
    console.error(err instanceof Error ? `${err.name}: ${err.message}` : err);
  }
}

void main();
