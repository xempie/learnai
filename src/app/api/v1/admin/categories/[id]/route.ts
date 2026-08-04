/**
 * GET    /api/v1/admin/categories/[id]
 * PATCH  /api/v1/admin/categories/[id]  - rename, colour, sortOrder, isActive
 * DELETE /api/v1/admin/categories/[id]  - only when nothing references it
 *
 * A category that topics or users point at is never hard-deleted: dropping it
 * would cascade rows out of `topic_categories` / `user_categories` and silently
 * change what people see. Use merge, or set `isActive: false`.
 */

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { categories, topicCategories, userCategories } from "@/db/schema";
import { ApiError, clientIp, handler, noContent, ok, parseBody } from "@/lib/api";
import { requireAdmin } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { categoryTopicCounts, serialiseCategory } from "@/lib/topics";
import { updateCategorySchema } from "@/lib/schemas/content";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

async function categoryOr404(id: string) {
  const row = await db.query.categories.findFirst({ where: eq(categories.id, id) });
  if (!row) throw new ApiError("NOT_FOUND", "Category not found.");
  return row;
}

export const GET = handler(async (_req: Request, ctx: Ctx) => {
  await requireAdmin();
  const { id } = await ctx.params;
  const row = await categoryOr404(id);
  const counts = await categoryTopicCounts();
  return ok(serialiseCategory(row, counts.get(row.id) ?? 0));
});

export const PATCH = handler(async (req: Request, ctx: Ctx) => {
  const admin = await requireAdmin();
  const { id } = await ctx.params;
  const existing = await categoryOr404(id);
  const input = await parseBody(req, updateCategorySchema);

  const patch: Partial<typeof categories.$inferInsert> = { updatedAt: new Date() };
  if (input.name !== undefined) patch.name = input.name;
  if (input.description !== undefined) patch.description = input.description ?? null;
  if (input.colorHex !== undefined) patch.colorHex = input.colorHex ?? null;
  if (input.sortOrder !== undefined) patch.sortOrder = input.sortOrder;
  if (input.isActive !== undefined) patch.isActive = input.isActive;
  // The slug is a stable identifier used in URLs and saved filters; renaming a
  // category deliberately does not move it.

  const [row] = await db
    .update(categories)
    .set(patch)
    .where(eq(categories.id, existing.id))
    .returning();
  if (!row) throw new ApiError("NOT_FOUND", "Category not found.");

  await audit({
    actorId: admin.id,
    action: "category.updated",
    entityType: "category",
    entityId: row.id,
    metadata: { fields: Object.keys(input) },
    ipAddress: clientIp(req),
  });

  const counts = await categoryTopicCounts();
  return ok(serialiseCategory(row, counts.get(row.id) ?? 0));
});

export const DELETE = handler(async (req: Request, ctx: Ctx) => {
  const admin = await requireAdmin();
  const { id } = await ctx.params;
  const existing = await categoryOr404(id);

  const [topicRefs, userRefs] = await Promise.all([
    db
      .select({ topicId: topicCategories.topicId })
      .from(topicCategories)
      .where(eq(topicCategories.categoryId, existing.id))
      .limit(1),
    db
      .select({ userId: userCategories.userId })
      .from(userCategories)
      .where(eq(userCategories.categoryId, existing.id))
      .limit(1),
  ]);

  if (topicRefs.length > 0 || userRefs.length > 0) {
    throw new ApiError(
      "CONFLICT",
      "This category is in use. Merge it into another category or deactivate it instead.",
      {
        has_topics: topicRefs.length > 0,
        has_users: userRefs.length > 0,
      },
    );
  }

  await db.delete(categories).where(eq(categories.id, existing.id));

  await audit({
    actorId: admin.id,
    action: "category.deleted",
    entityType: "category",
    entityId: existing.id,
    metadata: { slug: existing.slug },
    ipAddress: clientIp(req),
  });

  return noContent();
});
