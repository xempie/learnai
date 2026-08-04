import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { categories, userCategories, users } from "@/db/schema";
import { ApiError, clientIp, handler, ok, parseBody } from "@/lib/api";
import { audit } from "@/lib/audit";
import { requireAuth } from "@/lib/auth/session";
import { categorySelectionSchema } from "@/lib/schemas/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function currentPicks(userId: string) {
  return db
    .select({
      id: categories.id,
      slug: categories.slug,
      name: categories.name,
      color_hex: categories.colorHex,
      rank: userCategories.rank,
    })
    .from(userCategories)
    .innerJoin(categories, eq(categories.id, userCategories.categoryId))
    .where(eq(userCategories.userId, userId))
    .orderBy(asc(userCategories.rank));
}

/** GET /api/v1/me/categories */
export const GET = handler(async () => {
  const session = await requireAuth();
  return ok({ categories: await currentPicks(session.id) });
});

/**
 * PUT /api/v1/me/categories
 *
 * Same exactly-three rule as onboarding; array order is the rank.
 */
export const PUT = handler(async (req: Request) => {
  const session = await requireAuth();
  const body = await parseBody(req, categorySelectionSchema);

  const found = await db
    .select({ id: categories.id })
    .from(categories)
    .where(and(inArray(categories.id, body.categoryIds), eq(categories.isActive, true)));

  if (found.length !== 3) {
    throw new ApiError("VALIDATION_FAILED", "Choose exactly three available categories.", {
      categoryIds: "One or more categories are unavailable.",
    });
  }

  await db.transaction(async (tx) => {
    await tx.delete(userCategories).where(eq(userCategories.userId, session.id));
    await tx.insert(userCategories).values(
      body.categoryIds.map((categoryId, i) => ({
        userId: session.id,
        categoryId,
        rank: i + 1,
      })),
    );
    await tx.update(users).set({ updatedAt: new Date() }).where(eq(users.id, session.id));
  });

  await audit({
    actorId: session.id,
    action: "user.categories_updated",
    entityType: "user",
    entityId: session.id,
    metadata: { categoryIds: body.categoryIds },
    ipAddress: clientIp(req),
  });

  return ok({ categories: await currentPicks(session.id) });
});
