import type { Pool } from "@learn-ai/db";

/**
 * In-memory stand-in for the pg `Pool` that `writeAgentRun` writes through.
 * Captures every `INSERT INTO agent_runs` call so the contract suite can
 * assert on row shape without a live Postgres connection — this is what
 * lets "every complete() call writes an agent_runs row" be a non-DB test
 * that runs locally (see LEARN_AI_V1_BUILD_SPEC.md §12/T08's "DB
 * assertions use the skip-locally/run-in-CI pattern; non-DB contract
 * tests must run locally"). The real end-to-end write against a migrated
 * schema is covered separately in agent-runs.integration.test.ts.
 */
export interface CapturedAgentRunRow {
  id: string;
  agent_name: string;
  execution_arn: string | null;
  model_id: string;
  input_tokens: number | null;
  output_tokens: number | null;
  latency_ms: number;
  cost_usd: number | null;
  status: string;
  error: string | null;
}

export class FakePool {
  readonly agentRuns: CapturedAgentRunRow[] = [];

  async query(sql: string, params: unknown[] = []): Promise<{ rows: unknown[] }> {
    if (/insert into agent_runs/i.test(sql)) {
      const [
        id,
        agent_name,
        execution_arn,
        model_id,
        input_tokens,
        output_tokens,
        latency_ms,
        cost_usd,
        status,
        error,
      ] = params as [
        string,
        string,
        string | null,
        string,
        number | null,
        number | null,
        number,
        number | null,
        string,
        string | null,
      ];
      this.agentRuns.push({
        id,
        agent_name,
        execution_arn,
        model_id,
        input_tokens,
        output_tokens,
        latency_ms,
        cost_usd,
        status,
        error,
      });
      return { rows: [] };
    }
    throw new Error(`FakePool: unexpected query: ${sql}`);
  }

  /** Cast to `Pool` for constructors that expect the real pg type — this
   * fake only ever needs to satisfy `.query()`. */
  asPool(): Pool {
    return this as unknown as Pool;
  }
}
