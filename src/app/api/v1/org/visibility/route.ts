import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { ApiError, clientIp, handler, ok, parseBody } from "@/lib/api";
import { audit, track } from "@/lib/audit";
import { requireAuth } from "@/lib/auth/session";
import { visibilitySchema } from "@/lib/schemas/auth";
import { cohortCount } from "@/lib/visibility";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/v1/org/visibility
 *
 * The ONLY writer of `users.org_visible`. It defaults to false at signup and
 * every change is audited, so "who could see me, and from when" is answerable
 * (V1_BUILD_SPEC §5.1, TECHNICAL_SPEC §7.2).
 */
export const POST = handler(async (req: Request) => {
  const session = await requireAuth();

  if (!session.orgId) {
    throw new ApiError(
      "FORBIDDEN",
      "You are not part of an organisation, so there is nothing to appear in.",
    );
  }

  const body = await parseBody(req, visibilitySchema);

  await db
    .update(users)
    .set({ orgVisible: body.visible, updatedAt: new Date() })
    .where(eq(users.id, session.id));

  await audit({
    actorId: session.id,
    action: body.visible ? "user.opt_in_org" : "user.opt_out_org",
    entityType: "organization",
    entityId: session.orgId,
    ipAddress: clientIp(req),
  });

  await track([
    {
      userId: session.id,
      event: body.visible ? "cohort_opt_in" : "cohort_opt_out",
    },
  ]);

  const count = await cohortCount(session.orgId);

  return ok({
    is_visible: body.visible,
    member_count: count.displayCount,
    suppressed: count.suppressed,
  });
});
