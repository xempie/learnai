import { parse } from "tldts";

function titleCase(word: string): string {
  const first = word.slice(0, 1).toUpperCase();
  const rest = word.slice(1).toLowerCase();
  return `${first}${rest}`;
}

/**
 * §4.1 `deriveName(domain)`: "strip the public suffix, split on `.` and
 * `-`, title-case, join with spaces." `mq.edu.au` -> `Mq`.
 *
 * The spec is explicit that this is **not good enough** as a final name —
 * it's the fallback used only when a domain isn't in the `known_institutions`
 * seed table (that lookup is T05's job; this function is the pure fallback
 * every known-institution match takes priority over).
 */
export function deriveName(domain: string): string {
  const parsed = parse(domain);
  // `domainWithoutSuffix` is null when `domain` doesn't parse into a
  // suffix + label shape at all (e.g. called directly with something that
  // isn't a registrable domain) — fall back to the raw input rather than
  // producing an empty name.
  const base = parsed.domainWithoutSuffix || domain;

  return base
    .split(/[.-]/)
    .filter((part) => part.length > 0)
    .map(titleCase)
    .join(" ");
}
