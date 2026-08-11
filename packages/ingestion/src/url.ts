import { createHash } from "node:crypto";

// T07 controller decision — URL normalisation rules for dedupe. Applied in
// this exact order:
//
//  1. Drop the fragment (`#...`) entirely — it never changes what content a
//     server returns.
//  2. Lowercase the hostname only. Path and query stay case-sensitive:
//     some CMSes serve case-sensitive slugs, so lowercasing those would
//     merge genuinely distinct articles.
//  3. Strip tracking query params: any key starting with `utm_`
//     (case-insensitive), plus the fixed set of known trackers below
//     (`fbclid`, `gclid`, etc.).
//  4. Sort whatever query params remain by key, so two URLs that differ
//     only in param order still normalise to the same string.
//  5. Remove exactly one trailing slash from the path, unless the path is
//     the root `/`.
//
// Everything else the URL constructor normalises for free (scheme
// lowercasing, default-port removal, percent-encoding) is inherited as a
// side effect, not spelled out above.
const TRACKING_PARAM_PREFIXES = ["utm_"];
const TRACKING_PARAM_NAMES = new Set([
  "fbclid",
  "gclid",
  "mc_cid",
  "mc_eid",
  "igshid",
  "ref",
  "ref_src",
]);

function isTrackingParam(key: string): boolean {
  const lowerKey = key.toLowerCase();
  return (
    TRACKING_PARAM_PREFIXES.some((prefix) => lowerKey.startsWith(prefix)) ||
    TRACKING_PARAM_NAMES.has(lowerKey)
  );
}

/** Canonicalise a URL for dedupe purposes. See the rules documented above. */
export function normaliseUrl(rawUrl: string): string {
  const url = new URL(rawUrl);
  url.hash = "";
  url.hostname = url.hostname.toLowerCase();

  const kept: Array<[string, string]> = [];
  for (const [key, value] of url.searchParams) {
    if (!isTrackingParam(key)) {
      kept.push([key, value]);
    }
  }
  kept.sort(([a], [b]) => a.localeCompare(b));
  url.search = new URLSearchParams(kept).toString();

  if (url.pathname.length > 1 && url.pathname.endsWith("/")) {
    url.pathname = url.pathname.slice(0, -1);
  }

  return url.toString();
}

/**
 * sha256 hex digest of an already-normalised URL. Takes the normalised
 * string, not a raw URL — callers run `candidateHash(normaliseUrl(raw))`,
 * keeping "what to hash" (this function) separate from "how to canonicalise
 * first" (normaliseUrl).
 */
export function candidateHash(normalisedUrl: string): string {
  return createHash("sha256").update(normalisedUrl).digest("hex");
}
