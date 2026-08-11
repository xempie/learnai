import { parse } from "tldts";

/**
 * Organisation kind, per §4.1's `inferKind` rule and §3.2's organisation
 * shape. `known_institutions` rows (seeded in `packages/db`) only ever use
 * `university` | `government` | `professional_body` — `corporate` is the
 * catch-all `inferKind` falls back to for everything else.
 */
export type OrganisationKind = "university" | "government" | "professional_body" | "corporate";

/**
 * A known-institution mapping: registrable domain -> proper organisation
 * name/kind, overriding `deriveName`'s title-cased guess. The seed data
 * itself lives in `packages/db` (DB-aware lookup is T05's job); this type
 * is exported so T05's find-or-create can consult a table shaped like this
 * without T04 importing `@learn-ai/db` (this package stays pure/DB-free).
 */
export interface KnownInstitution {
  domain: string;
  name: string;
  kind: OrganisationKind;
}

/**
 * §4.1 `inferKind(domain)`: `.edu.au`/`.edu` -> university,
 * `.gov.au`/`.gov` -> government, `.org.au`/`.org` -> professional_body,
 * else corporate. Driven off the PSL-derived public suffix (not a raw
 * string suffix check) so it agrees with `registrableDomain` on where the
 * suffix boundary is.
 */
export function inferKind(domain: string): OrganisationKind {
  const suffix = parse(domain).publicSuffix ?? "";

  if (suffix === "edu.au" || suffix === "edu") {
    return "university";
  }
  if (suffix === "gov.au" || suffix === "gov") {
    return "government";
  }
  if (suffix === "org.au" || suffix === "org") {
    return "professional_body";
  }
  return "corporate";
}
