import type { Pool } from "@learn-ai/db";

/** One captured `UPDATE source_candidates SET triage_score = ...` call. */
export interface CapturedTriageUpdate {
  id: string;
  triage_score: number;
  triage_reason: string;
  triage_vertical: string;
}

/**
 * In-memory stand-in for the pg `Pool` that `triageCandidates`' persistence
 * step writes through — lets the unit-level batching/validation tests
 * assert on exactly what would have been written without a live Postgres
 * connection. The real write path (correct column types, `raw` jsonb
 * merge) is covered separately by the DB integration test
 * (skip-locally/run-in-CI), same split as packages/llm's FakePool /
 * agent-runs.integration.test.ts.
 */
export class FakePool {
  readonly updates: CapturedTriageUpdate[] = [];

  async query(sql: string, params: unknown[] = []): Promise<{ rows: unknown[] }> {
    if (/update source_candidates/i.test(sql)) {
      const [id, triage_score, triage_reason, triage_vertical] = params as [
        string,
        number,
        string,
        string,
      ];
      this.updates.push({ id, triage_score, triage_reason, triage_vertical });
      return { rows: [] };
    }
    throw new Error(`FakePool: unexpected query: ${sql}`);
  }

  asPool(): Pool {
    return this as unknown as Pool;
  }
}
