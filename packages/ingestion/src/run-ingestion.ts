import type { Pool } from "@learn-ai/db";
import { ingestSource } from "./ingest-source.js";
import { pollDueSources } from "./poll-sources.js";
import type { IngestSourceResult, RunIngestionResult } from "./types.js";

/**
 * §5.1 `PollSources` + `FetchFeed` + `NormaliseAndDedupe`, wired together
 * for one batch run. T11 wraps this in a Lambda; today it is the body of
 * `pnpm --filter @learn-ai/ingestion run ingest`.
 */
export async function runIngestion(pool: Pool): Promise<RunIngestionResult> {
  const sources = await pollDueSources(pool);
  const results: IngestSourceResult[] = [];
  let succeeded = 0;
  let failed = 0;
  let candidatesInserted = 0;
  const deactivatedSources: string[] = [];

  for (const source of sources) {
    // ingestSource already isolates its own failures into a result object
    // rather than throwing. This try/catch is a second belt-and-braces
    // layer — a bug in ingestSource itself must still never abort the
    // batch and strand the remaining sources unpolled.
    let result: IngestSourceResult;
    try {
      result = await ingestSource(pool, source);
    } catch (error) {
      result = {
        sourceId: source.id,
        sourceName: source.name,
        ok: false,
        fetched: 0,
        inserted: 0,
        deactivated: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }

    results.push(result);
    if (result.ok) {
      succeeded += 1;
    } else {
      failed += 1;
    }
    candidatesInserted += result.inserted;
    if (result.deactivated) {
      deactivatedSources.push(result.sourceName);
    }
  }

  return {
    sourcesDue: sources.length,
    succeeded,
    failed,
    candidatesInserted,
    deactivatedSources,
    results,
  };
}
