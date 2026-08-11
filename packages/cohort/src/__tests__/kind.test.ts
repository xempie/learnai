import { describe, expect, it } from "vitest";
import { inferKind, type OrganisationKind } from "../kind";

describe("inferKind", () => {
  const cases: Array<[label: string, domain: string, expected: OrganisationKind]> = [
    [".edu.au -> university", "mq.edu.au", "university"],
    [".edu (non-AU) -> university", "monash.edu", "university"],
    [".gov.au -> government", "health.nsw.gov.au", "government"],
    [".gov (non-AU) -> government", "usa.gov", "government"],
    [".org.au -> professional_body", "acs.org.au", "professional_body"],
    [".org (non-AU) -> professional_body", "example.org", "professional_body"],
    [".com.au -> corporate (default)", "acme.com.au", "corporate"],
    [".com -> corporate (default)", "acme.com", "corporate"],
    ["unparseable domain -> corporate (default)", "", "corporate"],
  ];

  it.each(cases)("%s", (_label, domain, expected) => {
    expect(inferKind(domain)).toBe(expected);
  });
});
