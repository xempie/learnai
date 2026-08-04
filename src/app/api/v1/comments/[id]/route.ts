import { and, eq, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { comments, topics } from "@/db/schema";
import { ApiError, clientIp, handler, ok } from "@/lib/api";
import { audit } from "@/lib/audit";
import { isAdminRole, requireAuth } from "@/lib/auth/session";
import { config } from "@/lib/config";
import { requireUuidParam } from "@/lib/schemas/engagement";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * DELETE /api/v1/comments/:id
 *
 * Soft delete - the row stays for moderation history and report resolution
 * (TECHNICAL_SPEC §9.2). Only the author or an admin may do it, and the
 * topic's denormalised counter is decremented in the same transaction.
 */
export const DELETE = handler(
  async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
    if (!config.flags.comments) {
      throw new ApiError("NOT_CONFIGURED", "Comments are turned off right now.");
    }

    const { id } = await ctx.params;
    const commentId = requireUuidParam(id, "comment");
    const user = await requireAuth();

    const existing = await db.query.comments.findFirst({
      where: eq(comments.id, commentId),
      columns: { id: true, userId: true, topicId: true, status: true },
    });
    if (!existing || existing.status === "deleted") {
      throw new ApiError("NOT_FOUND", "That comment does not exist.");
    }

    const isOwn = existing.userId === user.id;
    if (!isOwn && !isAdminRole(user.role)) {
      throw new ApiError("FORBIDDEN", "You can only delete your own comments.");
    }

    const result = await db.transaction(async (tx) => {
      // The `status <> 'deleted'` guard makes a double DELETE idempotent rather
      // than decrementing the counter twice.
      const updated = await tx
        .update(comments)
        .set({ status: "deleted", updatedAt: new Date() })
        .where(and(eq(comments.id, commentId), ne(comments.status, "deleted")))
        .returning({ id: comments.id });

      if (updated.length === 0) return { changed: false, commentCount: null as number | null };

      // A hidden comment was already excluded from the counter by moderation,
      // so only a visible one decrements it.
      const decrement = existing.status === "visible";
      if (!decrement) return { changed: true, commentCount: null as number | null };

      const [row] = await tx
        .update(topics)
        .set({
          commentCount: sql`greatest(${topics.commentCount} - 1, 0)`,
          updatedAt: new Date(),
        })
        .where(eq(topics.id, existing.topicId))
        .returning({ commentCount: topics.commentCount });

      return { changed: true, commentCount: row?.commentCount ?? 0 };
    });

    if (result.changed) {
      await audit({
        actorId: user.id,
        action: isOwn ? "comment.delete_own" : "comment.delete_moderated",
        entityType: "comment",
        entityId: commentId,
        metadata: { topicId: existing.topicId },
        ipAddress: clientIp(req),
      });
    }

    return ok({ deleted: true, comment_count: result.commentCount });
  },
);
