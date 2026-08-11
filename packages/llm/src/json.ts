/**
 * Strips a single leading/trailing markdown code fence (```` ``` ```` or
 * ```` ```json ````) if the whole trimmed response is wrapped in one.
 * Leaves anything else untouched — §12/T08 only asks for fence stripping,
 * not general JSON extraction from prose.
 */
const FENCE_RE = /^```(?:json)?\s*\n?([\s\S]*?)\n?```$/i;

export function stripFences(text: string): string {
  const trimmed = text.trim();
  const match = FENCE_RE.exec(trimmed);
  return match ? (match[1] ?? "").trim() : trimmed;
}

/** True when `text` parses as JSON after fence stripping. */
export function isValidJson(text: string): boolean {
  try {
    JSON.parse(text);
    return true;
  } catch {
    return false;
  }
}
