import { newId, type Pool } from "@learn-ai/db";

/**
 * §3.7 `agent_runs` row shape. Every `LlmClient.complete()` call writes
 * exactly one of these (§12/T08 acceptance) — success or failure.
 */
export interface AgentRunInput {
  agentName: string;
  executionArn?: string | null;
  modelId: string;
  inputTokens: number | null;
  outputTokens: number | null;
  latencyMs: number;
  costUsd: number | null;
  status: "ok" | "error";
  error?: string | null;
}

/** `agent_runs.error` is unbounded prose in practice (stack traces, SDK
 * error bodies) but the column is intended for a human-scannable summary,
 * not a full dump — truncate defensively so one bad response can't bloat
 * the table. */
const ERROR_TRUNCATE_LENGTH = 2000;

/** Returns the generated `agent_runs.id` (see `LlmResponse.agentRunId`) —
 * generated application-side before the INSERT, so it is available to
 * return regardless of what the DB round-trip does. */
export async function writeAgentRun(pool: Pool, input: AgentRunInput): Promise<string> {
  const id = newId();
  await pool.query(
    `INSERT INTO agent_runs
       (id, agent_name, execution_arn, model_id, input_tokens, output_tokens,
        latency_ms, cost_usd, status, error)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      id,
      input.agentName,
      input.executionArn ?? null,
      input.modelId,
      input.inputTokens,
      input.outputTokens,
      input.latencyMs,
      input.costUsd,
      input.status,
      input.error ? input.error.slice(0, ERROR_TRUNCATE_LENGTH) : null,
    ],
  );
  return id;
}
