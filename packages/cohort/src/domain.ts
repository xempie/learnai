import { parse } from "tldts";

// §4.1 step 3: "Reduce host to registrable domain using the Public Suffix
// List." We use `tldts` (actively maintained, ships its own PSL snapshot)
// instead of hand-rolling suffix matching — that's the whole point of using
// a real PSL library: `mail.student.mq.edu.au` -> `mq.edu.au` and
// `marketing.acme.com.au` -> `acme.com.au` fall out of the library's ICANN
// section lookup for free.

/**
 * Reduce a hostname to its registrable domain (public suffix + one label)
 * using the Public Suffix List. Returns `null` when the host has no
 * registrable domain: IP literals, bare single-label hosts (`localhost`),
 * and hosts under a suffix that isn't a recognised ICANN public suffix
 * (fabricated/unregistered TLDs) are all treated as invalid — a signup
 * email can't belong to an organisation domain that doesn't really exist.
 */
export function registrableDomain(host: string): string | null {
  const parsed = parse(host, { validateHostname: true });

  if (!parsed.domain || !parsed.isIcann) {
    return null;
  }

  return parsed.domain;
}
