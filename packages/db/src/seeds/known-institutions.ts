// §4.1 known-institutions table — the 10-row list verbatim from
// LEARN_AI_V1_BUILD_SPEC.md §4.1. Cohort assignment (T05) consults this to
// resolve a proper organisation name/kind before falling back to
// deriveName()/inferKind().
export interface KnownInstitution {
  domain: string;
  name: string;
  kind: "university" | "professional_body" | "government";
}

export const KNOWN_INSTITUTIONS: readonly KnownInstitution[] = [
  { domain: "mq.edu.au", name: "Macquarie University", kind: "university" },
  { domain: "adelaide.edu.au", name: "The University of Adelaide", kind: "university" },
  { domain: "acs.org.au", name: "Australian Computer Society", kind: "professional_body" },
  { domain: "unsw.edu.au", name: "UNSW Sydney", kind: "university" },
  { domain: "sydney.edu.au", name: "The University of Sydney", kind: "university" },
  { domain: "unimelb.edu.au", name: "The University of Melbourne", kind: "university" },
  { domain: "monash.edu", name: "Monash University", kind: "university" },
  { domain: "uts.edu.au", name: "University of Technology Sydney", kind: "university" },
  { domain: "health.nsw.gov.au", name: "NSW Health", kind: "government" },
  { domain: "education.nsw.gov.au", name: "NSW Department of Education", kind: "government" },
];
