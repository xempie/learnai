import { newId, type Pool } from "@learn-ai/db";
import { fetchFeed } from "./fetch-feed.js";
import { candidateHash, normaliseUrl } from "./url.js";
import {
  MAX_CONSECUTIVE_FAILURES,
  type ContentSourceRow,
  type IngestSourceResult,
} from "./types.js";

/**
 * Fetch -> normalise -> dedupe -> insert for a single source. Per-source
 * failure isolation lives here: any failure (network, HTTP status, XML
 * parse, feed items missing a url) is caught and turned into a failure
 * result rather than a thrown error, so `runIngestion` can never have one
 * bad feed take down the whole batch.
 */
export async function ingestSource(
  pool: Pool,
  source: ContentSourceRow,
): Promise<IngestSourceResult> {
  try {
    const items = await fetchFeed(source);
    let inserted = 0;
    let latestPublishedAt: Date | null = null;

    for (const item of items) {
      const normalisedUrl = normaliseUrl(item.url);
      const urlHash = candidateHash(normalisedUrl);

      // ON CONFLICT DO NOTHING against source_candidates.url_hash's unique
      // constraint is the dedupe mechanism: re-running ingestion for the
      // same source (or a differently-tiered source that happens to link
      // the same canonical URL) inserts zero duplicate rows.
      const result = await pool.query(
        `INSERT INTO source_candidates
           (id, source_id, external_id, url, url_hash, title, excerpt, raw, published_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (url_hash) DO NOTHING`,
        [
          newId(),
          source.id,
          item.externalId,
          normalisedUrl,
          urlHash,
          item.title,
          item.excerpt,
          JSON.stringify(item.raw),
          item.publishedAt,
        ],
      );
      inserted += result.rowCount ?? 0;
      if (item.publishedAt && (!latestPublishedAt || item.publishedAt > latestPublishedAt)) {
        latestPublishedAt = item.publishedAt;
      }
    }

    await pool.query(
      `UPDATE content_sources
          SET last_polled_at = now(),
              last_item_at = COALESCE($2, last_item_at),
              consecutive_failures = 0
        WHERE id = $1`,
      [source.id, latestPublishedAt],
    );

    return {
      sourceId: source.id,
      sourceName: source.name,
      ok: true,
      fetched: items.length,
      inserted,
      deactivated: false,
    };
  } catch (error) {
    return recordFailure(pool, source, error);
  }
}

async function recordFailure(
  pool: Pool,
  source: ContentSourceRow,
  error: unknown,
): Promise<IngestSourceResult> {
  const nextFailures = source.consecutive_failures + 1;
  const deactivate = nextFailures >= MAX_CONSECUTIVE_FAILURES;

  await pool.query(
    `UPDATE content_sources
        SET last_polled_at = now(),
            consecutive_failures = $2,
            active = active AND NOT $3
      WHERE id = $1`,
    [source.id, nextFailures, deactivate],
  );

  const message = error instanceof Error ? error.message : String(error);
  if (deactivate) {
    // eslint-disable-next-line no-console -- deliberate operational log line
    console.error(
      `[ingestion] auto-deactivating source "${source.name}" (${source.id}) after ` +
        `${nextFailures} consecutive failures. Last error: ${message}`,
    );
  }

  return {
    sourceId: source.id,
    sourceName: source.name,
    ok: false,
    fetched: 0,
    inserted: 0,
    deactivated: deactivate,
    error: message,
  };
}
