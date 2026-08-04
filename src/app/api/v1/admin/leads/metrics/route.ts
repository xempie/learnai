/**
 * GET /api/v1/admin/leads/metrics
 *
 * `by_status`: a live count per lead status, zero-filled for every status the
 * `leads_status` CHECK allows so the dashboard never has to guess a missing key
 * means zero.
 *
 * `qualified_by_month`: the last 6 calendar months (this month plus the
 * previous 5), keyed by when each lead FIRST reached 'qualified' (leads.qualified_at
 * is stamped once - see the PATCH route). Zero-filled for months with no
 * qualifications, same reasoning as db/queries/analytics.ts#timeseries: a
 * missing month should never silently read as "no data available" on a chart.
 *
 * No JS Date is bound into the SQL below - every bound value is either a plain
 * string/count or built with `now()` inside Postgres - so the postgres.js
 * ::timestamptz-cast-string rule from db/queries/analytics.ts:37-42 doesn't
 * apply here, but is kept in mind for any future range filters added to this
 * route.
 */

import { sql } from "drizzle-orm";
import { db } from "@/db";
import { leads } from "@/db/schema";
import { handler, ok } from "@/lib/api";
import { requireAdmin } from "@/lib/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LEAD_STATUSES = ["new", "contacted", "qualified", "converted", "closed"] as const;

interface QualifiedMonthRow {
  month: string;
  count: number;
}

export const GET = handler(async () => {
  await requireAdmin();

  const statusRows = await db
    .select({ status: leads.status, count: sql<number>`count(*)::int` })
    .from(leads)
    .groupBy(leads.status);

  const by_status: Record<string, number> = Object.fromEntries(
    LEAD_STATUSES.map((s) => [s, 0]),
  );
  for (const r of statusRows) by_status[r.status] = Number(r.count);

  const monthRows = await db.execute<QualifiedMonthRow & Record<string, unknown>>(sql`
    with months as (
      select to_char(gs, 'YYYY-MM') as month
      from generate_series(
        date_trunc('month', now()) - interval '5 months',
        date_trunc('month', now()),
        interval '1 month'
      ) as gs
    ),
    counts as (
      select to_char(date_trunc('month', ${leads.qualifiedAt}), 'YYYY-MM') as month,
             count(*)::int as count
      from ${leads}
      where ${leads.qualifiedAt} is not null
        and ${leads.qualifiedAt} >= date_trunc('month', now()) - interval '5 months'
      group by 1
    )
    select m.month as month, coalesce(c.count, 0)::int as count
    from months m
    left join counts c on c.month = m.month
    order by m.month asc
  `);

  const qualified_by_month: QualifiedMonthRow[] = [...monthRows].map((r) => ({
    month: String(r.month),
    count: Number(r.count),
  }));

  return ok({ by_status, qualified_by_month });
});
