// T07 — shared types for @learn-ai/ingestion. Deliberately independent of
// pg's row-mapping conventions: callers (packages/db-backed CLI today,
// T11's Lambdas later) hand in plain objects shaped like this, so these
// functions stay testable without a live Postgres connection.

/** The columns of `content_sources` this package reads and writes. */
export interface ContentSourceRow {
  id: string;
  name: string;
  homepage_url: string;
  feed_url: string | null;
  tier: 1 | 2 | 3;
  vertical: string;
  ingest_method: "rss" | "api" | "manual";
  poll_interval_min: number;
  active: boolean;
  last_polled_at: Date | null;
  last_item_at: Date | null;
  consecutive_failures: number;
  created_at: Date;
}

/** One feed entry, normalised into the shape `source_candidates` wants. */
export interface FeedItemCandidate {
  externalId: string | null;
  url: string;
  title: string;
  excerpt: string | null;
  publishedAt: Date | null;
  raw: unknown;
}

/** After how many consecutive failures a source is auto-deactivated. */
export const MAX_CONSECUTIVE_FAILURES = 5;

export interface IngestSourceResult {
  sourceId: string;
  sourceName: string;
  ok: boolean;
  fetched: number;
  inserted: number;
  deactivated: boolean;
  error?: string;
}

export interface RunIngestionResult {
  sourcesDue: number;
  succeeded: number;
  failed: number;
  candidatesInserted: number;
  deactivatedSources: string[];
  results: IngestSourceResult[];
}
