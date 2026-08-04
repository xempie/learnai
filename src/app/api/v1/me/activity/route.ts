import { and, eq, gte, inArray, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { analyticsEvents, comments, likes, episodeProgress } from "@/db/schema";
import { handler, ok } from "@/lib/api";
import { requireAuth } from "@/lib/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/v1/me/activity - the "your last 30 days" panel on the dashboard.
 *
 * Every number is a real aggregate over the caller's own rows. The window is
 * fixed at 30 days so the four queries all hit the same time-bounded indexes.
 */

const WINDOW_DAYS = 30;

/** Events that mean "this person actually looked at a piece of content". */
const VIEW_EVENTS = ["content_opened", "post_read", "video_started"];

export const GET = handler(async () => {
  const user = await requireAuth();
  const since = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const [viewed, likesGiven, commentsPosted, daysActive] = await Promise.all([
    // Distinct pieces of content opened - not raw event count, which would
    // reward scrubbing a video back and forth.
    db
      .select({ n: sql<number>`count(distinct ${analyticsEvents.topicId})::int` })
      .from(analyticsEvents)
      .where(
        and(
          eq(analyticsEvents.userId, user.id),
          inArray(analyticsEvents.event, VIEW_EVENTS),
          gte(analyticsEvents.createdAt, since),
        ),
      ),

    db
      .select({ n: sql<number>`count(*)::int` })
      .from(likes)
      .where(and(eq(likes.userId, user.id), gte(likes.createdAt, since))),

    db
      .select({ n: sql<number>`count(*)::int` })
      .from(comments)
      .where(
        and(
          eq(comments.userId, user.id),
          ne(comments.status, "deleted"),
          gte(comments.createdAt, since),
        ),
      ),

    // Distinct calendar days with any signal at all - an analytics event or a
    // watched episode. UNION dedupes across both sources for us.
    db.execute<{ n: number }>(sql`
      select count(*)::int as n from (
        select date_trunc('day', ${analyticsEvents.createdAt}) as d
          from ${analyticsEvents}
         where ${analyticsEvents.userId} = ${user.id}::uuid
           and ${analyticsEvents.createdAt} >= ${since.toISOString()}::timestamptz
        union
        select date_trunc('day', ${episodeProgress.lastWatchedAt}) as d
          from ${episodeProgress}
         where ${episodeProgress.userId} = ${user.id}::uuid
           and ${episodeProgress.lastWatchedAt} >= ${since.toISOString()}::timestamptz
      ) days
    `),
  ]);

  const episodesCompleted = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(episodeProgress)
    .where(
      and(
        eq(episodeProgress.userId, user.id),
        eq(episodeProgress.completed, true),
        gte(episodeProgress.lastWatchedAt, since),
      ),
    );

  return ok({
    window_days: WINDOW_DAYS,
    since: since.toISOString(),
    items_viewed: viewed[0]?.n ?? 0,
    episodes_completed: episodesCompleted[0]?.n ?? 0,
    likes_given: likesGiven[0]?.n ?? 0,
    comments_posted: commentsPosted[0]?.n ?? 0,
    days_active: Number(daysActive[0]?.n ?? 0),
  });
});
