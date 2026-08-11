// T03 note: extensionless specifier (not "./client.js") deliberately, even
// though the rest of this package uses the `.js`-suffixed TS-NodeNext
// idiom (see seed.ts, __tests__/*). This package's own tsconfig uses
// `moduleResolution: "bundler"`, which resolves either form — but Next.js
// (apps/web, added in T03) bundles this workspace package's *source*
// directly via Turbopack, which only resolves the extensionless form for
// an external package it isn't fully transpiling through its own
// resolver. `index.ts` is the only file apps/web ever imports from this
// package, so this is the one specifier that needs to satisfy both
// resolvers.
export { createPool, getPool, newId } from "./client";
