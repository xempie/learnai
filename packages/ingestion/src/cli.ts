// T07 — runnable CLI entry: `pnpm --filter @learn-ai/ingestion run ingest`.
//
// Two modes:
//   (default)    runs the real pipeline against DATABASE_URL — pollDueSources,
//                ingestSource per source, prints a summary.
//   --dry-run    no DB involved at all. Fetches + parses + normalises a
//                handful of the real seeded feed URLs (from
//                @learn-ai/db's CONTENT_SOURCES) and prints candidate
//                counts. Exists to prove the seeded feed URLs actually
//                parse without needing a local Postgres instance.
import { CONTENT_SOURCES, getPool } from "@learn-ai/db";
import { fetchFeed } from "./fetch-feed.js";
import { normaliseUrl } from "./url.js";
import { runIngestion } from "./run-ingestion.js";

// A small, deliberately mixed (RSS + Atom, tier 1 + tier 2) sample of the
// seeded sources — not all 26, to keep a manual/local dry-run fast and to
// avoid hammering every seeded host on every invocation.
const DRY_RUN_SOURCE_NAMES = ["OpenAI News", "Hugging Face Blog", "Simon Willison's Weblog"];

async function dryRun(): Promise<void> {
  const sources = CONTENT_SOURCES.filter((s) => DRY_RUN_SOURCE_NAMES.includes(s.name));
  console.log(`[dry-run] fetching ${sources.length} real seeded feeds (no DB)...\n`);

  for (const source of sources) {
    try {
      const items = await fetchFeed(source);
      const uniqueNormalised = new Set(items.map((item) => normaliseUrl(item.url)));
      console.log(
        `OK    ${source.name} (${source.feed_url}) — ${items.length} items, ` +
          `${uniqueNormalised.size} unique normalised URLs`,
      );
      if (items[0]) {
        console.log(`      e.g. "${items[0].title}" -> ${normaliseUrl(items[0].url)}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.log(`FAIL  ${source.name} (${source.feed_url}) — ${message}`);
    }
  }
}

async function main(): Promise<void> {
  if (process.argv.includes("--dry-run")) {
    await dryRun();
    return;
  }

  const pool = getPool();
  try {
    const result = await runIngestion(pool);
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error("[ingestion] CLI failed:", error);
  process.exitCode = 1;
});
