/**
 * GET /api/v1/categories
 * Active categories with a live count of published topics.
 */

import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { categories } from "@/db/schema";
import { handler, ok } from "@/lib/api";
import { categoryTopicCounts, serialiseCategory } from "@/lib/topics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = handler(async () => {
  const [rows, counts] = await Promise.all([
    db
      .select()
      .from(categories)
      .where(eq(categories.isActive, true))
      .orderBy(asc(categories.sortOrder), asc(categories.name)),
    categoryTopicCounts(),
  ]);

  return ok({ data: rows.map((c) => serialiseCategory(c, counts.get(c.id) ?? 0)) });
});
