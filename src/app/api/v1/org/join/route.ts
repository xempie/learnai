import { clientIp, handler, ok, parseBody, rateLimit } from "@/lib/api";
import { requireAuth } from "@/lib/auth/session";
import { redeemJoinCode } from "@/lib/org-codes";
import { joinCodeSchema } from "@/lib/schemas/auth";
import { cohortCount } from "@/lib/visibility";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/v1/org/join
 *
 * Redeems an organisation join code. Rate limited per account as well as per IP:
 * codes are short, so brute force is the obvious attack.
 */
export const POST = handler(async (req: Request) => {
  const session = await requireAuth();
  rateLimit(`org-join:${session.id}`, 5, 60_000);
  rateLimit(`org-join-ip:${clientIp(req)}`, 10, 60_000);

  const body = await parseBody(req, joinCodeSchema);

  const org = await redeemJoinCode(session.id, body.code, { ipAddress: clientIp(req) });
  const count = await cohortCount(org.id);

  return ok({
    organization: {
      id: org.id,
      name: org.name,
      type: org.type,
      member_count: count.displayCount,
      suppressed: count.suppressed,
      // Joining never opts anyone into the member list; that stays a separate,
      // explicit action.
      is_visible: session.orgVisible,
      is_founding_member: org.isFoundingMember,
    },
  });
});
