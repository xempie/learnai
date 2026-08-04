import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { bookmarks, topics } from "@/db/schema";
import { handler, ok } from "@/lib/api";
import { requireAuth } from "@/lib/auth/session";
import { track } from "@/lib/audit";
import { loadEngageableTopic, requireUuidParam } from "@/lib/schemas/engagement";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/v1/topics/:id/bookmark - toggle.
 * Same contract as `like`: row + denormalised counter in one transaction.
 */
export const POST = handler(
  async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const { id } = await ctx.params;
    const topicId = requireUuidParam(id, "topic");
    const user = await requireAuth();
    await loadEngageableTopic(topicId);

    const result = await db.transaction(async (tx) => {
      const existing = await tx
        .select({ userId: bookmarks.userId })
        .from(bookmarks)
        .where(and(eq(bookmarks.userId, user.id), eq(bookmarks.topicId, topicId)))
        .limit(1);

      if (existing.length > 0) {
        await tx
          .delete(bookmarks)
          .where(and(eq(bookmarks.userId, user.id), eq(bookmarks.topicId, topicId)));
        const [row] = await tx
          .update(topics)
          .set({
            bookmarkCount: sql`greatest(${topics.bookmarkCount} - 1, 0)`,
            updatedAt: new Date(),
          })
          .where(eq(topics.id, topicId))
          .returning({ bookmarkCount: topics.bookmarkCount });
        return { bookmarked: false, bookmarkCount: row?.bookmarkCount ?? 0 };
      }

      await tx
        .insert(bookmarks)
        .values({ userId: user.id, topicId })
        .onConflictDoNothing();
      const [row] = await tx
        .update(topics)
        .set({ bookmarkCount: sql`${topics.bookmarkCount} + 1`, updatedAt: new Date() })
        .where(eq(topics.id, topicId))
        .returning({ bookmarkCount: topics.bookmarkCount });
      return { bookmarked: true, bookmarkCount: row?.bookmarkCount ?? 1 };
    });

    await track([
      {
        userId: user.id,
        event: result.bookmarked ? "bookmark_added" : "bookmark_removed",
        topicId,
      },
    ]);

    return ok({ bookmarked: result.bookmarked, bookmark_count: result.bookmarkCount });
  },
);
