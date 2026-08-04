import { eq } from "drizzle-orm";
import { db } from "@/db";
import { organizations } from "@/db/schema";
import { handler, ok } from "@/lib/api";
import { requireAuth } from "@/lib/auth/session";
import { cohortCount } from "@/lib/visibility";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/v1/org
 *
 * Aggregate only - never a member list. `member_count` is null whenever the
 * cohort is below the display threshold, because "2 people" plus one known
 * colleague identifies the other one (TECHNICAL_SPEC §7.2).
 */
export const GET = handler(async () => {
  const session = await requireAuth();

  if (!session.orgId) return ok({ organization: null });

  const org = await db.query.organizations.findFirst({
    where: eq(organizations.id, session.orgId),
    columns: { id: true, name: true, type: true, isProvisional: true },
  });
  if (!org) return ok({ organization: null });

  const count = await cohortCount(session.orgId);

  const payload = {
    id: org.id,
    name: org.name,
    type: org.type,
    is_provisional: org.isProvisional,
    member_count: count.displayCount,
    suppressed: count.suppressed,
    is_visible: session.orgVisible,
    is_founding_member: session.isFoundingMember,
  };

  // Flat fields for the header widget, plus the nested form the profile uses.
  return ok({ ...payload, organization: payload });
});
