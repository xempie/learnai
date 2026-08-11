import { describe, expect, it } from "vitest";
import { classifyEmail, type ClassifyEmailDeps, type ClassifyResult } from "../classify";

// This package is pure/DB-free (no dependency on @learn-ai/db), so these
// fixtures are a deliberate local copy of the values seeded by
// packages/db/src/seeds/free-mail-domains.ts and disposable-domains.ts —
// classifyEmail only ever sees plain string arrays, exactly as T05 will
// pass them in after querying the DB.
const FREE_MAIL_DOMAINS_FIXTURE = ["gmail.com", "bigpond.com.au", "outlook.com"];
const DISPOSABLE_DOMAINS_FIXTURE = ["mailinator.com", "guerrillamail.com"];

const deps: ClassifyEmailDeps = {
  freeMailDomains: FREE_MAIL_DOMAINS_FIXTURE,
  disposableDomains: DISPOSABLE_DOMAINS_FIXTURE,
};

describe("classifyEmail", () => {
  const cases: Array<[label: string, email: string, expected: ClassifyResult]> = [
    // §11: subdomains -> registrable-domain reduction, organisation outcome
    [
      "subdomain reduces to registrable domain (spec example)",
      "x@mail.student.mq.edu.au",
      {
        // No known_institutions lookup at this layer (that's T05) — this
        // is deriveName's fallback name, which the spec itself says isn't
        // good enough on its own.
        outcome: "organisation",
        domain: "mq.edu.au",
        derivedName: "Mq",
        kind: "university",
      },
    ],
    [
      "subdomain reduces to registrable domain (second spec example)",
      "x@marketing.acme.com.au",
      { outcome: "organisation", domain: "acme.com.au", derivedName: "Acme", kind: "corporate" },
    ],
    // §11: free-mail
    ["free-mail domain -> individual track", "someone@gmail.com", { outcome: "free_mail" }],
    ["free-mail domain with AU TLD", "someone@bigpond.com.au", { outcome: "free_mail" }],
    // §11: disposable
    ["disposable domain -> rejected", "someone@mailinator.com", { outcome: "disposable" }],
    // §11: .edu.au
    [
      ".edu.au -> organisation, university",
      "student@mq.edu.au",
      { outcome: "organisation", domain: "mq.edu.au", derivedName: "Mq", kind: "university" },
    ],
    // §11: .gov.au. Note: the real Public Suffix List's `gov.au` entry is a
    // plain (non-wildcard) suffix, so per the spec's own reduction rule
    // (public suffix + one label) `health.nsw.gov.au` reduces to
    // `nsw.gov.au`, not to itself — "health" is a subdomain of the "nsw"
    // registrable domain, same as "mail.student" is a subdomain of "mq" in
    // the spec's own worked example. See this task's report for the
    // consequence this has for the §4.1 known_institutions seed table
    // (T02), which keys `health.nsw.gov.au` and `education.nsw.gov.au` as
    // if they were two distinct registrable domains.
    [
      ".gov.au -> organisation, government",
      "staff@health.nsw.gov.au",
      {
        outcome: "organisation",
        domain: "nsw.gov.au",
        derivedName: "Nsw",
        kind: "government",
      },
    ],
    // §11: unicode local part
    [
      "unicode local part -> organisation",
      "üser@newco.com.au",
      { outcome: "organisation", domain: "newco.com.au", derivedName: "Newco", kind: "corporate" },
    ],
    // §11: plus-addressing
    [
      "plus-addressing -> organisation",
      "jane+newsletter@newco.com.au",
      { outcome: "organisation", domain: "newco.com.au", derivedName: "Newco", kind: "corporate" },
    ],
    [
      "plus-addressing on free mail -> individual track",
      "jane+x@gmail.com",
      { outcome: "free_mail" },
    ],
    // §11: multi-@ weirdness
    ["multi-@ -> invalid", "a@b@example.com", { outcome: "invalid" }],
    // §11: empty
    ["empty -> invalid", "", { outcome: "invalid" }],
    // §11: >254 chars
    [">254 chars -> invalid", `${"a".repeat(250)}@example.com`, { outcome: "invalid" }],
    // §11: .edu / .gov non-AU
    [
      ".edu non-AU -> organisation, university",
      "student@monash.edu",
      { outcome: "organisation", domain: "monash.edu", derivedName: "Monash", kind: "university" },
    ],
    [
      ".gov non-AU -> organisation, government",
      "staff@usa.gov",
      { outcome: "organisation", domain: "usa.gov", derivedName: "Usa", kind: "government" },
    ],
    // §11: IP-literal domain
    ["IP-literal domain -> invalid", "user@192.168.1.1", { outcome: "invalid" }],
    ["bracketed IP-literal domain -> invalid", "user@[192.168.1.1]", { outcome: "invalid" }],
    // §11: uppercase
    [
      "uppercase email -> normalised then classified",
      "USER@NEWCO.COM.AU",
      { outcome: "organisation", domain: "newco.com.au", derivedName: "Newco", kind: "corporate" },
    ],
    // §11: whitespace
    [
      "surrounding whitespace is trimmed",
      "  user@newco.com.au  ",
      { outcome: "organisation", domain: "newco.com.au", derivedName: "Newco", kind: "corporate" },
    ],
    ["internal whitespace -> invalid", "us er@newco.com.au", { outcome: "invalid" }],
    // Additional: no registrable domain (single-label host)
    ["no registrable domain -> invalid", "user@localhost", { outcome: "invalid" }],
    // Additional: professional_body kind end-to-end
    [
      ".org.au -> organisation, professional_body",
      "member@acs.org.au",
      {
        outcome: "organisation",
        domain: "acs.org.au",
        derivedName: "Acs",
        kind: "professional_body",
      },
    ],
  ];

  it.each(cases)("%s", (_label, email, expected) => {
    expect(classifyEmail(email, deps)).toEqual(expected);
  });
});
