import { domainOf, isFreeEmailDomain, registrableDomain } from "./domain-parse";

export type ServiceInterest =
  | "workshop"
  | "advisory"
  | "pilot_sprint"
  | "training"
  | "team_platform"
  | "other";

export const SERVICE_INTERESTS = [
  "workshop",
  "advisory",
  "pilot_sprint",
  "training",
  "team_platform",
  "other",
] as const;

/** Services that are team engagements by definition (SERVICES_ACTION_PLAN §1). */
const TEAM_SERVICES: ReadonlySet<ServiceInterest> = new Set([
  "workshop",
  "advisory",
  "pilot_sprint",
  "team_platform",
]);

export interface EnquiryClassification {
  /**
   * True when this must leave the hourly funnel: a company booking delivered
   * at $120/hr is a mispriced workshop (SERVICES_ACTION_PLAN §3).
   */
  isTeam: boolean;
  orgDomain: string | null;
}

export function classifyEnquiry(input: {
  serviceInterest: ServiceInterest;
  email: string;
  teamSize?: number | null;
}): EnquiryClassification {
  const domain = domainOf(input.email);
  const orgDomain =
    domain && !isFreeEmailDomain(domain) ? registrableDomain(domain) : null;
  const isTeam =
    TEAM_SERVICES.has(input.serviceInterest) || (input.teamSize ?? 1) > 1;
  return { isTeam, orgDomain: orgDomain || null };
}
