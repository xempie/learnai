import { describe, expect, it } from "vitest";
import { registrableDomain } from "../domain";

describe("registrableDomain", () => {
  const valid: Array<[label: string, host: string, expected: string]> = [
    ["spec example: student subdomain", "mail.student.mq.edu.au", "mq.edu.au"],
    ["spec example: marketing subdomain", "marketing.acme.com.au", "acme.com.au"],
    ["bare registrable domain", "mq.edu.au", "mq.edu.au"],
    [".edu (non-AU)", "monash.edu", "monash.edu"],
    [".gov (non-AU)", "usa.gov", "usa.gov"],
    ["deep subdomain chain", "a.b.c.acme.com.au", "acme.com.au"],
    ["uppercase host", "MAIL.STUDENT.MQ.EDU.AU", "mq.edu.au"],
  ];

  it.each(valid)("%s", (_label, host, expected) => {
    expect(registrableDomain(host)).toBe(expected);
  });

  const invalid: Array<[label: string, host: string]> = [
    ["IPv4 literal", "192.168.1.1"],
    ["bracketed IPv4 literal", "[192.168.1.1]"],
    ["single-label host", "localhost"],
    ["empty host", ""],
    ["unrecognised public suffix", "example.invalidtld"],
  ];

  it.each(invalid)("%s -> null", (_label, host) => {
    expect(registrableDomain(host)).toBeNull();
  });
});
