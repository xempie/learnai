import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { topics, likes } from "@/db/schema";
import { handler, ok } from "@/lib/api";
import { requireAuth } from "@/lib/auth/session";
import { track } from "@/lib/audit";
import { loadEngageableTopic, requireUuidParam } from "@/lib/schemas/engagement";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/v1/topics/:id/like - toggle.
 *
 * The row and the denormalised `topics.like_count` move together inside one
 * transaction. The feed renders that counter on every card and never counts
 * rows, so a drifted counter is a visible bug (V1_BUILD_SPEC §2.2).
 */
export const POST = handler(
  async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const { id } = await ctx.params;
    const topicId = requireUuidParam(id, "topic");
    const user = await requireAuth();
    await loadEngageableTopic(topicId);

    const result = await db.transaction(async (tx) => {
      const existing = await tx
        .select({ userId: likes.userId })
        .from(likes)
        .where(and(eq(likes.userId, user.id), eq(likes.topicId, topicId)))
        .limit(1);

      if (existing.length > 0) {
        await tx
          .delete(likes)
          .where(and(eq(likes.userId, user.id), eq(likes.topicId, topicId)));
        const [row] = await tx
          .update(topics)
          // `greatest(..., 0)` so a double-fire can never drive the badge negative.
          .set({ likeCount: sql`greatest(${topics.likeCount} - 1, 0)`, updatedAt: new Date() })
          .where(eq(topics.id, topicId))
          .returning({ likeCount: topics.likeCount });
        return { liked: false, likeCount: row?.likeCount ?? 0 };
      }

      await tx
        .insert(likes)
        .values({ userId: user.id, topicId })
        .onConflictDoNothing();
      const [row] = await tx
        .update(topics)
        .set({ likeCount: sql`${topics.likeCount} + 1`, updatedAt: new Date() })
        .where(eq(topics.id, topicId))
        .returning({ likeCount: topics.likeCount });
      return { liked: true, likeCount: row?.likeCount ?? 1 };
    });

    await track([
      {
        userId: user.id,
        event: result.liked ? "like_added" : "like_removed",
        topicId,
      },
    ]);

    return ok({ liked: result.liked, like_count: result.likeCount });
  },
);
