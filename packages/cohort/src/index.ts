// @learn-ai/cohort — §4.1 cohort-assignment pure layer (T04).
//
// Everything here is a pure function with no DB imports: no Postgres
// client, no `@learn-ai/db` dependency, nothing that requires a live
// connection. T05 (cohort assignment on signup) imports this package to do
// the actual find-or-create against `organisations`/`organisation_domains`
// using the values these functions compute.
export { normaliseEmail } from "./email";
export { registrableDomain } from "./domain";
export { deriveName } from "./name";
export { inferKind } from "./kind";
export type { OrganisationKind, KnownInstitution } from "./kind";
export { classifyEmail } from "./classify";
export type { ClassifyResult, ClassifyEmailDeps } from "./classify";
