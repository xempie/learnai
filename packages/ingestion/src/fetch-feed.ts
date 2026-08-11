import Parser from "rss-parser";
import type { FeedItemCandidate } from "./types.js";

const FETCH_TIMEOUT_MS = 20_000;

export interface FetchableSource {
  feed_url: string | null;
}

function str(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

/**
 * Fetch and parse one feed. `rss-parser` normalises both RSS 2.0 and Atom
 * into the same `items` shape, so this function handles both without
 * branching on feed type.
 *
 * A single global `fetch()` call (Node 22's built-in, not rss-parser's own
 * networking) drives the 20s timeout via `AbortSignal.timeout` and gives
 * `ingestSource` a single, predictable failure mode: this function always
 * either resolves with an array or rejects. Callers own per-source failure
 * isolation — this function does not catch anything itself.
 */
export async function fetchFeed(
  source: FetchableSource,
  opts: { timeoutMs?: number } = {},
): Promise<FeedItemCandidate[]> {
  if (!source.feed_url) {
    throw new Error("source has no feed_url");
  }

  const response = await fetch(source.feed_url, {
    signal: AbortSignal.timeout(opts.timeoutMs ?? FETCH_TIMEOUT_MS),
    headers: {
      "user-agent": "LearnAI-Ingestion/1.0 (+https://learnai.example)",
      accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, */*",
    },
  });
  if (!response.ok) {
    throw new Error(`fetch ${source.feed_url} failed: HTTP ${response.status}`);
  }
  const xml = await response.text();

  const parser = new Parser();
  const feed = await parser.parseString(xml);

  return (feed.items ?? []).map((item) => {
    const url = str(item.link) ?? str(item.guid);
    if (!url) {
      throw new Error(`feed item has neither link nor guid: ${JSON.stringify(item).slice(0, 200)}`);
    }
    const publishedAtRaw = str(item.isoDate) ?? str(item.pubDate);
    const publishedAt = publishedAtRaw ? new Date(publishedAtRaw) : null;

    return {
      externalId: str(item.guid) ?? null,
      url,
      title: str(item.title) ?? url,
      excerpt: str(item.contentSnippet) ?? str(item.summary) ?? str(item.content) ?? null,
      publishedAt: publishedAt && !Number.isNaN(publishedAt.getTime()) ? publishedAt : null,
      raw: item,
    } satisfies FeedItemCandidate;
  });
}
