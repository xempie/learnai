// T03 note: extensionless specifier (not "./client.js") deliberately, even
// though the rest of this package uses the `.js`-suffixed TS-NodeNext
// idiom (see seed.ts, __tests__/*). This package's own tsconfig uses
// `moduleResolution: "bundler"`, which resolves either form — but Next.js
// (apps/web, added in T03) bundles this workspace package's *source*
// directly via Turbopack, which only resolves the extensionless form for
// an external package it isn't fully transpiling through its own
// resolver. `index.ts` is the only file apps/web ever imports from this
// package, so this is the one specifier that needs to satisfy both
// resolvers — and (T05) the same rule now applies transitively to every
// file index.ts re-exports from (cohort-assignment.ts's own "./client"
// import), since Turbopack follows the whole chain, not just the entry
// point.
export { createPool, getPool, newId } from "./client";
export { assignCohort } from "./cohort-assignment";
export type { CohortAssignment } from "./cohort-assignment";
export { slugify } from "./slug";
// Re-exported so apps/web can type a `Pool` parameter (e.g. T06's admin
// rename endpoint, test helpers) without depending on "pg" directly —
// apps/web has no "pg"/"@types/pg" of its own; resolving `Pool`'s type
// through this package (which does) keeps that dependency internal to
// @learn-ai/db, same boundary as every other pg-aware symbol here.
export type { Pool } from "pg";
