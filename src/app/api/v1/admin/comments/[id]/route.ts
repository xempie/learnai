import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { comments, topics } from "@/db/schema";
import { ApiError, clientIp, handler, ok, parseBody } from "@/lib/api";
import { audit } from "@/lib/audit";
import { requireAdmin } from "@/lib/auth/session";
import { commentActionSchema } from "@/lib/schemas/billing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Ctx {
  params: Promise<{ id: string }>;
}

async function loadComment(id: string) {
  const [row] = await db.select().from(comments).where(eq(comments.id, id)).limit(1);
  if (!row) throw new ApiError("NOT_FOUND", "Comment not found.");
  return row;
}

/**
 * POST /api/v1/admin/comments/[id]  { action: 'hide' | 'unhide' }
 * Hiding is reversible and always audited - moderation decisions about real
 * people need a paper trail.
 */
export const POST = handler(async (req: Request, ctx: Ctx) => {
  const admin = await requireAdmin();
  const { id } = await ctx.params;
  const existing = await loadComment(id);
  const { action, reason } = await parseBody(req, commentActionSchema);

  if (existing.status === "deleted") {
    throw new ApiError("CONFLICT", "That comment has been deleted.");
  }

  const hiding = action === "hide";
  const [updated] = await db
    .update(comments)
    .set({
      status: hiding ? "hidden" : "visible",
      hiddenBy: hiding ? admin.id : null,
      hiddenAt: hiding ? new Date() : null,
      updatedAt: new Date(),
    })
    .where(eq(comments.id, id))
    .returning();

  // Keep the denormalised topic counter honest.
  await adjustTopicCommentCount(existing.topicId, hiding ? -1 : 1);

  await audit({
    actorId: admin.id,
    action: hiding ? "admin.comment_hidden" : "admin.comment_unhidden",
    entityType: "comment",
    entityId: id,
    metadata: { topic_id: existing.topicId, reason: reason ?? null },
    ipAddress: clientIp(req),
  });

  return ok({
    comment: { id, status: updated?.status ?? (hiding ? "hidden" : "visible") },
  });
});

/**
 * DELETE /api/v1/admin/comments/[id]
 * Soft delete: the row stays so reports and the audit trail still resolve, but
 * the body is never served again.
 */
export const DELETE = handler(async (req: Request, ctx: Ctx) => {
  const admin = await requireAdmin();
  const { id } = await ctx.params;
  const existing = await loadComment(id);

  if (existing.status === "deleted") {
    return ok({ comment: { id, status: "deleted" }, already_deleted: true });
  }

  await db
    .update(comments)
    .set({
      status: "deleted",
      hiddenBy: admin.id,
      hiddenAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(comments.id, id));

  if (existing.status === "visible") {
    await adjustTopicCommentCount(existing.topicId, -1);
  }

  await audit({
    actorId: admin.id,
    action: "admin.comment_deleted",
    entityType: "comment",
    entityId: id,
    metadata: { topic_id: existing.topicId, previous_status: existing.status },
    ipAddress: clientIp(req),
  });

  return ok({ comment: { id, status: "deleted" } });
});

async function adjustTopicCommentCount(topicId: string, delta: number): Promise<void> {
  await db
    .update(topics)
    .set({
      commentCount: sql`greatest(0, ${topics.commentCount} + ${delta})`,
      updatedAt: new Date(),
    })
    .where(and(eq(topics.id, topicId)));
}
