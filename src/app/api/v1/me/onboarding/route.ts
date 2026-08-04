import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { categories, userCategories, users } from "@/db/schema";
import { ApiError, clientIp, handler, ok, parseBody } from "@/lib/api";
import { audit } from "@/lib/audit";
import { requireAuth } from "@/lib/auth/session";
import { onboardingSchema } from "@/lib/schemas/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/v1/me/onboarding
 *
 * Exactly three categories, stored with their rank so the feed can weight the
 * first pick above the third (V1_BUILD_SPEC §4.2). Ids must reference active
 * categories - a stale or disabled id is a 422, not a silently dropped pick.
 */
export const POST = handler(async (req: Request) => {
  const session = await requireAuth();
  const body = await parseBody(req, onboardingSchema);

  const found = await db
    .select({ id: categories.id })
    .from(categories)
    .where(and(inArray(categories.id, body.categoryIds), eq(categories.isActive, true)));

  if (found.length !== 3) {
    throw new ApiError("VALIDATION_FAILED", "Choose exactly three available categories.", {
      categoryIds: "One or more categories are unavailable.",
    });
  }

  const now = new Date();

  await db.transaction(async (tx) => {
    await tx.delete(userCategories).where(eq(userCategories.userId, session.id));
    await tx.insert(userCategories).values(
      body.categoryIds.map((categoryId, i) => ({
        userId: session.id,
        categoryId,
        rank: i + 1,
      })),
    );
    await tx
      .update(users)
      .set({
        avatarKey: body.avatarKey,
        // Re-running onboarding must not reset the original completion time.
        onboardedAt: session.onboardedAt ?? now,
        updatedAt: now,
      })
      .where(eq(users.id, session.id));
  });

  await audit({
    actorId: session.id,
    action: "user.onboarded",
    entityType: "user",
    entityId: session.id,
    metadata: { categoryIds: body.categoryIds },
    ipAddress: clientIp(req),
  });

  const picks = await db
    .select({
      id: categories.id,
      slug: categories.slug,
      name: categories.name,
      color_hex: categories.colorHex,
      rank: userCategories.rank,
    })
    .from(userCategories)
    .innerJoin(categories, eq(categories.id, userCategories.categoryId))
    .where(eq(userCategories.userId, session.id))
    .orderBy(userCategories.rank);

  return ok({
    onboarded: true,
    avatar_key: body.avatarKey,
    categories: picks,
  });
});
