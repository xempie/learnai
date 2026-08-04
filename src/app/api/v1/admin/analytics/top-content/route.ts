import { topContent } from "@/db/queries/analytics";
import { handler, ok, parseQuery } from "@/lib/api";
import { requireAdmin } from "@/lib/auth/session";
import { resolveRange, topContentSchema } from "@/lib/schemas/billing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/v1/admin/analytics/top-content
 *   ?sort=views|likes|comments|bookmarks&type=&category_id=&from=&to=&limit=
 * All four counts are range-scoped, so the sort key changes the ranking rather
 * than just the column you read.
 */
export const GET = handler(async (req: Request) => {
  await requireAdmin();
  const query = parseQuery(req, topContentSchema);
  const range = resolveRange(query);

  const data = await topContent({
    range,
    sort: query.sort,
    type: query.type,
    categoryId: query.category_id,
    limit: query.limit,
  });

  return ok({
    sort: query.sort,
    range: { from: range.from.toISOString(), to: range.to.toISOString() },
    filters: { type: query.type ?? null, category_id: query.category_id ?? null },
    data,
  });
});
