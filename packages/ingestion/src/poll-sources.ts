import type { Pool } from "@learn-ai/db";
import type { ContentSourceRow } from "./types.js";

/**
 * SELECT active RSS sources that are due to be polled: never polled before,
 * or `poll_interval_min` has elapsed since `last_polled_at`. Mirrors §5.1's
 * `PollSources Map over content_sources WHERE active AND due`.
 *
 * Scoped to `ingest_method = 'rss'` — this package only implements RSS/Atom
 * fetching (§5.1's `FetchFeed`); `api`/`manual` sources are out of scope
 * for T07 and would otherwise be picked up here and fail every poll.
 */
export async function pollDueSources(pool: Pool): Promise<ContentSourceRow[]> {
  const { rows } = await pool.query<ContentSourceRow>(
    `SELECT id, name, homepage_url, feed_url, tier, vertical, ingest_method,
            poll_interval_min, active, last_polled_at, last_item_at,
            consecutive_failures, created_at
       FROM content_sources
      WHERE active = true
        AND ingest_method = 'rss'
        AND (
          last_polled_at IS NULL
          OR last_polled_at <= now() - (poll_interval_min || ' minutes')::interval
        )
      ORDER BY last_polled_at ASC NULLS FIRST`,
  );
  return rows;
}
