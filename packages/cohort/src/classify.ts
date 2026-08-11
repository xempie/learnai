import { normaliseEmail } from "./email";
import { registrableDomain } from "./domain";
import { deriveName } from "./name";
import { inferKind, type OrganisationKind } from "./kind";

export type ClassifyResult =
  | { outcome: "invalid" }
  | { outcome: "free_mail" }
  | { outcome: "disposable" }
  | { outcome: "organisation"; domain: string; derivedName: string; kind: OrganisationKind };

export interface ClassifyEmailDeps {
  /** Registrable domains from the `free_mail_domains` table (T02 seed). */
  freeMailDomains: readonly string[];
  /** Registrable domains from the `disposable_domains` table (T02 seed). */
  disposableDomains: readonly string[];
}

/**
 * §4.1 steps 1-6, minus the DB-aware find-or-create (that's T05). Pure
 * function: given an email and the two lookup-table contents as plain
 * arrays, returns a discriminated union describing what §4.1 would do next:
 *
 * - `invalid`      -> step 1: not RFC-5322 valid, or no registrable domain
 * - `free_mail`     -> step 4: individual track, no organisation
 * - `disposable`    -> step 5: reject signup (422) — caller's job
 * - `organisation`  -> steps 3/6: the registrable domain plus the
 *                      `deriveName`/`inferKind` fallback values T05 uses
 *                      when there's no `known_institutions` row and no
 *                      existing `organisation_domains` row.
 *
 * Never throws — §4's NON-NEGOTIABLE requirement is that cohort assignment
 * must never fail a signup, so this always resolves to one of the four
 * outcomes above rather than raising.
 */
export function classifyEmail(rawEmail: string, deps: ClassifyEmailDeps): ClassifyResult {
  const normalised = normaliseEmail(rawEmail);
  if (!normalised) {
    return { outcome: "invalid" };
  }

  const host = normalised.slice(normalised.lastIndexOf("@") + 1);
  const domain = registrableDomain(host);
  if (!domain) {
    return { outcome: "invalid" };
  }

  if (deps.freeMailDomains.includes(domain)) {
    return { outcome: "free_mail" };
  }
  if (deps.disposableDomains.includes(domain)) {
    return { outcome: "disposable" };
  }

  return {
    outcome: "organisation",
    domain,
    derivedName: deriveName(domain),
    kind: inferKind(domain),
  };
}
