/**
 * GET  /api/v1/admin/categories - every category, active or not
 * POST /api/v1/admin/categories - create
 */

import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { categories } from "@/db/schema";
import { ApiError, clientIp, handler, ok, parseBody } from "@/lib/api";
import { requireAdmin } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { categoryTopicCounts, serialiseCategory, slugify } from "@/lib/topics";
import { createCategorySchema } from "@/lib/schemas/content";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = handler(async () => {
  await requireAdmin();

  const [rows, counts] = await Promise.all([
    db.select().from(categories).orderBy(asc(categories.sortOrder), asc(categories.name)),
    categoryTopicCounts(),
  ]);

  return ok({ data: rows.map((c) => serialiseCategory(c, counts.get(c.id) ?? 0)) });
});

export const POST = handler(async (req: Request) => {
  const admin = await requireAdmin();
  const input = await parseBody(req, createCategorySchema);

  const slug = slugify(input.slug ?? input.name);

  const clash = await db.query.categories.findFirst({ where: eq(categories.slug, slug) });
  if (clash) {
    throw new ApiError("CONFLICT", "A category with that slug already exists.", {
      slug: "Already in use.",
    });
  }

  const [row] = await db
    .insert(categories)
    .values({
      slug,
      name: input.name,
      description: input.description ?? null,
      colorHex: input.colorHex ?? null,
      sortOrder: input.sortOrder ?? 0,
      isActive: input.isActive ?? true,
    })
    .returning();

  if (!row) throw new ApiError("SERVER_ERROR", "Could not create the category.");

  await audit({
    actorId: admin.id,
    action: "category.created",
    entityType: "category",
    entityId: row.id,
    metadata: { slug: row.slug },
    ipAddress: clientIp(req),
  });

  return ok(serialiseCategory(row, 0), 201);
});
