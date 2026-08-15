import { describe, expect, it } from "vitest";
import { formatDate, formatEditionDate } from "./format";

describe("formatDate", () => {
  const cases: Array<{ name: string; input: string | Date; expected: string }> = [
    { name: "ISO date string", input: "2026-08-11", expected: "11 August 2026" },
    {
      name: "ISO datetime string with time component",
      input: "2026-01-01T23:59:59Z",
      expected: "1 January 2026",
    },
    {
      name: "Date instance",
      input: new Date("2026-12-25T00:00:00Z"),
      expected: "25 December 2026",
    },
    { name: "leap day", input: "2028-02-29", expected: "29 February 2028" },
    { name: "invalid string falls back gracefully", input: "not-a-date", expected: "Invalid date" },
    {
      name: "invalid Date instance falls back gracefully",
      input: new Date("nope"),
      expected: "Invalid date",
    },
  ];

  it.each(cases)("formats $name", ({ input, expected }) => {
    expect(formatDate(input)).toBe(expected);
  });
});

describe("formatEditionDate", () => {
  const cases: Array<{ name: string; input: string | Date; expected: string }> = [
    { name: "known weekday", input: "2026-08-12", expected: "Wednesday 12 August 2026" },
    { name: "another known weekday", input: "2026-08-15", expected: "Saturday 15 August 2026" },
    {
      name: "Date instance",
      input: new Date("2026-12-25T00:00:00Z"),
      expected: "Friday 25 December 2026",
    },
    { name: "invalid string falls back gracefully", input: "not-a-date", expected: "Invalid date" },
  ];

  it.each(cases)("formats $name", ({ input, expected }) => {
    expect(formatEditionDate(input)).toBe(expected);
  });
});
