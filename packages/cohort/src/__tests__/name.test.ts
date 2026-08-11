import { describe, expect, it } from "vitest";
import { deriveName } from "../name";

describe("deriveName", () => {
  const cases: Array<[label: string, domain: string, expected: string]> = [
    ["spec example", "mq.edu.au", "Mq"],
    ["single-label .com.au domain", "acme.com.au", "Acme"],
    ["hyphenated label splits into words", "acme-innovations.com.au", "Acme Innovations"],
    ["hyphenated .edu domain", "new-college.edu", "New College"],
    ["mixed-case input is title-cased", "MQ.EDU.AU", "Mq"],
    ["no recognised suffix falls back to raw input", "mq", "Mq"],
    ["empty input degrades to empty string", "", ""],
  ];

  it.each(cases)("%s", (_label, domain, expected) => {
    expect(deriveName(domain)).toBe(expected);
  });
});
