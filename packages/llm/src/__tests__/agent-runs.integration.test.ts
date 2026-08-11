import { afterAll, describe, expect, it } from "vitest";
import { getPool, newId } from "@learn-ai/db";
import { BedrockLlmClient } from "../bedrock-client.js";
import { requireDatabaseUrl } from "./test-helpers.js";

// Real Postgres round-trip for the agent_runs write path — the one DB
// assertion in this package, per the T08 controller decision ("DB
// assertions use the skip-locally/run-in-CI pattern; non-DB contract
// tests must run locally"). Everything else (contract.ts, run against
// both BedrockLlmClient and AnthropicLlmClient via a FakePool) already
// proves the row SHAPE without touching a database; this test proves the
// INSERT actually lands against the real, migrated §3.7 schema — correct
// column types (NUMERIC cost_usd, INTEGER token counts), and that
// unrelated rows in other tests don't collide.
//
// Skipped — not failed — when DATABASE_URL is unset, same pattern as
// packages/db's and packages/ingestion's own DB-backed tests. CI's
// postgres service already has the schema migrated up before `pnpm test`
// runs (see .github/workflows/ci.yml), so this file does not re-run
// migrations itself (same assumption as
// packages/db/src/__tests__/cohort-assignment.test.ts).
const databaseUrl = requireDatabaseUrl();

interface AgentRunRow {
  id: string;
  agent_name: string;
  execution_arn: string | null;
  model_id: string;
  input_tokens: number | null;
  output_tokens: number | null;
  latency_ms: number;
  cost_usd: string | null; // NUMERIC comes back as a string from `pg` (no custom type parser registered)
  status: string;
  error: string | null;
  created_at: Date;
}

async function fetchAgentRun(id: string): Promise<AgentRunRow | null> {
  const { rows } = await getPool().query<AgentRunRow>(`SELECT * FROM agent_runs WHERE id = $1`, [
    id,
  ]);
  return rows[0] ?? null;
}

describe.skipIf(!databaseUrl)("@learn-ai/llm agent_runs integration", () => {
  afterAll(async () => {
    if (databaseUrl) {
      await getPool().end();
    }
  });

  it("complete() writes a real agent_runs row with the correct column values on success", async () => {
    const executionArn = `arn:aws:states:ap-southeast-2:000000000000:execution:test:${newId()}`;
    const client = new BedrockLlmClient({
      agentName: "triage",
      executionArn,
      pool: getPool(),
      modelId: "anthropic.claude-3-5-haiku-20241022-v1:0",
      transport: async () => ({
        $metadata: {},
        output: { message: { role: "assistant", content: [{ text: "scored" }] } },
        stopReason: "end_turn",
        usage: { inputTokens: 42, outputTokens: 7, totalTokens: 49 },
        metrics: { latencyMs: 1 },
      }),
    });

    const before = await getPool().query<{ count: string }>(
      `SELECT count(*)::int AS count FROM agent_runs WHERE execution_arn = $1`,
      [executionArn],
    );
    expect(Number(before.rows[0]?.count ?? 0)).toBe(0);

    await client.complete({
      system: "s",
      messages: [{ role: "user", content: "x" }],
      maxTokens: 10,
    });

    const { rows } = await getPool().query<AgentRunRow>(
      `SELECT * FROM agent_runs WHERE execution_arn = $1`,
      [executionArn],
    );
    expect(rows).toHaveLength(1);
    const row = rows[0]!;
    expect(row.agent_name).toBe("triage");
    expect(row.model_id).toBe("anthropic.claude-3-5-haiku-20241022-v1:0");
    expect(row.input_tokens).toBe(42);
    expect(row.output_tokens).toBe(7);
    expect(row.status).toBe("ok");
    expect(row.error).toBeNull();
    expect(Number(row.cost_usd)).toBeGreaterThan(0);
    expect(row.created_at).toBeInstanceOf(Date);
  });

  it("complete() writes a real agent_runs row with status='error' and no token counts on failure", async () => {
    const client = new BedrockLlmClient({
      agentName: "draft",
      pool: getPool(),
      transport: async () => {
        throw new Error("boom: simulated non-retryable failure");
      },
    });

    await expect(
      client.complete({ system: "s", messages: [{ role: "user", content: "x" }], maxTokens: 10 }),
    ).rejects.toThrow("boom");

    const { rows } = await getPool().query<AgentRunRow>(
      `SELECT * FROM agent_runs WHERE agent_name = 'draft' AND error LIKE 'boom:%' ORDER BY created_at DESC LIMIT 1`,
    );
    expect(rows).toHaveLength(1);
    const row = rows[0]!;
    expect(row.status).toBe("error");
    expect(row.input_tokens).toBeNull();
    expect(row.output_tokens).toBeNull();
    expect(row.cost_usd).toBeNull();
    expect(row.error).toContain("boom: simulated non-retryable failure");
  });
});
