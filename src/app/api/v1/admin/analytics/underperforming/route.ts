import { MIN_IMPRESSIONS, underperforming } from "@/db/queries/analytics";
import { handler, ok } from "@/lib/api";
import { requireAdmin } from "@/lib/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/v1/admin/analytics/underperforming
 *
 * The ten published items with the worst open rate (views / impressions) among
 * those with enough impressions to be meaningful. More actionable than the
 * top-content table: these are the thumbnails and titles worth rewriting.
 *
 * Lifetime counters by design - a thumbnail nobody clicks is not a date-range
 * problem - so this endpoint ignores ?from/&to.
 */
export const GET = handler(async () => {
  await requireAdmin();
  const data = await underperforming(10);

  return ok({
    min_impressions: MIN_IMPRESSIONS,
    basis: "lifetime",
    data,
  });
});
