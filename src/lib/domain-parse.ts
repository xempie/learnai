/**
 * Pure email-domain parsing. No database, no `server-only`, so it can be unit
 * tested directly and reused from scripts. The database half of domain matching
 * lives in `domain-matching.ts` and re-exports everything here.
 */

import { FREE_EMAIL_DOMAINS } from "./config";

/**
 * Multi-part public suffixes that must not be stripped naively - `adelaide.edu.au`
 * is the registrable domain, not `edu.au`. A trimmed Public Suffix List: the full
 * list is ~9k entries and these cover the markets in scope. Swap for the `psl`
 * package if the audience broadens.
 */
const MULTI_PART_SUFFIXES = new Set([
  "edu.au", "com.au", "net.au", "org.au", "gov.au", "asn.au", "id.au",
  "co.uk", "org.uk", "ac.uk", "gov.uk", "me.uk", "net.uk", "sch.uk",
  "co.nz", "ac.nz", "org.nz", "govt.nz", "net.nz", "school.nz",
  "com.sg", "edu.sg", "gov.sg", "org.sg",
  "co.in", "ac.in", "edu.in", "gov.in", "org.in", "net.in",
  "co.za", "ac.za", "org.za", "gov.za",
  "com.br", "edu.br", "gov.br", "org.br",
  "co.jp", "ac.jp", "or.jp", "go.jp", "ne.jp",
  "com.cn", "edu.cn", "gov.cn", "org.cn", "net.cn",
  "com.hk", "edu.hk", "gov.hk", "org.hk",
  "com.my", "edu.my", "gov.my", "org.my",
  "co.id", "ac.id", "or.id", "go.id",
  "com.mx", "edu.mx", "gob.mx", "org.mx",
  "co.kr", "ac.kr", "or.kr", "go.kr",
  "com.tr", "edu.tr", "gov.tr", "org.tr",
  "com.ar", "edu.ar", "gov.ar", "org.ar",
  "co.th", "ac.th", "go.th", "or.th",
  "com.tw", "edu.tw", "gov.tw", "org.tw",
  "com.ph", "edu.ph", "gov.ph", "org.ph",
  "com.pk", "edu.pk", "gov.pk", "org.pk",
  "com.eg", "edu.eg", "gov.eg", "org.eg",
  "co.il", "ac.il", "org.il", "gov.il",
]);

export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function domainOf(email: string): string {
  const normalised = normaliseEmail(email);
  const at = normalised.lastIndexOf("@");
  if (at === -1) return "";
  return normalised.slice(at + 1);
}

export function isFreeEmailDomain(domain: string): boolean {
  return FREE_EMAIL_DOMAINS.has(domain.toLowerCase());
}

/**
 * The registrable domain: `student.adelaide.edu.au` -> `adelaide.edu.au`,
 * `mail.company.co.uk` -> `company.co.uk`, `sub.example.com` -> `example.com`.
 */
export function registrableDomain(domain: string): string {
  const parts = domain.toLowerCase().split(".").filter(Boolean);
  if (parts.length <= 2) return parts.join(".");

  const lastTwo = parts.slice(-2).join(".");
  if (MULTI_PART_SUFFIXES.has(lastTwo)) {
    return parts.slice(-3).join(".");
  }
  return lastTwo;
}

/** "adelaide.edu.au" -> "Adelaide"; "meridian-group.com.au" -> "Meridian Group". */
export function organisationNameFromDomain(domain: string): string {
  const registrable = registrableDomain(domain);
  const label = registrable.split(".")[0] ?? registrable;
  return label
    .split(/[-_]/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export function inferOrgType(domain: string): "university" | "company" | "other" {
  // Only a whole label counts, so "education-partners.com" stays a company.
  const labels = domain.toLowerCase().split(".");
  if (labels.some((l) => l === "edu" || l === "ac" || l === "sch")) return "university";
  return "company";
}
