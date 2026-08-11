// §4.1 step 1: "Normalise: lowercase, trim. Reject if not RFC-5322 valid."
//
// This is a *pragmatic* RFC 5322 approximation, not a full grammar
// implementation: it accepts the unquoted dot-atom form of the local part
// (letters/digits/marks from any script plus the common atext punctuation,
// dot-separated with no leading/trailing/consecutive dots — the form every
// real-world mailbox uses, including plus-addressing) and rejects quoted
// strings, comments, and folding whitespace. That's a deliberate scope cut:
// nobody signs up for a newsletter with `"john doe"@example.com`, and
// supporting the full grammar would balloon the regex without changing any
// real classification outcome.
const LOCAL_PART_ATEXT = "\\p{L}\\p{N}!#$%&'*+/=?^_`{|}~-";
const LOCAL_PART_RE = new RegExp(`^[${LOCAL_PART_ATEXT}]+(?:\\.[${LOCAL_PART_ATEXT}]+)*$`, "u");

// RFC 5321 §4.5.3.1.3 caps the total reverse-path (mailbox) length at 254
// octets. We reject above that rather than trying to be lenient — the spec's
// own test matrix calls out ">254 chars" as a required rejection case.
const MAX_EMAIL_LENGTH = 254;

/**
 * Normalise a raw email address per §4.1 step 1: lowercase, trim, and
 * validate against a pragmatic RFC-5322 shape (dot-atom local part, exactly
 * one '@', non-empty host). Returns the normalised address, or `null` if it
 * is not RFC-5322-reasonable — callers (§4.1 step 5 onward, and this
 * package's `classifyEmail`) treat `null` as an invalid signup.
 *
 * This function does NOT validate the domain beyond "non-empty" — domain
 * resolvability (public-suffix membership, IP literals, etc.) is
 * `registrableDomain`'s job, so `normaliseEmail` stays cheap and the two
 * concerns (address shape vs. domain validity) stay independently testable.
 */
export function normaliseEmail(rawEmail: string): string | null {
  const trimmed = rawEmail.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_EMAIL_LENGTH) {
    return null;
  }

  // Reject multi-@ weirdness (`a@b@example.com`) and no-@ input up front —
  // splitting on the first/last '@' would silently "fix" malformed input
  // instead of rejecting it.
  const atCount = trimmed.split("@").length - 1;
  if (atCount !== 1) {
    return null;
  }

  const lower = trimmed.toLowerCase();
  const atIndex = lower.indexOf("@");
  const localPart = lower.slice(0, atIndex);
  const host = lower.slice(atIndex + 1);

  if (host.length === 0) {
    return null;
  }
  if (!LOCAL_PART_RE.test(localPart)) {
    return null;
  }

  return lower;
}
