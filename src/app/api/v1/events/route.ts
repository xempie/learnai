import { clientIp, handler, ok, parseBody, rateLimit } from "@/lib/api";
import { CLIENT_EVENTS, track } from "@/lib/audit";
import { getCurrentUser } from "@/lib/auth/session";
import { eventBatchSchema } from "@/lib/schemas/engagement";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/v1/events - batched client analytics (V1_BUILD_SPEC §5.3).
 *
 * Auth is optional: an anonymous visitor's feed impressions are still worth
 * having, they just land with a null user_id.
 *
 * Every event name is checked against CLIENT_EVENTS and unknown names are
 * DROPPED, not stored. The client must never be able to invent a name - a typo
 * or a hostile script would otherwise pollute the funnel the whole product is
 * measured on, and the table is append-only so there is no cleaning it up.
 */

const MAX_PER_CALL = 50;
const RATE_LIMIT_PER_MIN = 60;

export const POST = handler(async (req: Request) => {
  // Keyed on IP because most of this traffic is signed out.
  rateLimit(`events:${clientIp(req)}`, RATE_LIMIT_PER_MIN, 60_000);

  const input = await parseBody(req, eventBatchSchema);
  const user = await getCurrentUser();

  const accepted = input.events
    .slice(0, MAX_PER_CALL)
    .filter((e) => CLIENT_EVENTS.has(e.event));

  const rejected = input.events.length - accepted.length;

  if (accepted.length > 0) {
    await track(
      accepted.map((e) => ({
        userId: user?.id ?? null,
        sessionId: input.session_id ?? null,
        event: e.event,
        topicId: e.topic_id ?? null,
        episodeId: e.episode_id ?? null,
        categoryId: e.category_id ?? null,
        // The client clock is recorded but never used as the row timestamp -
        // `created_at` is server time, so a skewed device can't reorder history.
        metadata: e.ts ? { ...(e.metadata ?? {}), client_ts: e.ts } : e.metadata,
      })),
    );
  }

  return ok({ accepted: accepted.length, rejected }, 202);
});
