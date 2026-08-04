/**
 * POST /api/v1/admin/categories/[id]/merge  { targetCategoryId }
 *
 * Moves every `topic_categories` and `user_categories` row from the source to
 * the target, then deactivates the source. Both tables are keyed on
 * (owner, category_id), so a row that would collide is dropped rather than
 * inserted - the owner already has the target and a duplicate is meaningless.
 *
 * The source is deactivated, not deleted: a hard delete would cascade and lose
 * the evidence that the merge happened.
 */

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { categories, topicCategories, userCategories } from "@/db/schema";
import { ApiError, clientIp, handler, ok, parseBody } from "@/lib/api";
import { requireAdmin } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { categoryTopicCounts, serialiseCategory } from "@/lib/topics";
import { mergeCategorySchema } from "@/lib/schemas/content";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = handler(
  async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const admin = await requireAdmin();
    const { id } = await ctx.params;
    const { targetCategoryId } = await parseBody(req, mergeCategorySchema);

    if (id === targetCategoryId) {
      throw new ApiError("BAD_REQUEST", "A category cannot be merged into itself.");
    }

    const [source, target] = await Promise.all([
      db.query.categories.findFirst({ where: eq(categories.id, id) }),
      db.query.categories.findFirst({ where: eq(categories.id, targetCategoryId) }),
    ]);
    if (!source) throw new ApiError("NOT_FOUND", "Source category not found.");
    if (!target) {
      throw new ApiError("NOT_FOUND", "Target category not found.", {
        targetCategoryId: "Unknown category.",
      });
    }

    const result = await db.transaction(async (tx) => {
      /* ---- topics ---- */
      const [srcTopics, tgtTopics] = await Promise.all([
        tx
          .select({ topicId: topicCategories.topicId })
          .from(topicCategories)
          .where(eq(topicCategories.categoryId, source.id)),
        tx
          .select({ topicId: topicCategories.topicId })
          .from(topicCategories)
          .where(eq(topicCategories.categoryId, target.id)),
      ]);

      const alreadyTagged = new Set(tgtTopics.map((r) => r.topicId));
      const topicsToMove = srcTopics.filter((r) => !alreadyTagged.has(r.topicId));
      if (topicsToMove.length > 0) {
        await tx
          .insert(topicCategories)
          .values(
            topicsToMove.map((r) => ({ topicId: r.topicId, categoryId: target.id })),
          )
          .onConflictDoNothing();
      }
      await tx.delete(topicCategories).where(eq(topicCategories.categoryId, source.id));

      /* ---- user interests (rank 1-3 is preserved) ---- */
      const [srcUsers, tgtUsers] = await Promise.all([
        tx
          .select({ userId: userCategories.userId, rank: userCategories.rank })
          .from(userCategories)
          .where(eq(userCategories.categoryId, source.id)),
        tx
          .select({ userId: userCategories.userId })
          .from(userCategories)
          .where(eq(userCategories.categoryId, target.id)),
      ]);

      const alreadyPicked = new Set(tgtUsers.map((r) => r.userId));
      const usersToMove = srcUsers.filter((r) => !alreadyPicked.has(r.userId));
      if (usersToMove.length > 0) {
        await tx
          .insert(userCategories)
          .values(
            usersToMove.map((r) => ({
              userId: r.userId,
              categoryId: target.id,
              rank: r.rank,
            })),
          )
          .onConflictDoNothing();
      }
      await tx.delete(userCategories).where(eq(userCategories.categoryId, source.id));

      /* ---- retire the source ---- */
      const [deactivated] = await tx
        .update(categories)
        .set({ isActive: false, updatedAt: new Date() })
        .where(eq(categories.id, source.id))
        .returning();

      return {
        deactivated,
        topicsMoved: topicsToMove.length,
        topicsSkipped: srcTopics.length - topicsToMove.length,
        usersMoved: usersToMove.length,
        usersSkipped: srcUsers.length - usersToMove.length,
      };
    });

    await audit({
      actorId: admin.id,
      action: "category.merged",
      entityType: "category",
      entityId: source.id,
      metadata: {
        target_category_id: target.id,
        topics_moved: result.topicsMoved,
        topics_skipped: result.topicsSkipped,
        users_moved: result.usersMoved,
        users_skipped: result.usersSkipped,
      },
      ipAddress: clientIp(req),
    });

    const counts = await categoryTopicCounts();

    return ok({
      source: serialiseCategory(result.deactivated ?? source, counts.get(source.id) ?? 0),
      target: serialiseCategory(target, counts.get(target.id) ?? 0),
      topics_moved: result.topicsMoved,
      topics_skipped: result.topicsSkipped,
      users_moved: result.usersMoved,
      users_skipped: result.usersSkipped,
    });
  },
);
