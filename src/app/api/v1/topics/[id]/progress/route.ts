/**
 * POST /api/v1/topics/[id]/progress  { episodeId, positionSec, watchedPct }
 *
 * Upserts episode progress and keeps `enrollments.progress_pct` in step. The
 * whole thing runs in one transaction so a crash between the two writes cannot
 * leave a topic showing 100% with an incomplete episode.
 */

import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { enrollments, episodeProgress, episodes } from "@/db/schema";
import { ApiError, handler, ok, parseBody } from "@/lib/api";
import { requireAuth } from "@/lib/auth/session";
import { track } from "@/lib/audit";
import { findTopicByIdOrSlug } from "@/lib/topics";
import { progressSchema } from "@/lib/schemas/content";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Treat "watched almost all of it" as done - people skip the outro. */
const COMPLETE_AT_PCT = 90;

export const POST = handler(
  async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const { id } = await ctx.params;
    const user = await requireAuth();
    const input = await parseBody(req, progressSchema);

    const topic = await findTopicByIdOrSlug(id);
    if (!topic || topic.deletedAt) throw new ApiError("NOT_FOUND", "Topic not found.");

    const episode = await db.query.episodes.findFirst({
      where: eq(episodes.id, input.episodeId),
    });
    if (!episode || episode.topicId !== topic.id) {
      throw new ApiError("NOT_FOUND", "Episode not found.");
    }

    const now = new Date();
    const completed = input.watchedPct >= COMPLETE_AT_PCT;

    const result = await db.transaction(async (tx) => {
      await tx
        .insert(episodeProgress)
        .values({
          userId: user.id,
          episodeId: episode.id,
          positionSec: input.positionSec,
          watchedPct: input.watchedPct,
          completed,
          completedAt: completed ? now : null,
          lastWatchedAt: now,
        })
        .onConflictDoUpdate({
          target: [episodeProgress.userId, episodeProgress.episodeId],
          set: {
            positionSec: input.positionSec,
            // Progress never goes backwards - a rewatch shouldn't undo a tick.
            watchedPct: sql`greatest(${episodeProgress.watchedPct}, ${input.watchedPct})`,
            completed: sql`${episodeProgress.completed} or ${completed}`,
            completedAt: completed
              ? sql`coalesce(${episodeProgress.completedAt}, ${now})`
              : episodeProgress.completedAt,
            lastWatchedAt: now,
          },
        });

      // Recompute from the rows rather than incrementing a counter.
      const [agg] = await tx
        .select({
          total: sql<number>`count(*)::int`,
          done: sql<number>`count(*) filter (where ${episodeProgress.completed})::int`,
        })
        .from(episodes)
        .leftJoin(
          episodeProgress,
          and(
            eq(episodeProgress.episodeId, episodes.id),
            eq(episodeProgress.userId, user.id),
          ),
        )
        .where(eq(episodes.topicId, topic.id));

      const total = agg?.total ?? 0;
      const done = agg?.done ?? 0;
      const progressPct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;
      const topicCompleted = total > 0 && done >= total;

      await tx
        .insert(enrollments)
        .values({
          userId: user.id,
          topicId: topic.id,
          source: "subscription",
          progressPct,
          completedAt: topicCompleted ? now : null,
        })
        .onConflictDoUpdate({
          target: [enrollments.userId, enrollments.topicId],
          set: {
            progressPct,
            completedAt: topicCompleted
              ? sql`coalesce(${enrollments.completedAt}, ${now})`
              : enrollments.completedAt,
            updatedAt: now,
          },
        });

      return { progressPct, done, total, topicCompleted };
    });

    if (completed) {
      await track([
        {
          userId: user.id,
          event: "video_completed",
          topicId: topic.id,
          episodeId: episode.id,
          metadata: { watched_pct: input.watchedPct },
        },
      ]);
    }

    return ok({
      episode_id: episode.id,
      position_sec: input.positionSec,
      watched_pct: input.watchedPct,
      completed,
      completed_at: completed ? now.toISOString() : null,
      topic_progress_pct: result.progressPct,
      episodes_completed: result.done,
      episode_count: result.total,
      topic_completed: result.topicCompleted,
    });
  },
);
