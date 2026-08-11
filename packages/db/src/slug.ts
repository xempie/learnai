// Section 4.1: "slug = slugify(name), deduplicated." Shared by cohort
// assignment (cohort-assignment.ts, T05 — new organisations created on
// signup) and the T06 admin rename endpoint (apps/web
// `PATCH /api/v1/admin/organisations/:id`, section 4.1's last line:
// "Auto-created organisations... surfaced in an admin queue for Vala to
// rename"), which re-derives an organisation's slug from its (possibly
// renamed) name using the exact same rule so a rename never produces a
// slug that could disagree with what a fresh signup would have generated
// for that name.
//
// Diacritics are stripped by code-point range (0x0300-0x036f, the Unicode
// "Combining Diacritical Marks" block that NFKD normalisation decomposes
// accented Latin letters into) rather than a `\uXXXX` regex literal, to
// avoid depending on any tool in the authoring chain correctly round-
// tripping literal backslash-u escape sequences in source files.
const COMBINING_DIACRITICAL_MARKS_START = 0x0300;
const COMBINING_DIACRITICAL_MARKS_END = 0x036f;

function stripCombiningDiacritics(input: string): string {
  let result = "";
  for (const char of input) {
    const codePoint = char.codePointAt(0) ?? 0;
    if (
      codePoint >= COMBINING_DIACRITICAL_MARKS_START &&
      codePoint <= COMBINING_DIACRITICAL_MARKS_END
    ) {
      continue;
    }
    result += char;
  }
  return result;
}

export function slugify(name: string): string {
  const base = stripCombiningDiacritics(name.normalize("NFKD"))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base.length > 0 ? base : "org";
}
