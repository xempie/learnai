import { describe, expect, it } from "vitest";
import { normaliseEmail } from "../email";

describe("normaliseEmail", () => {
  const valid: Array<[label: string, input: string, expected: string]> = [
    ["lowercases and trims", "  User@Example.com  ", "user@example.com"],
    ["plus-addressing", "a+b@example.com", "a+b@example.com"],
    ["unicode local part", "üser@example.com", "üser@example.com"],
    ["dotted local part", "john.doe@example.com", "john.doe@example.com"],
    ["hyphenated local part", "john-doe@example.com", "john-doe@example.com"],
    ["subdomain host", "x@mail.student.mq.edu.au", "x@mail.student.mq.edu.au"],
    ["exactly 254 chars", `${"a".repeat(242)}@example.com`, `${"a".repeat(242)}@example.com`],
  ];

  it.each(valid)("%s", (_label, input, expected) => {
    expect(normaliseEmail(input)).toBe(expected);
  });

  const invalid: Array<[label: string, input: string]> = [
    ["empty string", ""],
    ["whitespace only", "   "],
    ["no @", "userexample.com"],
    ["multiple @", "a@b@example.com"],
    ["trailing @ with no host", "user@"],
    ["internal whitespace", "us er@example.com"],
    ["leading dot in local part", ".user@example.com"],
    ["trailing dot in local part", "user.@example.com"],
    ["consecutive dots in local part", "us..er@example.com"],
    ["over 254 chars", `${"a".repeat(243)}@example.com`],
  ];

  it.each(invalid)("%s -> null", (_label, input) => {
    expect(normaliseEmail(input)).toBeNull();
  });
});
