import { describe, expect, it } from "vitest";
import { candidateHash, normaliseUrl } from "../url.js";

describe("normaliseUrl", () => {
  const cases: Array<[label: string, input: string, expected: string]> = [
    [
      "strips utm_* tracking params",
      "https://example.com/post?utm_source=x&utm_medium=y&utm_campaign=z",
      "https://example.com/post",
    ],
    [
      "strips fbclid and other known trackers",
      "https://example.com/post?fbclid=abc123&gclid=def456&mc_cid=g&mc_eid=h&igshid=i&ref=j&ref_src=k",
      "https://example.com/post",
    ],
    [
      "keeps non-tracking query params",
      "https://example.com/post?id=42&utm_source=x",
      "https://example.com/post?id=42",
    ],
    [
      "sorts remaining query params by key",
      "https://example.com/post?b=2&a=1&c=3",
      "https://example.com/post?a=1&b=2&c=3",
    ],
    [
      "lowercases the host but not the path",
      "https://EXAMPLE.com/Some/Path",
      "https://example.com/Some/Path",
    ],
    ["removes a single trailing slash", "https://example.com/post/", "https://example.com/post"],
    ["does not strip the root path's slash", "https://example.com/", "https://example.com/"],
    ["drops the fragment", "https://example.com/post#section-2", "https://example.com/post"],
    [
      "combines all rules together",
      "https://EXAMPLE.com/Post/?utm_source=x&b=2&a=1&fbclid=y#frag",
      "https://example.com/Post?a=1&b=2",
    ],
    [
      "case-insensitive utm_ prefix match",
      "https://example.com/post?UTM_Source=x",
      "https://example.com/post",
    ],
  ];

  it.each(cases)("%s", (_label, input, expected) => {
    expect(normaliseUrl(input)).toBe(expected);
  });

  it("is idempotent — normalising twice yields the same result", () => {
    const input = "https://EXAMPLE.com/Post/?utm_source=x&b=2&a=1#frag";
    const once = normaliseUrl(input);
    expect(normaliseUrl(once)).toBe(once);
  });

  it("two URLs that differ only by tracking params and query order normalise identically", () => {
    const a = normaliseUrl("https://example.com/post?utm_source=newsletter&id=1&fbclid=abc");
    const b = normaliseUrl("https://example.com/post?id=1&utm_campaign=spring");
    expect(a).toBe(b);
  });
});

describe("candidateHash", () => {
  it("is stable for the same normalised URL", () => {
    const url = normaliseUrl("https://example.com/post?utm_source=x");
    expect(candidateHash(url)).toBe(candidateHash(url));
  });

  it("produces a 64-char lowercase hex sha256 digest", () => {
    const hash = candidateHash(normaliseUrl("https://example.com/post"));
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("differs for different normalised URLs", () => {
    const hashA = candidateHash(normaliseUrl("https://example.com/post-a"));
    const hashB = candidateHash(normaliseUrl("https://example.com/post-b"));
    expect(hashA).not.toBe(hashB);
  });

  it("two raw URLs that normalise to the same value hash the same", () => {
    const hashA = candidateHash(normaliseUrl("https://EXAMPLE.com/post/?utm_source=a"));
    const hashB = candidateHash(normaliseUrl("https://example.com/post?utm_medium=b"));
    expect(hashA).toBe(hashB);
  });
});
