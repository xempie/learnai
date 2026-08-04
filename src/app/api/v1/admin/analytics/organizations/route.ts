import { MIN_CELL, organizationAggregates } from "@/db/queries/analytics";
import { handler, ok, parseQuery } from "@/lib/api";
import { requireAdmin } from "@/lib/auth/session";
import { dateRangeSchema, resolveRange } from "@/lib/schemas/billing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/v1/admin/analytics/organizations?from=&to=
 *
 * COUNTS PER ORGANISATION AND NOTHING ELSE.
 *
 * No member list. No names. No individual activity. Not because the UI happens
 * not to render them, but because `organizationAggregates()` cannot produce
 * them - see the privacy contract at the top of src/db/queries/analytics.ts.
 *
 * Organisations with fewer than MIN_CELL learners come back with every count
 * nulled and `suppressed: true`: at that size an aggregate plus one known
 * colleague identifies a specific person.
 */
export const GET = handler(async (req: Request) => {
  await requireAdmin();
  const range = resolveRange(parseQuery(req, dateRangeSchema));
  const data = await organizationAggregates(range);

  return ok({
    range: { from: range.from.toISOString(), to: range.to.toISOString() },
    min_cell_size: MIN_CELL,
    suppressed_count: data.filter((o) => o.suppressed).length,
    data,
  });
});
