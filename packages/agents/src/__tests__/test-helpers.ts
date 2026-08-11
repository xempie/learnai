// Deliberate small duplication of packages/db/src/__tests__/test-helpers.ts
// (and packages/llm's / packages/ingestion's own copies of the same) rather
// than a cross-package deep import into a sibling package's __tests__
// internals — see packages/ingestion/src/__tests__/test-helpers.ts for why.
export function requireDatabaseUrl(): string | undefined {
  return process.env.DATABASE_URL;
}
