import { MIN_CELL, retention } from "@/db/queries/analytics";
import { handler, ok, parseQuery } from "@/lib/api";
import { requireAdmin } from "@/lib/auth/session";
import { resolveRange, retentionSchema } from "@/lib/schemas/billing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/v1/admin/analytics/retention?from=&to=
 *
 * D1 / D7 / D30 return rates by signup cohort week. Cohorts smaller than
 * MIN_CELL are suppressed - an early week with three signups would otherwise
 * publish "1 of 3 came back" about identifiable people.
 */
export const GET = handler(async (req: Request) => {
  await requireAdmin();
  const range = resolveRange(parseQuery(req, retentionSchema));
  const data = await retention(range);

  return ok({
    range: { from: range.from.toISOString(), to: range.to.toISOString() },
    min_cell_size: MIN_CELL,
    suppressed_count: data.filter((c) => c.suppressed).length,
    data,
  });
});
