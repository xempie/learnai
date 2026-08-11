/* eslint-disable */
// T06 — add users.show_in_cohort. LEARN_AI_V1_BUILD_SPEC.md §4.2 / §0 rule 5.
//
// §4.2's privacy bullet says "Never show a member who has show_in_cohort =
// false" but §3.2's `users` table (as transcribed verbatim in T02's
// migration) never defines that column — the spec references it without
// defining it. Per §0 rule 5 ("if a requirement is ambiguous or looks
// wrong, stop and ask... anything touching §3 (schema)"), the T06
// controller brief resolves this explicitly: add the column via a
// reversible migration, the only sane reading of an opt-out flag the
// cohort page privacy rule depends on. Documenting the resolution here
// rather than silently patching §3.2, since the schema is otherwise a
// verbatim transcription of the spec.
//
// Default TRUE: opt-out, not opt-in — existing/future members are visible
// in their cohort's colleague activity list unless they explicitly turn it
// off (a user preference surfaced by a later task; T06 only adds the
// column and enforces it in the cohort page query).
exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE users
      ADD COLUMN show_in_cohort BOOLEAN NOT NULL DEFAULT TRUE;
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    ALTER TABLE users DROP COLUMN IF EXISTS show_in_cohort;
  `);
};
