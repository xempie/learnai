import { categoryPerformance } from "@/db/queries/analytics";
import { handler, ok, parseQuery } from "@/lib/api";
import { requireAdmin } from "@/lib/auth/session";
import { dateRangeSchema, resolveRange } from "@/lib/schemas/billing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/v1/admin/analytics/categories?from=&to=
 * Content count, total views and average views per item, per category - the
 * signal for what to commission next.
 */
export const GET = handler(async (req: Request) => {
  await requireAdmin();
  const range = resolveRange(parseQuery(req, dateRangeSchema));
  const data = await categoryPerformance(range);

  return ok({
    range: { from: range.from.toISOString(), to: range.to.toISOString() },
    data,
  });
});
