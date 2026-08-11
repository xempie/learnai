/**
 * Live, report-only draft smoke check — NOT part of the automated test
 * suite and NOT run in CI. §12/T10 controller decision: run ONE real
 * `kind=technique` draft through Bedrock from a small real candidate
 * fixture and report the title/summary it produced as a founder
 * checkpoint, without failing the build on it. Mirrors
 * packages/agents/src/smoke-triage.ts's shape (and packages/llm's
 * smoke-bedrock.ts before that).
 *
 * Run with:
 *   pnpm --filter @learn-ai/agents run smoke:draft
 *
 * Requires real AWS credentials reachable via the standard SDK resolution
 * chain and network access to Bedrock in the target region.
 */
import type { Pool } from "@learn-ai/db";
import { BedrockLlmClient, DEFAULT_BEDROCK_MODEL_ID, DEFAULT_BEDROCK_REGION } from "@learn-ai/llm";
import { draftItem } from "./draft/draft-item.js";
import type { DraftCandidateInput } from "./draft/types.js";

// Report-only: never touches a real database. The agent_runs write (from
// BedrockLlmClient.complete()) goes to a no-op pool that just counts calls.
const noopPool = {
  query: async () => ({ rows: [] }),
} as unknown as Pool;

// A small, real, verifiable source excerpt — deliberately specific enough
// (a named product, a named action, a concrete time saving) that the draft
// agent should NOT refuse it as insufficient_source.
const FIXTURE_CANDIDATE: DraftCandidateInput = {
  id: "smoke-draft-1",
  title: "Google Sheets adds a =AI() formula that summarises a highlighted range in place",
  url: "https://example.test/smoke/sheets-ai-formula",
  excerpt:
    "Google added a new =AI() formula to Sheets: select a range of cells, type =AI(range, " +
    '"summarise the key trend"), and the formula returns a one-line summary directly in the ' +
    "cell, recalculating whenever the underlying data changes. No script or add-on required — " +
    "it is a built-in formula available to every Workspace user on the current release channel.",
  raw: null,
  sourceId: "smoke-source-1",
  sourceTier: 1,
  sourceVertical: "general",
};

async function main(): Promise<void> {
  const region = process.env.BEDROCK_REGION ?? DEFAULT_BEDROCK_REGION;
  const modelId = process.env.BEDROCK_MODEL_ID ?? DEFAULT_BEDROCK_MODEL_ID;
  console.log(`[smoke-draft] region=${region} modelId=${modelId}`);
  console.log(`[smoke-draft] drafting kind=technique from 1 fixture candidate...`);

  const client = new BedrockLlmClient({
    agentName: "draft",
    pool: noopPool,
    region,
    modelId,
  });

  try {
    const result = await draftItem({ candidate: FIXTURE_CANDIDATE, kind: "technique" }, client);
    if (result.ok) {
      console.log("[smoke-draft] OK — drafted");
      console.log(`  title:   ${result.item.title}`);
      console.log(`  summary: ${result.item.summary}`);
      console.log(`  vertical=${result.item.vertical} slug=${result.item.slug}`);
    } else {
      console.log("[smoke-draft] model refused: insufficient_source");
      console.log(`  detail: ${result.detail}`);
    }
  } catch (err) {
    // Report-only: a founder checkpoint (e.g. Bedrock model access not yet
    // granted in the console) is expected here and must not fail the task.
    console.error("[smoke-draft] FAILED — this is a report, not a build failure.");
    console.error(err instanceof Error ? `${err.name}: ${err.message}` : err);
  }
}

void main();
