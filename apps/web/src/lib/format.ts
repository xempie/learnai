/**
 * Formats an ISO-8601 date (or Date) into an Australian-English display
 * string, e.g. "11 August 2026". Returns "Invalid date" for unparseable
 * input rather than throwing, since this is used directly in UI copy.
 */
export function formatDate(input: string | Date): string {
  const date = typeof input === "string" ? new Date(input) : input;

  if (Number.isNaN(date.getTime())) {
    return "Invalid date";
  }

  return new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

/**
 * Formats an ISO-8601 date (or Date) with a leading weekday, e.g.
 * "Tuesday 12 August 2026" — the daily brief masthead's edition date
 * treatment (spec §4/§7 PWA visual requirements). Same "Invalid date"
 * fallback as `formatDate`.
 */
export function formatEditionDate(input: string | Date): string {
  const date = typeof input === "string" ? new Date(input) : input;

  if (Number.isNaN(date.getTime())) {
    return "Invalid date";
  }

  return new Intl.DateTimeFormat("en-AU", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}
