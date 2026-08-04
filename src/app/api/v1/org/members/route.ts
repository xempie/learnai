import { ApiError, decodeCursor, encodeCursor, handler, ok, parseQuery } from "@/lib/api";
import { requireAuth } from "@/lib/auth/session";
import { pageQuerySchema } from "@/lib/schemas/auth";
import { cohortCount, visibleMembers } from "@/lib/visibility";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_LIMIT = 20;

/**
 * GET /api/v1/org/members
 *
 * Opted-in members only, and only for someone inside the same organisation.
 * The filter lives in `visibleMembers()` - this route must never build its own.
 */
export const GET = handler(async (req: Request) => {
  const session = await requireAuth();

  if (!session.orgId) {
    throw new ApiError("FORBIDDEN", "You are not part of an organisation.");
  }

  const query = parseQuery(req, pageQuerySchema);
  const limit = query.limit ?? DEFAULT_LIMIT;

  const cursor = decodeCursor<{ offset?: number }>(query.cursor);
  const offset = Math.max(0, Number(cursor?.offset ?? 0));

  const rows = await visibleMembers(session.orgId, { limit, offset });
  const count = await cohortCount(session.orgId);

  return ok({
    data: rows.map((m) => ({
      id: m.id,
      nickname: m.nickname,
      avatar_key: m.avatarKey,
      is_founding_member: m.isFoundingMember,
    })),
    next_cursor: rows.length === limit ? encodeCursor({ offset: offset + limit }) : null,
    // Aggregate context, still subject to the suppression threshold.
    member_count: count.displayCount,
    suppressed: count.suppressed,
  });
});
