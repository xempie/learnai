// Deliberate small duplication of packages/db/src/__tests__/test-helpers.ts
// (and packages/ingestion's copy of the same) rather than a cross-package
// deep import into a sibling package's __tests__ internals — see the note
// in packages/ingestion/src/__tests__/test-helpers.ts for why.
export function requireDatabaseUrl(): string | undefined {
  return process.env.DATABASE_URL;
}
