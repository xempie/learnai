import { timeseries } from "@/db/queries/analytics";
import { handler, ok, parseQuery } from "@/lib/api";
import { requireAdmin } from "@/lib/auth/session";
import { resolveRange, timeseriesSchema } from "@/lib/schemas/billing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/v1/admin/analytics/timeseries?metric=views|registrations&from=&to=
 * Daily buckets, zero-filled so a flat line means "no activity", not "no data".
 */
export const GET = handler(async (req: Request) => {
  await requireAdmin();
  const query = parseQuery(req, timeseriesSchema);
  const range = resolveRange(query);
  const data = await timeseries(query.metric, range);

  return ok({
    metric: query.metric,
    range: { from: range.from.toISOString(), to: range.to.toISOString() },
    data,
  });
});
