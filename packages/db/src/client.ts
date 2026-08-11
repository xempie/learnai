import { Pool, type PoolConfig } from "pg";
import { uuidv7 } from "uuidv7";

/**
 * Shared pg pool for @learn-ai/db consumers (migrations use node-pg-migrate's
 * own connection; this pool is for the seed script, tests, and — later —
 * application code).
 *
 * UUID v7 (time-sortable) primary keys are generated application-side via
 * `newId()` rather than a Postgres extension function, per the T02
 * controller decision recorded in LEARN_AI_V1_BUILD_SPEC.md §3: no
 * `uuid_generate_v7()` ships in stock Postgres 16, and pulling in a
 * third-party extension just for ID generation is unnecessary when the
 * `uuidv7` npm package does the same job with no server-side dependency.
 */
export function createPool(config: PoolConfig = {}): Pool {
  const connectionString = config.connectionString ?? process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set. Copy .env.example to .env.local and adjust if needed.",
    );
  }
  return new Pool({ connectionString, ...config });
}

let sharedPool: Pool | undefined;

/** Lazily-created, process-wide pool backed by DATABASE_URL. */
export function getPool(): Pool {
  if (!sharedPool) {
    sharedPool = createPool();
  }
  return sharedPool;
}

/** Generate a new time-sortable UUID v7 primary key. */
export function newId(): string {
  return uuidv7();
}
