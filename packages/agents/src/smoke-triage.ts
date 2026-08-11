/**
 * Live, report-only triage smoke check — NOT part of the automated test
 * suite and NOT run in CI. §12/T09 controller decision: run ONE real
 * triage batch of 3 tiny fixture candidates through Bedrock
 * (`BEDROCK_MODEL_ID` from .env.local) and report the scores it returned
 * as a founder checkpoint, without failing the build on it. Mirrors
 * packages/llm/src/smoke-bedrock.ts's shape.
 *
 * Run with:
 *   pnpm --filter @learn-ai/agents run smoke:triage
 *
 * Requires real AWS credentials reachable via the standard SDK resolution
 * chain and network access to Bedrock in the target region.
 */
import type { Pool } from "@learn-ai/db";
import {
  BedrockLlmClient,
  DEFAULT_BEDROCK_MODEL_ID,
  DEFAULT_BEDROCK_REGION,
} from "@learn-ai/llm";
import { triageCandidates } from "./triage/triage-candidates.js";
import type { TriageCandidateInput } from "./triage/types.js";

// Report-only: never touches a real database. agent_runs writes (from
// BedrockLlmClient.complete()) and the triage_score/triage_reason UPDATEs
// (from triageCandidates) both go to a no-op pool that just counts calls.
const noopPool = {
  query: async () => ({ rows: [] }),
} as unknown as Pool;

const FIXTURE_CANDIDATES: TriageCandidateInput[] = [
  {
    id: "smoke-1",
    title: "New ChatGPT feature lets you turn any webpage into a checklist in one prompt",
    excerpt:
      "OpenAI added a 'convert to checklist' action that takes any pasted webpage text and " +
      "returns a numbered action list in under 10 seconds — no extra setup required.",
    url: "https://example.test/smoke/chatgpt-checklist",
  },
  {
    id: "smoke-2",
    title: "AI startup raises $40M Series B led by a top-tier venture fund",
    excerpt:
      "The funding round values the company at $400M and will be used to expand its enterprise " +
      "sales team across APAC.",
    url: "https://example.test/smoke/funding-round",
  },
  {
    id: "smoke-3",
    title: "Five-minute email triage prompt for busy managers",
    excerpt:
      "A copy-paste prompt that has an assistant draft three reply options for an inbox, sorted " +
      "by urgency, so a manager can clear a backlog before their first meeting.",
    url: "https://example.test/smoke/email-triage-prompt",
  },
];

async function main(): Promise<void> {
  const region = process.env.BEDROCK_REGION ?? DEFAULT_BEDROCK_REGION;
  const modelId = process.env.BEDROCK_MODEL_ID ?? DEFAULT_BEDROCK_MODEL_ID;
  console.log(`[smoke-triage] region=${region} modelId=${modelId}`);
  console.log(`[smoke-triage] scoring ${FIXTURE_CANDIDATES.length} fixture candidates...`);

  const client = new BedrockLlmClient({
    agentName: "triage",
    pool: noopPool,
    region,
    modelId,
  });

  try {
    const result = await triageCandidates(FIXTURE_CANDIDATES, client, noopPool);
    console.log("[smoke-triage] OK");
    for (const entry of result.scored) {
      const candidate = FIXTURE_CANDIDATES.find((c) => c.id === entry.id);
      console.log(
        `  ${entry.id} score=${entry.score} vertical=${entry.vertical} reason="${entry.reason}"` +
          ` — "${candidate?.title}"`,
      );
    }
    if (result.missingIds.length > 0) {
      console.log(`  missing (unscored): ${result.missingIds.join(", ")}`);
    }
    if (result.unmatchedIds.length > 0) {
      console.log(`  unmatched ids from response: ${result.unmatchedIds.join(", ")}`);
    }
    console.log(`  invalidEntries=${result.invalidEntries} batchCount=${result.batchCount}`);
  } catch (err) {
    // Report-only: a founder checkpoint (e.g. Bedrock model access not yet
    // granted in the console) is expected here and must not fail the task.
    console.error("[smoke-triage] FAILED — this is a report, not a build failure.");
    console.error(err instanceof Error ? `${err.name}: ${err.message}` : err);
  }
}

void main();
