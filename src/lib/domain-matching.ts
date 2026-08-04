import "server-only";

import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { organizationDomains, organizations, users } from "@/db/schema";
import { config } from "@/lib/config";
import {
  domainOf,
  inferOrgType,
  isFreeEmailDomain,
  organisationNameFromDomain,
  registrableDomain,
} from "./domain-parse";

/**
 * Email-domain -> organisation matching (TECHNICAL_SPEC §7.1).
 *
 * Runs ONLY after email verification. An unverified address must never grant
 * access to an organisation's member list.
 */

export interface DomainMatch {
  orgId: string | null;
  isFoundingMember: boolean;
  /** True when this call created a provisional organisation. */
  createdOrg: boolean;
  reason: "free_domain" | "exact" | "parent" | "provisional";
}

/** Pure parsing helpers live in domain-parse.ts so they are unit-testable. */
export {
  domainOf,
  inferOrgType,
  isFreeEmailDomain,
  normaliseEmail,
  organisationNameFromDomain,
  registrableDomain,
} from "./domain-parse";

async function uniqueSlug(base: string): Promise<string> {
  const root =
    base
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "org";

  for (let i = 0; i < 50; i++) {
    const candidate = i === 0 ? root : `${root}-${i + 1}`;
    const existing = await db.query.organizations.findFirst({
      where: eq(organizations.slug, candidate),
      columns: { id: true },
    });
    if (!existing) return candidate;
  }
  return `${root}-${Date.now().toString(36)}`;
}

/**
 * Resolves the organisation for a verified email address, creating a provisional
 * one when the domain is unknown so the user gets a cohort immediately.
 */
export async function matchOrganisation(email: string): Promise<DomainMatch> {
  const domain = domainOf(email);

  // 2. Consumer domains stay solo. A normal state, not an error.
  if (!domain || isFreeEmailDomain(domain)) {
    return { orgId: null, isFoundingMember: false, createdOrg: false, reason: "free_domain" };
  }

  // 3a. Exact match.
  const exact = await db.query.organizationDomains.findFirst({
    where: eq(organizationDomains.domain, domain),
  });
  if (exact) {
    return {
      orgId: exact.orgId,
      isFoundingMember: await isWithinFoundingLimit(exact.orgId),
      createdOrg: false,
      reason: "exact",
    };
  }

  // 3b. Registrable parent domain (student.adelaide.edu.au -> adelaide.edu.au).
  const parent = registrableDomain(domain);
  if (parent && parent !== domain) {
    const parentRow = await db.query.organizationDomains.findFirst({
      where: eq(organizationDomains.domain, parent),
    });
    if (parentRow) {
      // Remember the subdomain so the next lookup is an exact hit.
      await db
        .insert(organizationDomains)
        .values({ orgId: parentRow.orgId, domain, verified: false })
        .onConflictDoNothing();
      return {
        orgId: parentRow.orgId,
        isFoundingMember: await isWithinFoundingLimit(parentRow.orgId),
        createdOrg: false,
        reason: "parent",
      };
    }
  }

  // 3c. Create a provisional organisation, keyed on the registrable domain so
  //     student.x.edu.au and staff.x.edu.au land in the same cohort.
  const orgDomain = parent || domain;
  const name = organisationNameFromDomain(orgDomain);
  const slug = await uniqueSlug(name);

  const [org] = await db
    .insert(organizations)
    .values({
      name,
      slug,
      type: inferOrgType(orgDomain),
      isProvisional: true,
    })
    .returning({ id: organizations.id });

  await db
    .insert(organizationDomains)
    .values({ orgId: org!.id, domain: orgDomain, verified: false })
    .onConflictDoNothing();

  if (orgDomain !== domain) {
    await db
      .insert(organizationDomains)
      .values({ orgId: org!.id, domain, verified: false })
      .onConflictDoNothing();
  }

  return {
    orgId: org!.id,
    isFoundingMember: true,
    createdOrg: true,
    reason: "provisional",
  };
}

/** 4. First N users in an org earn the founding-member badge. */
export async function isWithinFoundingLimit(orgId: string): Promise<boolean> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(users)
    .where(sql`${users.orgId} = ${orgId} and ${users.deletedAt} is null`);
  return (row?.count ?? 0) < config.limits.foundingMemberLimit;
}
